import numpy as np
from typing import List, Dict, Any, Tuple
import lightgbm as lgb


class DiffuseFanBifurcation:
    """Генератор облака (fan + bifurcation) на основе Безье-центральной линии."""

    @staticmethod
    def _bezier(P0, P1, P2, P3, t):
        t = np.asarray(t).reshape(-1, 1)
        B = (1 - t) ** 3 * P0 + 3 * (1 - t) ** 2 * t * P1 + 3 * (1 - t) * t ** 2 * P2 + t ** 3 * P3
        dB = -3 * (1 - t) ** 2 * P0 + (3 * (1 - t) ** 2 - 6 * (1 - t) * t) * P1 + (6 * (1 - t) * t - 3 * t ** 2) * P2 + 3 * t ** 2 * P3
        return B, dB

    @staticmethod
    def _build_centerline(p0: Tuple[float, float], p1: Tuple[float, float], slope: float = 0.0, alpha: float = 0.25, n: int = 200):
        x0, y0 = p0
        x1, y1 = p1
        h = alpha * (x1 - x0)
        P0 = np.array([x0, y0])
        P1 = np.array([x0 + h, y0 + slope * h])
        P2 = np.array([x1 - h, y1 - slope * h])
        P3 = np.array([x1, y1])
        t = np.linspace(0, 1, n)
        B, dB = DiffuseFanBifurcation._bezier(P0, P1, P2, P3, t)
        theta = np.arctan2(dB[:, 1], dB[:, 0])
        return B, theta, t

    @staticmethod
    def _scatter_cloud(centerline, theta, t, sigma_base, t0_ms, t1_ms, mode='sqrt',
                       anisotropy=(0.35, 1.0), samples_per_step=80, fade_pow=0.85, seed=123):
        rng = np.random.default_rng(seed)
        points: List[Dict[str, Any]] = []
        for i in range(len(t)):
            tau = float(t[i])
            cx, cy = centerline[i]
            if mode == 'sqrt':
                s = sigma_base * np.sqrt(tau)
            elif mode == 'linear':
                s = sigma_base * (0.25 + 0.75 * tau)
            else:
                s = sigma_base
            sig_par = anisotropy[0] * s
            sig_perp = anisotropy[1] * s
            ang = theta[i]
            ca, sa = np.cos(ang), np.sin(ang)
            R = np.array([[ca, -sa], [sa, ca]])
            a0 = max(0.0, 0.95 * (1.0 - tau ** fade_pow))
            U = rng.normal(0, sig_par, size=samples_per_step)
            V = rng.normal(0, sig_perp, size=samples_per_step)
            P = np.vstack([U, V]).T @ R.T
            yy = cy + P[:, 1]
            t_ms = t0_ms + tau * (t1_ms - t0_ms)
            for k in range(samples_per_step):
                points.append({'t': int(t_ms), 'p': float(yy[k]), 'a': float(np.clip(a0 * rng.uniform(0.7, 1.0), 0, 1))})
        return points

    @staticmethod
    def generate(last_ts_ms: int, p0: float, horizon_steps: int, dt_ms: int, pred_price: float, atr_value: float, params=None):
        if params is None:
            params = {}
        t0 = int(last_ts_ms)
        t1 = int(last_ts_ms + horizon_steps * dt_ms)
        slope_recent = float(params.get('slope_recent', 0.0))
        width_k = float(params.get('k_atr', 1.0))
        width_base = width_k * float(atr_value)
        mode = params.get('spread_mode', 'sqrt')
        anis = tuple(params.get('anisotropy', (0.35, 1.0)))
        bif_frac = float(params.get('bifurcate_at', 0.7))
        bif_angle_deg = float(params.get('bif_angle_deg', 16.0))
        bif_gain = float(params.get('bif_gain', 1.0))
        samples_per_step = int(params.get('samples_per_step', 70))
        steps = int(params.get('steps', 180))
        seed = int(params.get('seed', 1234))

        C, Th, T = DiffuseFanBifurcation._build_centerline((0.0, p0), (1.0, pred_price), slope=slope_recent, alpha=0.25, n=steps)
        cloud = DiffuseFanBifurcation._scatter_cloud(C, Th, T, sigma_base=width_base, t0_ms=t0, t1_ms=t1,
                                                     mode=mode, anisotropy=anis, samples_per_step=samples_per_step, seed=seed)

        idx = np.searchsorted(T, bif_frac)
        Tb = T[idx:]
        L = 1.0 - T[idx]
        off = bif_gain * L * width_base * 3.0
        ang = Th[-1]
        ang_u = ang + np.deg2rad(bif_angle_deg)
        ang_d = ang - np.deg2rad(bif_angle_deg)
        p_end_u = (1.0, pred_price + off * np.sin(ang_u))
        p_end_d = (1.0, pred_price + off * np.sin(ang_d))

        Cu, Thu, Tu = DiffuseFanBifurcation._build_centerline(tuple(C[idx]), p_end_u, slope=slope_recent, alpha=0.18, n=len(Tb))
        Cd, Thd, Td = DiffuseFanBifurcation._build_centerline(tuple(C[idx]), p_end_d, slope=slope_recent, alpha=0.18, n=len(Tb))

        Tu0 = (Tu - Tu[0]) / (Tu[-1] - Tu[0])
        Td0 = (Td - Td[0]) / (Td[-1] - Td[0])
        cloud += DiffuseFanBifurcation._scatter_cloud(Cu, Thu, Tu0, sigma_base=0.8 * width_base,
                                                      t0_ms=t0 + int(bif_frac * (t1 - t0)), t1_ms=t1,
                                                      mode='linear', anisotropy=(max(0.2, anis[0]-0.05), anis[1]),
                                                      samples_per_step=max(40, samples_per_step-10), seed=seed + 1)
        cloud += DiffuseFanBifurcation._scatter_cloud(Cd, Thd, Td0, sigma_base=0.8 * width_base,
                                                      t0_ms=t0 + int(bif_frac * (t1 - t0)), t1_ms=t1,
                                                      mode='linear', anisotropy=(max(0.2, anis[0]-0.05), anis[1]),
                                                      samples_per_step=max(40, samples_per_step-10), seed=seed + 2)

        centerline = [{'t': int(t0 + float(tau) * (t1 - t0)), 'p': float(C[i, 1])} for i, tau in enumerate(T)]
        return {'centerline': centerline, 'cloud': cloud}


def quantile_band(y_lo: np.ndarray, y_md: np.ndarray, y_hi: np.ndarray, t0_ms: int, dt_ms: int) -> Dict[str, Any]:
    """Формирует коридор из предсказаний квантили как облако точек и медианную центр-линию."""
    n = len(y_md)
    centerline = []
    cloud: List[Dict[str, Any]] = []
    for i in range(n):
        ts = int(t0_ms + (i + 1) * dt_ms)
        centerline.append({'t': ts, 'p': float(y_md[i])})
        band_points = np.linspace(y_lo[i], y_hi[i], 25)
        for p in band_points:
            cloud.append({'t': ts, 'p': float(p), 'a': 0.2})
    return {'centerline': centerline, 'cloud': cloud}


# ---------- Квантильная регрессия LightGBM для прогноза коридора ----------
def fit_lgb_quantile(X_train: np.ndarray, y_train: np.ndarray, X_val: np.ndarray, y_val: np.ndarray, alpha: float):
    params = dict(
        objective='quantile',
        alpha=alpha,
        learning_rate=0.03,
        num_leaves=64,
        min_data_in_leaf=60,
        feature_fraction=0.9,
        bagging_fraction=0.9,
        bagging_freq=1,
        num_boost_round=4000
    )
    dtrain = lgb.Dataset(X_train, label=y_train)
    dval = lgb.Dataset(X_val, label=y_val)
    model = lgb.train(params, dtrain, valid_sets=[dval], early_stopping_rounds=200, verbose_eval=False)
    return model


def _build_lag_matrix(close: np.ndarray, lookback: int = 30) -> Tuple[np.ndarray, np.ndarray]:
    X_list: List[np.ndarray] = []
    y_list: List[float] = []
    for i in range(lookback, len(close)):
        X_list.append(close[i - lookback:i])
        y_list.append(close[i])
    X = np.stack(X_list).astype(np.float32)
    y = np.array(y_list, dtype=np.float32)
    return X, y


def generate_quantile_cloud_from_close(close: np.ndarray, last_ts_ms: int, dt_ms: int, horizon_steps: int = 16, lookback: int = 30) -> Dict[str, Any]:
    if len(close) < lookback + 50:
        # слишком мало данных
        raise ValueError('Not enough data for quantile training')

    X, y = _build_lag_matrix(close, lookback)
    # тайм-сплит: 80/20
    split = int(len(X) * 0.8)
    X_train, y_train = X[:split], y[:split]
    X_val, y_val = X[split:], y[split:]

    # обучаем три модели под квантили
    q05 = fit_lgb_quantile(X_train, y_train, X_val, y_val, 0.05)
    q50 = fit_lgb_quantile(X_train, y_train, X_val, y_val, 0.50)
    q95 = fit_lgb_quantile(X_train, y_train, X_val, y_val, 0.95)

    # итеративный инференс на горизонте
    hist = close[-lookback:].astype(np.float32).copy()
    y_lo, y_md, y_hi = [], [], []
    for _ in range(horizon_steps):
        X_cur = hist.reshape(1, -1)
        y_lo_step = float(q05.predict(X_cur))
        y_md_step = float(q50.predict(X_cur))
        y_hi_step = float(q95.predict(X_cur))
        y_lo.append(y_lo_step)
        y_md.append(y_md_step)
        y_hi.append(y_hi_step)
        # обновляем окно луков — используем медиану как следующий close
        hist = np.concatenate([hist[1:], np.array([y_md_step], dtype=np.float32)])

    return quantile_band(np.array(y_lo), np.array(y_md), np.array(y_hi), int(last_ts_ms), int(dt_ms))


