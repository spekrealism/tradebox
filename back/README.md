# Трейдинг Бот для Bybit

Защищенный трейдинг бот с поддержкой REST API и WebSocket подключений к Bybit Exchange.

## 🚀 Возможности

- ✅ **Rate Limiting**: Автоматическое управление лимитами запросов (600 запросов/5 сек)
- ✅ **WebSocket**: Реальное время данных через WebSocket соединения
- ✅ **REST API**: Полный набор торговых и информационных endpoints
- ✅ **Безопасность**: Helmet, CORS, rate limiting для защиты
- ✅ **TypeScript**: Полная типизация для надежности кода
- ✅ **Testnet/Mainnet**: Поддержка тестовой и основной сети

## 📋 Требования

- Node.js 18+
- npm или yarn
- Bybit API ключи (опционально для торговых операций)

## 🛠 Установка

```bash
# Установка зависимостей
npm install

# Сборка TypeScript
npm run build

# Запуск в режиме разработки
npm run dev

# Запуск в продакшн режиме
npm start
```

## ⚙️ Конфигурация

Создайте файл `.env` в корне проекта:

```env
# Bybit API конфигурация
BYBIT_API_KEY=your_api_key_here
BYBIT_API_SECRET=your_api_secret_here
BYBIT_TESTNET=true

# Сервер конфигурация
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Rate Limiting конфигурация
RATE_LIMIT_WINDOW_MS=900000          # 15 минут
RATE_LIMIT_MAX_REQUESTS=100          # 100 запросов за 15 минут
TRADING_RATE_LIMIT_WINDOW_MS=60000   # 1 минута
TRADING_RATE_LIMIT_MAX_REQUESTS=10   # 10 торговых операций в минуту

# Логирование
LOG_LEVEL=info
NODE_ENV=development
```

### Получение API ключей

1. Зарегистрируйтесь на [Bybit](https://www.bybit.com)
2. Перейдите в настройки API
3. Создайте новый API ключ с разрешениями:
   - `Contract - Orders & Positions` (для торговли)
   - `Spot & Margin Trading` (для спот торговли)
4. Для тестирования используйте [Testnet](https://testnet.bybit.com)

## 🌐 API Endpoints

### Информационные endpoints (без авторизации)

```bash
# Проверка состояния сервиса
GET /health

# Получение OHLCV данных
GET /api/ohlcv/BTCUSDT?timeframe=1h&limit=100

# Получение тикера
GET /api/ticker/BTCUSDT

# Получение книги ордеров
GET /api/orderbook/BTCUSDT?limit=25

# Список доступных рынков
GET /api/markets

# Статус WebSocket соединений
GET /api/websocket/status

# Статистика rate limiter
GET /api/stats/rate-limiter
```

### Защищенные endpoints (требуют API ключи)

```bash
# Получение баланса
GET /api/balance

# Получение открытых позиций
GET /api/positions

# Получение открытых ордеров
GET /api/orders?symbol=BTCUSDT
```

### Торговые endpoints (с дополнительным rate limiting)

```bash
# Создание ордера
POST /api/order
Content-Type: application/json
{
  "symbol": "BTCUSDT",
  "side": "buy",
  "amount": 0.001,
  "price": 45000,
  "type": "limit"
}

# Отмена ордера
DELETE /api/order/ORDER_ID
Content-Type: application/json
{
  "symbol": "BTCUSDT"
}
```

## 📡 WebSocket Подписки

Бот автоматически подключается к WebSocket и поддерживает следующие подписки:

- **Тикеры**: Реальное время цен и объемов
- **Книга ордеров**: Обновления bid/ask
- **Сделки**: Исполненные сделки
- **Позиции**: Изменения позиций (приватный канал)
- **Ордера**: Обновления ордеров (приватный канал)

## 🔒 Безопасность

### Rate Limiting

- **API Requests**: 100 запросов за 15 минут на IP
- **Trading Operations**: 10 торговых операций в минуту
- **Bybit API**: Автоматическое соблюдение лимитов (600 запросов за 5 секунд)

### Защита

- **Helmet**: Установка безопасных HTTP заголовков
- **CORS**: Контроль доступа с разных доменов
- **Input Validation**: Валидация входящих данных
- **Error Handling**: Безопасная обработка ошибок

## 📊 Мониторинг

### Health Check

```bash
curl http://localhost:3000/health
```

Ответ:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "websocket": {
    "public": true,
    "private": true
  },
  "rateLimiter": {
    "requests": 45,
    "maxRequests": 500
  },
  "testnet": true
}
```

## 🐛 Отладка

### Логи

Бот выводит подробные логи о:
- WebSocket соединениях и переподключениях
- Rate limiting статусе
- API запросах и ответах
- Ошибках и предупреждениях

### Типичные проблемы

1. **WebSocket не подключается**
   - Проверьте интернет соединение
   - Убедитесь, что используете правильный endpoint (testnet/mainnet)

2. **API ключи не работают**
   - Проверьте правильность ключей
   - Убедитесь в достаточных разрешениях
   - Проверьте, что ключи соответствуют выбранной сети (testnet/mainnet)

3. **Rate limit ошибки**
   - Уменьшите частоту запросов
   - Проверьте настройки rate limiting в конфигурации

## 📝 Пример использования

```javascript
// Пример торгового сигнала
const tradeSignal = {
  symbol: 'BTCUSDT',
  side: 'buy',
  amount: 0.001,
  price: 45000,
  type: 'limit'
};

// Отправка POST запроса для создания ордера
fetch('http://localhost:3000/api/order', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(tradeSignal)
});
```

## 🤝 Разработка

### Структура проекта

```
back/
├── src/
│   ├── api/
│   │   ├── bybit.ts              # Основной API класс
│   │   ├── bybit-websocket.ts    # WebSocket клиент
│   │   └── rate-limiter.ts       # Rate limiting
│   ├── config.ts                 # Конфигурация
│   ├── server.ts                 # Express сервер
│   └── index.ts                  # Точка входа
├── package.json
└── tsconfig.json
```

### Команды разработки

```bash
# Запуск в режиме разработки с автоперезагрузкой
npm run dev

# Сборка проекта
npm run build

# Запуск собранной версии
npm start

# Линтинг
npm run lint
```

## ⚠️ Предупреждения

- **ВСЕГДА** тестируйте на testnet перед использованием на mainnet
- **НЕ** коммитьте API ключи в репозиторий
- **ИСПОЛЬЗУЙТЕ** маленькие суммы для тестирования
- **СЛЕДИТЕ** за лимитами API и комиссиями
- **ИМЕЙТЕ** план управления рисками

## 📄 Лицензия

MIT License 