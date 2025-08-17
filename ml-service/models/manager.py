import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
import ta
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import load_model
from typing import List, Dict, Any, Tuple
from .forecast import DiffuseFanBifurcation

from .mlp import train_mlp
from .lstm import train_lstm
from .transformer import train_transformer
from . import utils


class BTCUSDTMLModel:
    def __init__(self):
        self.mlp_model = None
        self.lstm_model = None
        self.transformer_model = None
        self.feature_scaler = MinMaxScaler()
        self.price_scaler = MinMaxScaler()
        self.is_trained = False
        self.model_stats = {
            'accuracy': 0.0,
            'win_rate': 0.0,
            'sharpe_ratio': 0.0,
            'last_update': None,
        }

        # Каталог для хранения всех версий моделей
        self.models_root = os.getenv('MODELS_DIR', '../artifacts')
        os.makedirs(self.models_root, exist_ok=True)

        # Текущая директория версии модели (обновляется при обучении/загрузке)
        self.current_version_dir = utils.set_latest_version_dir(self.models_root)
        self._load_saved_models()

    # Обёртки для совместимости с существующими вызовами из app.py
    def calculate_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        return utils.calculate_technical_indicators(df)

    def create_lstm_features(self, df: pd.DataFrame, lookback: int = 60):
        return utils.create_lstm_features(df, lookback=lookback, scaler=self.price_scaler)

    def _load_saved_models(self):
        if self.current_version_dir is None:
            return
        try:
            mlp_path = os.path.join(self.current_version_dir, 'mlp_model.pkl')
            lstm_path = os.path.join(self.current_version_dir, 'lstm_model.h5')
            feat_scaler_path = os.path.join(self.current_version_dir, 'feature_scaler.pkl')
            price_scaler_path = os.path.join(self.current_version_dir, 'price_scaler.pkl')
            stats_path = os.path.join(self.current_version_dir, 'model_stats.pkl')
            transformer_path = os.path.join(self.current_version_dir, 'transformer_model.h5')

            if all(os.path.exists(p) for p in [mlp_path, lstm_path, feat_scaler_path, price_scaler_path]):
                self.mlp_model = joblib.load(mlp_path)
                self.lstm_model = load_model(lstm_path, compile=False)
                if os.path.exists(transformer_path):
                    self.transformer_model = load_model(transformer_path, compile=False)
                self.feature_scaler = joblib.load(feat_scaler_path)
                self.price_scaler = joblib.load(price_scaler_path)
                if os.path.exists(stats_path):
                    self.model_stats = joblib.load(stats_path)
                self.is_trained = True
                print(f'✅ ML модели успешно загружены из {self.current_version_dir}')
        except Exception as e:
            print(f'⚠️  Не удалось загрузить сохранённые модели: {e}')

    def train_models(self, df: pd.DataFrame):
        print(f'🛠️  Запуск обучения. Кол-во записей: {len(df)}')
        if len(df) > 0:
            print(f'   ↳ Диапазон дат: {df.index[0]} — {df.index[-1]}')

        if len(df) < 1000:
            raise ValueError(f'Недостаточно данных для обучения: {len(df)} < 1000')

        # Фичи и метки
        df = self.calculate_technical_indicators(df)
        df = df.dropna()
        labels = utils.create_labels(df)

        feature_columns = [
            'rsi', 'bb_high', 'bb_mid', 'bb_low',
            'ema_1', 'ema_20', 'ema_50', 'ema_100',
            'ema_1_20_cross', 'ema_20_50_cross', 'ema_50_100_cross', 'ema_1_50_cross',
            'ultimate_osc', 'z_score', 'volume_ratio',
        ]

        X_features = df[feature_columns].iloc[5:-5].values
        y_labels = np.array(labels)

        X_scaled = self.feature_scaler.fit_transform(X_features)

        # MLP
        mlp_max_iter = int(os.getenv('MLP_MAX_ITER', '300'))
        self.mlp_model = train_mlp(X_scaled, y_labels, max_iter=mlp_max_iter)

        # LSTM
        X_lstm, y_lstm = self.create_lstm_features(df)
        lstm_epochs = int(os.getenv('LSTM_EPOCHS', '30'))
        X_lstm = X_lstm.reshape((X_lstm.shape[0], X_lstm.shape[1], 1))
        self.lstm_model = train_lstm(X_lstm, y_lstm, epochs=lstm_epochs)

        # Transformer
        X_trans, y_trans = self.create_lstm_features(df)
        X_trans = X_trans.reshape((X_trans.shape[0], X_trans.shape[1], 1))
        self.transformer_model = train_transformer(
            X_trans,
            y_trans,
            epochs=lstm_epochs,
            d_model=64,
            num_heads=4,
            ff_dim=128,
            num_layers=2,
            dropout_rate=0.1,
        )

        # Статистика
        train_accuracy = self.mlp_model.score(X_scaled, y_labels)
        self.model_stats = {
            'accuracy': float(train_accuracy),
            'win_rate': 0.0,
            'sharpe_ratio': 0.0,
            'last_update': datetime.now().isoformat(),
        }

        # Сохранение артефактов
        version_dir = utils.create_new_version_dir(self.models_root)
        self.current_version_dir = version_dir
        try:
            joblib.dump(self.mlp_model, os.path.join(version_dir, 'mlp_model.pkl'))
            self.lstm_model.save(os.path.join(version_dir, 'lstm_model.h5'))
            self.transformer_model.save(os.path.join(version_dir, 'transformer_model.h5'))
            joblib.dump(self.feature_scaler, os.path.join(version_dir, 'feature_scaler.pkl'))
            joblib.dump(self.price_scaler, os.path.join(version_dir, 'price_scaler.pkl'))
            joblib.dump(self.model_stats, os.path.join(version_dir, 'model_stats.pkl'))

            df.to_csv(os.path.join(version_dir, 'train_dataset.csv'))

            params = {
                'feature_columns': feature_columns,
                'mlp_params': self.mlp_model.get_params(),
                'lstm_lookback': 60,
                'transformer_params': {
                    'd_model': 64,
                    'num_heads': 4,
                    'ff_dim': 128,
                    'num_layers': 2,
                },
                'stats': self.model_stats,
            }
            with open(os.path.join(version_dir, 'params.json'), 'w') as f:
                json.dump(params, f, indent=4, default=str)

            print(f'💾 Модели и артефакты сохранены в {version_dir}')
        except Exception as e:
            print(f'⚠️  Ошибка сохранения моделей: {e}')

        self.is_trained = True

    def predict(self, df: pd.DataFrame):
        if not self.is_trained:
            raise ValueError('Model is not trained yet')

        df = self.calculate_technical_indicators(df)
        df = df.dropna()
        if len(df) < 100:
            raise ValueError('Not enough data for prediction')

        feature_columns = [
            'rsi', 'bb_high', 'bb_mid', 'bb_low',
            'ema_1', 'ema_20', 'ema_50', 'ema_100',
            'ema_1_20_cross', 'ema_20_50_cross', 'ema_50_100_cross', 'ema_1_50_cross',
            'ultimate_osc', 'z_score', 'volume_ratio',
        ]
        latest_features = df[feature_columns].iloc[-1:].values
        X_scaled = self.feature_scaler.transform(latest_features)

        mlp_prediction = self.mlp_model.predict(X_scaled)[0]
        mlp_proba = self.mlp_model.predict_proba(X_scaled)[0]

        lstm_data = df['close'].tail(60).values.reshape(-1, 1)
        lstm_scaled = self.price_scaler.transform(lstm_data)
        lstm_input = lstm_scaled.reshape(1, 60, 1)
        lstm_pred_scaled = self.lstm_model.predict(lstm_input, verbose=0)
        lstm_pred = self.price_scaler.inverse_transform(lstm_pred_scaled)[0][0]

        transformer_pred = None
        if self.transformer_model is not None:
            tr_data = df['close'].tail(60).values.reshape(-1, 1)
            tr_scaled = self.price_scaler.transform(tr_data)
            tr_input = tr_scaled.reshape(1, 60, 1)
            tr_pred_scaled = self.transformer_model.predict(tr_input, verbose=0)
            transformer_pred = self.price_scaler.inverse_transform(tr_pred_scaled)[0][0]

        current_price = df['close'].iloc[-1]
        atr = ta.volatility.AverageTrueRange(
            high=df['high'].tail(14),
            low=df['low'].tail(14),
            close=df['close'].tail(14),
        ).average_true_range().iloc[-1]

        signal_map = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}
        signal = signal_map[int(mlp_prediction)]
        confidence = float(max(mlp_proba))

        stop_loss = None
        if signal == 'BUY':
            stop_loss = current_price - (2 * atr)
        elif signal == 'SELL':
            stop_loss = current_price + (2 * atr)

        return {
            'signal': signal,
            'confidence': confidence,
            'stop_loss': float(stop_loss) if stop_loss else None,
            'reasoning': f'MLP: {signal} (conf: {confidence:.2f}), LSTM pred: {lstm_pred:.2f}, Current: {current_price:.2f}',
            'timestamp': int(datetime.now().timestamp()),
            'lstm_prediction': float(lstm_pred),
            'transformer_prediction': float(transformer_pred) if transformer_pred is not None else None,
            'current_price': float(current_price),
        }

    def generate_fan_bifurcation_cloud(
        self,
        last_ts_ms: int,
        p0: float,
        horizon_steps: int,
        dt_ms: int,
        pred_price: float,
        atr_value: float,
        params: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """Строит fan-конус + бифуркацию в координатах (t, price). Возвращает dict с centerline и cloud."""
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

        res = DiffuseFanBifurcation.generate(
            last_ts_ms=t0,
            p0=p0,
            horizon_steps=horizon_steps,
            dt_ms=dt_ms,
            pred_price=pred_price,
            atr_value=float(atr_value),
            params={
                'slope_recent': slope_recent,
                'k_atr': width_k,
                'spread_mode': mode,
                'anisotropy': anis,
                'bifurcate_at': bif_frac,
                'bif_angle_deg': bif_angle_deg,
                'bif_gain': bif_gain,
                'samples_per_step': samples_per_step,
                'steps': steps,
                'seed': seed,
            }
        )
        return {'centerline': res['centerline'], 'cloud': res['cloud'], 'meta': {'k_atr': width_k, 'atr': float(atr_value), 'horizon_steps': int(horizon_steps)}}


