import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import warnings
from datetime import datetime
from model_components import BTCUSDTMLModel
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

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

@app.route('/predict_series', methods=['POST'])
def predict_series():
    try:
        data = request.json
        df = pd.DataFrame(data['ohlcv'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)

        if not ml_model.is_trained:
            return jsonify({'error': 'Model is not trained yet'}), 400

        # Рассчитываем индикаторы и готовим матрицу признаков
        df_feat = ml_model.calculate_technical_indicators(df)
        df_feat = df_feat.dropna()

        feature_columns = [
            'rsi', 'bb_high', 'bb_mid', 'bb_low',
            'ema_1', 'ema_20', 'ema_50', 'ema_100',
            'ema_1_20_cross', 'ema_20_50_cross', 'ema_50_100_cross', 'ema_1_50_cross',
            'ultimate_osc', 'z_score', 'volume_ratio'
        ]

        if len(df_feat) == 0:
            return jsonify({'series': []})

        X = df_feat[feature_columns].values
        X_scaled = ml_model.feature_scaler.transform(X)

        proba = ml_model.mlp_model.predict_proba(X_scaled)
        preds = ml_model.mlp_model.predict(X_scaled)

        signal_map = {0: 'SELL', 1: 'HOLD', 2: 'BUY'}

        # Индексы во временных метках (в миллисекундах)
        ts_ms = (df_feat.index.astype('int64') // 10**6).astype(int)

        series = []
        for i in range(len(df_feat)):
            p = proba[i]
            s = int(preds[i])
            series.append({
                'timestamp': int(ts_ms[i]),
                'probs': {
                    'SELL': float(p[0]),
                    'HOLD': float(p[1]),
                    'BUY': float(p[2])
                },
                'signal': signal_map.get(s, 'HOLD'),
                'confidence': float(max(p))
            })

        return jsonify({'series': series})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/train', methods=['POST'])
def train_model():
    try:
        data = request.json
        df = pd.DataFrame(data['ohlcv'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        print(f'➡️  Получен запрос на обучение. Размер df: {len(df)}')

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