import os
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import warnings
warnings.filterwarnings('ignore')

# ML imports
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.neural_network import MLPClassifier
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
import ta
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

class BTCUSDTMLModel:
    def __init__(self):
        self.mlp_model = None
        self.lstm_model = None
        self.feature_scaler = MinMaxScaler()
        self.price_scaler = MinMaxScaler()
        self.is_trained = False
        self.model_stats = {
            'accuracy': 0.0,
            'win_rate': 0.0,
            'sharpe_ratio': 0.0,
            'last_update': None
        }
        
    def calculate_technical_indicators(self, df):
        """
        Расчет технических индикаторов как в оригинальной модели
        """
        # RSI
        df['rsi'] = ta.momentum.RSIIndicator(close=df['close']).rsi()
        
        # Bollinger Bands
        bollinger = ta.volatility.BollingerBands(close=df['close'])
        df['bb_high'] = bollinger.bollinger_hband()
        df['bb_mid'] = bollinger.bollinger_mavg()
        df['bb_low'] = bollinger.bollinger_lband()
        
        # EMA crossovers
        df['ema_1'] = ta.trend.EMAIndicator(close=df['close'], window=1).ema_indicator()
        df['ema_20'] = ta.trend.EMAIndicator(close=df['close'], window=20).ema_indicator()
        df['ema_50'] = ta.trend.EMAIndicator(close=df['close'], window=50).ema_indicator()
        df['ema_100'] = ta.trend.EMAIndicator(close=df['close'], window=100).ema_indicator()
        
        # EMA crossover signals
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
    
    def create_lstm_features(self, df, lookback=60):
        """
        Создание данных для LSTM модели
        """
        data = df['close'].values.reshape(-1, 1)
        scaled_data = self.price_scaler.fit_transform(data)
        
        X, y = [], []
        for i in range(lookback, len(scaled_data)):
            X.append(scaled_data[i-lookback:i, 0])
            y.append(scaled_data[i, 0])
        
        return np.array(X), np.array(y)
    
    def create_labels(self, df, future_window=5, past_window=5, buy_threshold=0.02, sell_threshold=-0.02):
        """
        Создание меток как в оригинальной модели
        """
        labels = []
        
        for i in range(past_window, len(df) - future_window):
            current_price = df.iloc[i]['close']
            future_prices = df.iloc[i+1:i+future_window+1]['close']
            past_prices = df.iloc[i-past_window:i]['close']
            
            # Максимальная и минимальная цена в будущем окне
            max_future_return = (future_prices.max() - current_price) / current_price
            min_future_return = (future_prices.min() - current_price) / current_price
            
            # Определение метки
            if max_future_return > buy_threshold:
                labels.append(2)  # BUY
            elif min_future_return < sell_threshold:
                labels.append(0)  # SELL
            else:
                labels.append(1)  # HOLD
        
        return labels
    
    def train_models(self, df):
        """
        Обучение MLP и LSTM моделей
        """
        # Подготовка данных
        df = self.calculate_technical_indicators(df)
        df = df.dropna()
        
        # Создание меток
        labels = self.create_labels(df)
        
        # Подготовка признаков для MLP
        feature_columns = [
            'rsi', 'bb_high', 'bb_mid', 'bb_low',
            'ema_1', 'ema_20', 'ema_50', 'ema_100',
            'ema_1_20_cross', 'ema_20_50_cross', 'ema_50_100_cross', 'ema_1_50_cross',
            'ultimate_osc', 'z_score', 'volume_ratio'
        ]
        
        # Убираем первые и последние строки из-за окон labeling
        X_features = df[feature_columns].iloc[5:-5].values
        y_labels = np.array(labels)
        
        # Масштабирование признаков
        X_scaled = self.feature_scaler.fit_transform(X_features)
        
        # Обучение MLP
        self.mlp_model = MLPClassifier(
            hidden_layer_sizes=(100, 50, 25),
            activation='relu',
            solver='adam',
            alpha=0.001,
            batch_size='auto',
            learning_rate='constant',
            learning_rate_init=0.001,
            max_iter=1000,
            random_state=42
        )
        
        self.mlp_model.fit(X_scaled, y_labels)
        
        # Создание и обучение LSTM для предсказания цен
        X_lstm, y_lstm = self.create_lstm_features(df)
        
        self.lstm_model = Sequential([
            LSTM(50, return_sequences=True, input_shape=(X_lstm.shape[1], 1)),
            Dropout(0.2),
            LSTM(50, return_sequences=True),
            Dropout(0.2),
            LSTM(50),
            Dropout(0.2),
            Dense(1)
        ])
        
        self.lstm_model.compile(optimizer='adam', loss='mean_squared_error')
        X_lstm = X_lstm.reshape((X_lstm.shape[0], X_lstm.shape[1], 1))
        self.lstm_model.fit(X_lstm, y_lstm, epochs=100, batch_size=32, verbose=0)
        
        # Сохранение статистики
        train_accuracy = self.mlp_model.score(X_scaled, y_labels)
        self.model_stats = {
            'accuracy': train_accuracy,
            'win_rate': 0.0,  # Будет рассчитано в backtesting
            'sharpe_ratio': 0.0,  # Будет рассчитано в backtesting
            'last_update': datetime.now().isoformat()
        }
        
        self.is_trained = True
        
    def predict(self, df):
        """
        Получение прогноза от модели
        """
        if not self.is_trained:
            raise ValueError("Model is not trained yet")
        
        # Подготовка данных
        df = self.calculate_technical_indicators(df)
        df = df.dropna()
        
        if len(df) < 100:
            raise ValueError("Not enough data for prediction")
        
        # Последняя строка данных для предсказания
        feature_columns = [
            'rsi', 'bb_high', 'bb_mid', 'bb_low',
            'ema_1', 'ema_20', 'ema_50', 'ema_100',
            'ema_1_20_cross', 'ema_20_50_cross', 'ema_50_100_cross', 'ema_1_50_cross',
            'ultimate_osc', 'z_score', 'volume_ratio'
        ]
        
        latest_features = df[feature_columns].iloc[-1:].values
        X_scaled = self.feature_scaler.transform(latest_features)
        
        # MLP предсказание
        mlp_prediction = self.mlp_model.predict(X_scaled)[0]
        mlp_proba = self.mlp_model.predict_proba(X_scaled)[0]
        
        # LSTM предсказание цены
        lstm_data = df['close'].tail(60).values.reshape(-1, 1)
        lstm_scaled = self.price_scaler.transform(lstm_data)
        lstm_input = lstm_scaled.reshape(1, 60, 1)
        lstm_pred_scaled = self.lstm_model.predict(lstm_input, verbose=0)
        lstm_pred = self.price_scaler.inverse_transform(lstm_pred_scaled)[0][0]
        
        # Расчет stop-loss
        current_price = df['close'].iloc[-1]
        atr = ta.volatility.AverageTrueRange(
            high=df['high'].tail(14), 
            low=df['low'].tail(14), 
            close=df['close'].tail(14)
        ).average_true_range().iloc[-1]
        
        signal_map = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}
        signal = signal_map[mlp_prediction]
        confidence = max(mlp_proba)
        
        # Stop-loss стратегия
        stop_loss = None
        if signal == 'BUY':
            stop_loss = current_price - (2 * atr)  # 2 ATR ниже текущей цены
        elif signal == 'SELL':
            stop_loss = current_price + (2 * atr)  # 2 ATR выше текущей цены
        
        return {
            'signal': signal,
            'confidence': float(confidence),
            'stop_loss': float(stop_loss) if stop_loss else None,
            'reasoning': f'MLP: {signal} (conf: {confidence:.2f}), LSTM pred: {lstm_pred:.2f}, Current: {current_price:.2f}',
            'timestamp': int(datetime.now().timestamp()),
            'lstm_prediction': float(lstm_pred),
            'current_price': float(current_price)
        }

# Глобальная модель
ml_model = BTCUSDTMLModel()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'model_trained': ml_model.is_trained,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        
        # Преобразование данных
        df = pd.DataFrame(data['ohlcv'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        # Получение прогноза
        prediction = ml_model.predict(df)
        
        return jsonify(prediction)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/indicators', methods=['POST'])
def get_indicators():
    try:
        data = request.json
        df = pd.DataFrame(data['ohlcv'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        df = ml_model.calculate_technical_indicators(df)
        latest = df.iloc[-1]
        
        return jsonify({
            'rsi': float(latest['rsi']),
            'bollinger': {
                'upper': float(latest['bb_high']),
                'middle': float(latest['bb_mid']),
                'lower': float(latest['bb_low'])
            },
            'ema': {
                'ema1': float(latest['ema_1']),
                'ema20': float(latest['ema_20']),
                'ema50': float(latest['ema_50']),
                'ema100': float(latest['ema_100'])
            },
            'ultimateOscillator': float(latest['ultimate_osc']),
            'zScore': float(latest['z_score'])
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/train', methods=['POST'])
def train_model():
    try:
        data = request.json
        df = pd.DataFrame(data['ohlcv'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        ml_model.train_models(df)
        
        return jsonify({
            'status': 'success',
            'message': 'Model trained successfully',
            'stats': ml_model.model_stats
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stats', methods=['GET'])
def get_stats():
    return jsonify(ml_model.model_stats)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 