import os
import numpy as np
import pandas as pd
import ta


def calculate_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Расчёт технических индикаторов."""
    df = df.copy()

    # RSI
    df['rsi'] = ta.momentum.RSIIndicator(close=df['close']).rsi()

    # Bollinger Bands
    bollinger = ta.volatility.BollingerBands(close=df['close'])
    df['bb_high'] = bollinger.bollinger_hband()
    df['bb_mid'] = bollinger.bollinger_mavg()
    df['bb_low'] = bollinger.bollinger_lband()

    # EMA
    df['ema_1'] = ta.trend.EMAIndicator(close=df['close'], window=1).ema_indicator()
    df['ema_20'] = ta.trend.EMAIndicator(close=df['close'], window=20).ema_indicator()
    df['ema_50'] = ta.trend.EMAIndicator(close=df['close'], window=50).ema_indicator()
    df['ema_100'] = ta.trend.EMAIndicator(close=df['close'], window=100).ema_indicator()

    # EMA crossovers
    df['ema_1_20_cross'] = np.where(df['ema_1'] > df['ema_20'], 1, -1)
    df['ema_20_50_cross'] = np.where(df['ema_20'] > df['ema_50'], 1, -1)
    df['ema_50_100_cross'] = np.where(df['ema_50'] > df['ema_100'], 1, -1)
    df['ema_1_50_cross'] = np.where(df['ema_1'] > df['ema_50'], 1, -1)

    # Ultimate Oscillator
    df['ultimate_osc'] = ta.momentum.UltimateOscillator(
        high=df['high'], low=df['low'], close=df['close']
    ).ultimate_oscillator()

    # Z-Score (30-period rolling)
    df['z_score'] = (df['close'] - df['close'].rolling(30).mean()) / df['close'].rolling(30).std()

    # Volume indicators
    df['volume_sma'] = df['volume'].rolling(20).mean()
    df['volume_ratio'] = df['volume'] / df['volume_sma']

    return df


def create_lstm_features(prices_df: pd.DataFrame, lookback: int = 60, scaler=None):
    """Создание признаков/таргета для LSTM из столбца close."""
    data = prices_df['close'].values.reshape(-1, 1)
    if scaler is None:
        raise ValueError('Scaler is required for LSTM features')

    scaled_data = scaler.fit_transform(data)

    X, y = [], []
    for i in range(lookback, len(scaled_data)):
        X.append(scaled_data[i - lookback:i, 0])
        y.append(scaled_data[i, 0])

    return np.array(X), np.array(y)


def create_labels(df: pd.DataFrame, future_window: int = 5, past_window: int = 5,
                  buy_threshold: float = 0.02, sell_threshold: float = -0.02):
    """Генерация меток BUY/HOLD/SELL как в исходной реализации."""
    labels = []
    for i in range(past_window, len(df) - future_window):
        current_price = df.iloc[i]['close']
        future_prices = df.iloc[i + 1:i + future_window + 1]['close']
        max_future_return = (future_prices.max() - current_price) / current_price
        min_future_return = (future_prices.min() - current_price) / current_price

        if max_future_return > buy_threshold:
            labels.append(2)  # BUY
        elif min_future_return < sell_threshold:
            labels.append(0)  # SELL
        else:
            labels.append(1)  # HOLD

    return labels


def set_latest_version_dir(models_root: str):
    """Определяет последнюю сохранённую директорию модели (model-XX)."""
    version_dirs = [d for d in os.listdir(models_root) if d.startswith('model-')]
    if not version_dirs:
        return None

    def _extract_num(name: str) -> int:
        try:
            return int(name.split('-')[-1])
        except ValueError:
            return -1

    latest_dirname = max(version_dirs, key=_extract_num)
    return os.path.join(models_root, latest_dirname)


def create_new_version_dir(models_root: str):
    """Создаёт новую директорию вида model-XX и возвращает её путь."""
    version_dirs = [d for d in os.listdir(models_root) if d.startswith('model-')]
    if version_dirs:
        nums = [int(d.split('-')[-1]) for d in version_dirs if d.split('-')[-1].isdigit()]
        next_num = max(nums) + 1
    else:
        next_num = 1

    new_dirname = f'model-{next_num:02d}'
    new_dirpath = os.path.join(models_root, new_dirname)
    os.makedirs(new_dirpath, exist_ok=True)
    return new_dirpath


