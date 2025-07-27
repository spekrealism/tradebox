# 🚀 Crypto Trading Bot with ML

Automated cryptocurrency trading system with machine learning support, based on the model from [GitHub repository](https://github.com/zaid-24/Algorithmic-Trading-Model-For-BTC-USDT-Crypto-Market-).

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  React Frontend │────│  Node.js API    │────│  Python ML      │
│  (Material-UI)  │    │  (Express)      │    │  (Flask + TF)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
              ┌─────────────┐       ┌─────────────┐
              │ TimescaleDB │       │    Redis    │
              │ (History)   │       │   (Cache)   │
              └─────────────┘       └─────────────┘
```

## 🎯 Features

- **🤖 ML Trading**: MLP Classifier + LSTM for predictions
- **📊 Technical Indicators**: RSI, Bollinger Bands, EMA, Ultimate Oscillator
- **💼 Automated Trading**: Stop-loss strategies based on ATR
- **📈 Web Interface**: Modern React frontend with charts
- **🔐 Security**: Rate limiting, CORS, API keys
- **🐳 Docker**: Full containerization of all services

## 🚀 Quick Start

### 1. Cloning and Setup

```bash
git clone <your-repo>
cd crypto-trading-bot

# Create .env file for backend
cp back/.env.example back/.env
```

### 2. Environment Variables Setup

```bash
# back/.env
BYBIT_API_KEY=your_api_key_here
BYBIT_API_SECRET=your_api_secret_here
BYBIT_TESTNET=true

ML_ENABLED=true
ML_SERVICE_URL=http://ml-service:5000
ML_AUTO_TRAIN=false
ML_TRAIN_DATA_LIMIT=1000

PORT=3000
LOG_LEVEL=info
```

### 3. Running with Docker Compose

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Access to Application

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **ML Service**: http://localhost:5000

## 📱 Interface

### Dashboard
- System status and WebSocket connections
- Current BTC/USDT price
- Real-time ML predictions
- Price chart

### Trading Panel
- ML auto-trading with configurable parameters
- Manual order creation
- Balance and positions view

### ML Analysis
- Model status and metrics
- Training on new data
- Technical indicators
- Detailed predictions

### Settings
- System configuration
- ML parameters
- Connection status

## 🧠 ML Model

### Components
- **MLP Classifier**: 3 layers (100, 50, 25 neurons)
- **LSTM**: Future price prediction
- **Technical Indicators**: 15+ indicators
- **Labeling**: Future/past windows for labels

### Results (from original research)
- **Sharpe Ratio**: 1.93
- **Win Rate**: 84.02%
- **Max Drawdown**: 8.95%

## 🔧 API Endpoints

### Main
```bash
GET  /health                    # System status
GET  /api/ticker/BTCUSDT       # BTC price
GET  /api/ohlcv/BTCUSDT        # OHLCV data
```

### ML
```bash
POST /api/ml/predict           # Get prediction
POST /api/ml/train            # Train model
GET  /api/ml/health           # ML status
POST /api/ml/auto-trade       # Auto-trading
```

### Trading (requires API keys)
```bash
GET  /api/balance             # Balance
GET  /api/positions           # Positions
POST /api/order               # Create order
```

## 🛠 Development

### Local Run

```bash
# Backend
cd back
npm install
npm run dev

# Frontend
cd front
npm install
npm run dev

# ML Service
cd ml-service
pip install -r requirements.txt
python app.py
```

### Project Structure

```
├── back/                   # Node.js Backend
│   ├── src/
│   │   ├── api/           # Bybit API integration
│   │   ├── strategies/    # ML strategies
│   │   └── server.ts      # Express server
│   └── package.json
├── front/                 # React Frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Pages
│   │   └── services/      # API clients
│   └── package.json
├── ml-service/           # Python ML Service
│   ├── app.py           # Flask API
│   ├── requirements.txt
│   └── Dockerfile
└── docker-compose.yml   # Orchestration
```

## ⚠️ Security

1. **ALWAYS test on testnet** before real trading
2. **Use small amounts** for initial tests
3. **Don't commit API keys** to repository
4. **Monitor model performance**
5. **Regularly retrain** the model

## 📊 Monitoring

### Health Checks
```bash
curl http://localhost:3000/health      # Backend
curl http://localhost:5000/health      # ML Service
curl http://localhost:3001             # Frontend
```

### Logs
```bash
docker-compose logs -f backend     # Backend logs
docker-compose logs -f ml-service  # ML logs
docker-compose logs -f frontend    # Frontend logs
```

## 🤝 Development

### Adding New Indicators
1. Update `ml-service/app.py`
2. Add calculation in `calculate_technical_indicators`
3. Update interfaces in `front/src/services/api.ts`

### New Strategies
1. Create file in `back/src/strategies/`
2. Integrate with `server.ts`
3. Add UI to corresponding page

## 📄 License

MIT License

## 🔗 Links

- [Original Model](https://github.com/zaid-24/Algorithmic-Trading-Model-For-BTC-USDT-Crypto-Market-)
- [Bybit API](https://bybit-exchange.github.io/docs/)
- [Material-UI](https://mui.com/)
- [TensorFlow](https://www.tensorflow.org/)

---

**⚠️ Disclaimer**: This software is intended for educational purposes only. Cryptocurrency trading involves high risks.



# OpenAI Settings
OPENAI_ENABLED=true
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7

# Strategy Settings
PRIMARY_STRATEGY=openai
ENABLE_STRATEGY_COMPARISON=true
CONFIDENCE_THRESHOLD=0.7

## ⚠️ Important API and Rate Limit Settings

### Rate Limit Settings

To prevent IP blocking by Bybit, conservative limits are configured in the system:

- **200 requests per minute** (instead of maximum 600 requests per 5 seconds)
- **Exponential delay** when receiving rate limit errors
- **Time synchronization** with Bybit server every 5 minutes

### Main Changes for Stability

1. **OHLCV Data Scheduler**: changed from every minute to every 5 minutes
2. **Candle Limit**: reduced from 60 to 10 candles per request
3. **Delays Between Symbols**: 2 seconds between requests for different symbols
4. **Retry Logic**: automatic retries on errors with backoff

### Development Recommendations

- **Use WebSocket** for real-time data instead of REST API
- **Don't make frequent REST requests** - maximum 1 request per 3 seconds
- **Group requests** - don't make them simultaneously
- **Monitor limits** - use `/api/rate-limit` to check status

### How to Check Rate Limit Status

```bash
curl http://localhost:3000/api/rate-limit
```

Response:
```json
{
  "requests": 25,
  "maxRequests": 200,
  "remaining": 175,
  "resetTime": "2024-01-01T12:00:00Z"
}
```

### What to Do When Blocked

If you receive a `Rate limit exceeded` error:

1. **Stop all API requests** for 10 minutes
2. **Check scheduler settings** - possibly too frequent requests
3. **Increase intervals** between requests
4. **Use WebSocket** for data instead of REST API

### Monitoring

The system automatically logs:
- Number of requests per minute
- Rate limit errors
- Time synchronization with server
- WebSocket connection status