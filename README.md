 # 🚀 Crypto Trading Bot с ML

Автоматизированная система торговли криптовалютами с поддержкой машинного обучения, основанная на модели из [GitHub репозитория](https://github.com/zaid-24/Algorithmic-Trading-Model-For-BTC-USDT-Crypto-Market-).

## 🏗 Архитектура

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
              │ (История)   │       │   (Кэш)     │
              └─────────────┘       └─────────────┘
```

## 🎯 Возможности

- **🤖 ML Торговля**: MLP Classifier + LSTM для прогнозов
- **📊 Технические Индикаторы**: RSI, Bollinger Bands, EMA, Ultimate Oscillator
- **💼 Автоматическая Торговля**: Stop-loss стратегии на основе ATR
- **📈 Веб-интерфейс**: Современный React фронтенд с графиками
- **🔐 Безопасность**: Rate limiting, CORS, API ключи
- **🐳 Docker**: Полная контейнеризация всех сервисов

## 🚀 Быстрый Запуск

### 1. Клонирование и настройка

```bash
git clone <your-repo>
cd crypto-trading-bot

# Создание .env файла для бэкенда
cp back/.env.example back/.env
```

### 2. Настройка переменных окружения

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

### 3. Запуск с Docker Compose

```bash
# Запуск всех сервисов
docker-compose up -d

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

### 4. Доступ к приложению

- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **ML Service**: http://localhost:5000

## 📱 Интерфейс

### Дашборд
- Статус системы и WebSocket соединений
- Текущая цена BTC/USDT
- ML прогнозы в реальном времени
- График цен

### Торговая Панель
- ML автоторговля с настраиваемыми параметрами
- Ручное создание ордеров
- Просмотр баланса и позиций

### ML Анализ
- Статус и метрики модели
- Обучение на новых данных
- Технические индикаторы
- Детальные прогнозы

### Настройки
- Конфигурация системы
- ML параметры
- Статус соединений

## 🧠 ML Модель

### Компоненты
- **MLP Classifier**: 3 слоя (100, 50, 25 нейронов)
- **LSTM**: Предсказание будущих цен
- **Технические Индикаторы**: 15+ индикаторов
- **Labeling**: Future/past окна для меток

### Результаты (из оригинального исследования)
- **Sharpe Ratio**: 1.93
- **Win Rate**: 84.02%
- **Max Drawdown**: 8.95%

## 🔧 API Endpoints

### Основные
```bash
GET  /health                    # Статус системы
GET  /api/ticker/BTCUSDT       # Цена BTC
GET  /api/ohlcv/BTCUSDT        # OHLCV данные
```

### ML
```bash
POST /api/ml/predict           # Получить прогноз
POST /api/ml/train            # Обучить модель
GET  /api/ml/health           # Статус ML
POST /api/ml/auto-trade       # Автоторговля
```

### Торговля (требуют API ключи)
```bash
GET  /api/balance             # Баланс
GET  /api/positions           # Позиции
POST /api/order               # Создать ордер
```

## 🛠 Разработка

### Локальный запуск

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

### Структура проекта

```
├── back/                   # Node.js Backend
│   ├── src/
│   │   ├── api/           # Bybit API интеграция
│   │   ├── strategies/    # ML стратегии
│   │   └── server.ts      # Express сервер
│   └── package.json
├── front/                 # React Frontend
│   ├── src/
│   │   ├── components/    # UI компоненты
│   │   ├── pages/         # Страницы
│   │   └── services/      # API клиенты
│   └── package.json
├── ml-service/           # Python ML Service
│   ├── app.py           # Flask API
│   ├── requirements.txt
│   └── Dockerfile
└── docker-compose.yml   # Оркестрация
```

## ⚠️ Безопасность

1. **ВСЕГДА тестируйте на testnet** перед реальной торговлей
2. **Используйте маленькие суммы** для начальных тестов
3. **Не коммитьте API ключи** в репозиторий
4. **Мониторьте производительность** модели
5. **Регулярно переобучайте** модель

## 📊 Мониторинг

### Health Checks
```bash
curl http://localhost:3000/health      # Backend
curl http://localhost:5000/health      # ML Service
curl http://localhost:3001             # Frontend
```

### Логи
```bash
docker-compose logs -f backend     # Backend логи
docker-compose logs -f ml-service  # ML логи
docker-compose logs -f frontend    # Frontend логи
```

## 🤝 Разработка

### Добавление новых индикаторов
1. Обновите `ml-service/app.py`
2. Добавьте расчет в `calculate_technical_indicators`
3. Обновите интерфейсы в `front/src/services/api.ts`

### Новые стратегии
1. Создайте файл в `back/src/strategies/`
2. Интегрируйте с `server.ts`
3. Добавьте UI в соответствующую страницу

## 📄 Лицензия

MIT License

## 🔗 Ссылки

- [Оригинальная модель](https://github.com/zaid-24/Algorithmic-Trading-Model-For-BTC-USDT-Crypto-Market-)
- [Bybit API](https://bybit-exchange.github.io/docs/)
- [Material-UI](https://mui.com/)
- [TensorFlow](https://www.tensorflow.org/)

---

**⚠️ Дисклеймер**: Данное ПО предназначено только для образовательных целей. Торговля криптовалютами связана с высокими рисками.



# OpenAI настройки
OPENAI_ENABLED=true
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.7

# Настройки стратегий
PRIMARY_STRATEGY=openai
ENABLE_STRATEGY_COMPARISON=true
CONFIDENCE_THRESHOLD=0.7

## ⚠️ Важные настройки API и Rate Limit

### Настройки Rate Limit

Для предотвращения блокировки IP адреса Bybit-ом, в системе настроены консервативные лимиты:

- **200 запросов в минуту** (вместо максимальных 600 запросов в 5 секунд)
- **Экспоненциальная задержка** при получении ошибок rate limit
- **Синхронизация времени** с сервером Bybit каждые 5 минут

### Основные изменения для стабильности

1. **Планировщик OHLCV данных**: изменен с каждой минуты на каждые 5 минут
2. **Лимит свечей**: уменьшен с 60 до 10 свечей за запрос
3. **Задержки между символами**: 2 секунды между запросами разных символов
4. **Retry логика**: автоматические повторы при ошибках с backoff

### Рекомендации для разработки

- **Используйте WebSocket** для получения данных в реальном времени вместо REST API
- **Не делайте частые REST запросы** - максимум 1 запрос в 3 секунды
- **Группируйте запросы** - не делайте их одновременно
- **Мониторьте лимиты** - используйте `/api/rate-limit` для проверки состояния

### Как проверить состояние rate limit

```bash
curl http://localhost:3000/api/rate-limit
```

Ответ:
```json
{
  "requests": 25,
  "maxRequests": 200,
  "remaining": 175,
  "resetTime": "2024-01-01T12:00:00Z"
}
```

### Что делать при блокировке

Если получили ошибку `Rate limit exceeded`:

1. **Остановите все API запросы** на 10 минут
2. **Проверьте настройки планировщика** - возможно, слишком частые запросы
3. **Увеличьте интервалы** между запросами
4. **Используйте WebSocket** для получения данных вместо REST API

### Мониторинг

Система автоматически логирует:
- Количество запросов в минуту
- Ошибки rate limit
- Время синхронизации с сервером
- Состояние WebSocket подключений