# Интеграция ML Модели BTC/USDT

## Обзор
Интеграция модели алгоритмической торговли из GitHub репозитория:
https://github.com/zaid-24/Algorithmic-Trading-Model-For-BTC-USDT-Crypto-Market-

## Архитектура
- **Node.js Backend** - основной API
- **Python ML Service** - Flask API с ML моделями
- **MLP Classifier** + **LSTM** для прогнозов
- **Docker Compose** для оркестрации

## Быстрый старт

### 1. Запуск с Docker
```bash
# Запустить все сервисы
docker-compose up -d

# Проверить статус
curl http://localhost:3000/health
curl http://localhost:5000/health
```

### 2. Конфигурация (.env)
```env
ML_ENABLED=true
ML_SERVICE_URL=http://localhost:5000
ML_AUTO_TRAIN=false
ML_TRAIN_DATA_LIMIT=1000
```

## API Endpoints

### Обучение модели
```bash
POST /api/ml/train
{
  "symbol": "BTCUSDT",
  "limit": 1000
}
```

### Получение прогноза
```bash
POST /api/ml/predict
{
  "symbol": "BTCUSDT",
  "limit": 100
}
```

### Автоматическая торговля
```bash
POST /api/ml/auto-trade
{
  "symbol": "BTCUSDT",
  "amount": 0.001,
  "enableStopLoss": true
}
```

## Модель включает
- RSI, Bollinger Bands, EMA кроссоверы
- Ultimate Oscillator, Z-Score
- Stop-loss стратегия на основе ATR
- LSTM предсказание цен

## Результаты оригинальной модели
- Sharpe Ratio: 1.93
- Win Rate: 84.02%
- Max Drawdown: 8.95%

⚠️ **Важно**: Всегда тестируйте на testnet перед реальной торговлей! 