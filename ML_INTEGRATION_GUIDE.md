# ML Model Integration for BTC/USDT

## Overview
Integration of algorithmic trading model from GitHub repository:
https://github.com/zaid-24/Algorithmic-Trading-Model-For-BTC-USDT-Crypto-Market-

## Architecture
- **Node.js Backend** - main API
- **Python ML Service** - Flask API with ML models
- **MLP Classifier** + **LSTM** for predictions
- **Docker Compose** for orchestration

## Quick Start

### 1. Running with Docker
```bash
# Start all services
docker-compose up -d

# Check status
curl http://localhost:3000/health
curl http://localhost:5000/health
```

### 2. Configuration (.env)
```env
ML_ENABLED=true
ML_SERVICE_URL=http://localhost:5000
ML_AUTO_TRAIN=false
ML_TRAIN_DATA_LIMIT=1000
```

## API Endpoints

### Model Training
```bash
POST /api/ml/train
{
  "symbol": "BTCUSDT",
  "limit": 1000
}
```

### Get Prediction
```bash
POST /api/ml/predict
{
  "symbol": "BTCUSDT",
  "limit": 100
}
```

### Automatic Trading
```bash
POST /api/ml/auto-trade
{
  "symbol": "BTCUSDT",
  "amount": 0.001,
  "enableStopLoss": true
}
```

## Model Includes
- RSI, Bollinger Bands, EMA crossovers
- Ultimate Oscillator, Z-Score
- Stop-loss strategy based on ATR
- LSTM price prediction

## Original Model Results
- Sharpe Ratio: 1.93
- Win Rate: 84.02%
- Max Drawdown: 8.95%

⚠️ **Important**: Always test on testnet before real trading! 