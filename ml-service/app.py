import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import warnings
from datetime import datetime
from models.manager import BTCUSDTMLModel
from models.forecast import DiffuseFanBifurcation, generate_quantile_cloud_from_close
import numpy as np
import pandas as pd
import ta
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


@app.route('/predict_cloud', methods=['POST'])
def predict_cloud():
    try:
        data = request.json
        df = pd.DataFrame(data['ohlcv'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)

        if not ml_model.is_trained:
            return jsonify({'error': 'Model is not trained yet'}), 400

        # шаг таймфрейма
        ts_arr = ((df.index.astype('int64') // 10**6).astype(int)).values
        if len(ts_arr) < 3:
            return jsonify({'error': 'Not enough data'}), 400
        dt_ms = int(np.median(np.diff(ts_arr[-10:]))) if len(ts_arr) >= 11 else int(np.median(np.diff(ts_arr)))
        last_ts_ms = int(ts_arr[-1])

        horizon_steps = int(data.get('horizon_steps', 2))
        method = (data.get('method') or 'fan').lower()  # 'fan' | 'quantile'

        if method == 'quantile':
            # Квантильная регрессия по close
            close = df['close'].astype(float).values
            out = generate_quantile_cloud_from_close(close, last_ts_ms=last_ts_ms, dt_ms=dt_ms, horizon_steps=horizon_steps, lookback=int(data.get('lookback', 30)))
            return jsonify(out)
        else:
            # Fan + bifurcation (по умолчанию)
            pred_out = ml_model.predict(df.copy())
            pred_price = float(pred_out.get('transformer_prediction') or pred_out['lstm_prediction'])
            p0 = float(df['close'].iloc[-1])

            atr_val = ta.volatility.AverageTrueRange(
                high=df['high'].tail(14),
                low=df['low'].tail(14),
                close=df['close'].tail(14)
            ).average_true_range().iloc[-1]
            if not np.isfinite(atr_val):
                ret = np.log(df['close']).diff().tail(30).dropna()
                atr_val = float(ret.std() * p0 * np.sqrt(14))

            params = data.get('params', {})
            k = min(8, max(1, int(data.get('slope_window', 5))))
            params.setdefault('slope_recent', float(df['close'].iloc[-1] - df['close'].iloc[-k]) / max(1, k))

            out = ml_model.generate_fan_bifurcation_cloud(
                last_ts_ms=last_ts_ms,
                p0=p0,
                horizon_steps=horizon_steps,
                dt_ms=dt_ms,
                pred_price=pred_price,
                atr_value=float(atr_val),
                params=params
            )
            return jsonify(out)
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