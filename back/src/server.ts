import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import { bybitApi } from './api/bybit';
import { config } from './config';
import { MLTradingStrategy } from './strategies/ml-strategy';
import { OpenAITradingStrategy, MarketData } from './strategies/openai-strategy';
import { StrategyManager } from './strategies/strategy-manager';
import { initDb, fetchOHLCVFromDb, saveOHLCVBulk } from './db';
import { startCollector } from './jobs/ohlcv-collector';
import { botManager } from './core/bot-manager';
import type { TradingBot } from './types';

const app = express();

// Безопасность
app.disable('x-powered-by');
app.use(helmet());
// В продакшене используем same-origin через reverse proxy (CORS не нужен)
if (config.server.nodeEnv !== 'production') {
  app.use(cors({
    origin: config.server.allowedOrigins,
    credentials: true
  }));
}

// Rate limiting для API endpoints
const limiter = rateLimit({
  windowMs: config.rateLimiter.windowMs,
  max: config.rateLimiter.maxRequests,
  message: {
    error: 'Слишком много запросов с вашего IP, попробуйте позже.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Строгий rate limiting для торговых операций
const tradingLimiter = rateLimit({
  windowMs: config.rateLimiter.tradingWindowMs,
  max: config.rateLimiter.maxTradingRequests,
  message: {
    error: 'Превышен лимит торговых операций. Подождите минуту.',
    code: 'TRADING_LIMIT_EXCEEDED'
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Применяем общий rate limiter ко всем маршрутам
app.use('/api/', limiter);

// Middleware для проверки API ключей (для торговых операций)
const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!config.bybit.apiKey || !config.bybit.apiSecret) {
    return res.status(401).json({
      error: 'API ключи не настроены',
      code: 'API_KEYS_MISSING'
    });
  }
  next();
};

// Базовые маршруты

// Проверка здоровья сервиса
app.get('/health', (req, res) => {
  const wsStatus = bybitApi.getWebSocketStatus();
  const rateLimiterStats = bybitApi.getRateLimiterStats();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: wsStatus,
    rateLimiter: rateLimiterStats,
    testnet: config.bybit.testnet
  });
});

// Утилита: удаляем чувствительные поля из объекта бота перед ответом клиенту
function sanitizeBot(bot: TradingBot) {
  const { apiKey: _k, apiSecret: _s, ...safe } = bot as any;
  return safe;
}

// Информационные endpoints (только чтение)

// Получение OHLCV данных
app.get('/api/ohlcv/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1h', limit = 100 } = req.query;

    const limitNum = parseInt(limit as string) || 100;

    // 1️⃣ Пытаемся получить данные из TimescaleDB
    let ohlcv: any[] = await fetchOHLCVFromDb(symbol, timeframe as string, limitNum);

    // Функция для перевода таймфрейма в миллисекунды
    const tfToMs: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };

    const tfMs = tfToMs[timeframe as string] || 60 * 60 * 1000;

    // 2️⃣ Если данных меньше, чем limit, или последняя свеча старее одной-трёх длительностей – подтягиваем свежие данные
    const now = Date.now();
    const lastTs = ohlcv.length ? ohlcv[ohlcv.length - 1][0] : 0;

    if (ohlcv.length < limitNum || now - lastTs > tfMs * 2) {
      const since = lastTs ? lastTs + tfMs : undefined;
      const fetched = await bybitApi.fetchOHLCV(
        symbol,
        timeframe as string,
        since,
        limitNum
      );

      // Сохраняем новые свечи
      if (fetched.length) {
        try {
          const mapped = fetched.map(([ts, o, h, l, c, v]) => ({
            symbol,
            timeframe: timeframe as string,
            timestamp: Number(ts),
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(c),
            volume: Number(v),
          }));
          await saveOHLCVBulk(symbol, timeframe as string, mapped);
        } catch (dbErr) {
          console.error('❌ Ошибка сохранения OHLCV в БД:', dbErr);
        }

        // Объединяем с существующими и берём последние limitNum
        ohlcv = [...ohlcv, ...fetched].slice(-limitNum);
      }
    }

    res.json({
      success: true,
      data: ohlcv,
      symbol,
      timeframe,
      count: ohlcv.length,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_OHLCV_ERROR',
    });
  }
});

// Получение тикера
app.get('/api/ticker/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const ticker = await bybitApi.fetchTicker(symbol);
    
    res.json({
      success: true,
      data: ticker,
      symbol
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_TICKER_ERROR'
    });
  }
});

// Получение книги ордеров
app.get('/api/orderbook/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 25 } = req.query;
    
    const orderbook = await bybitApi.fetchOrderBook(symbol, parseInt(limit as string));
    
    res.json({
      success: true,
      data: orderbook,
      symbol
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_ORDERBOOK_ERROR'
    });
  }
});

// Получение списка рынков
app.get('/api/markets', async (req, res) => {
  try {
    const markets = await bybitApi.fetchMarkets();
    
    res.json({
      success: true,
      data: markets,
      count: markets.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_MARKETS_ERROR'
    });
  }
});

// Защищенные endpoints (требуют API ключи)

// Получение баланса
app.get('/api/balance', requireApiKey, async (req, res) => {
  try {
    const balance = await bybitApi.fetchBalance();
    
    res.json({
      success: true,
      data: balance
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_BALANCE_ERROR'
    });
  }
});

// Получение открытых позиций
app.get('/api/positions', requireApiKey, async (req, res) => {
  try {
    const positions = await bybitApi.fetchPositions();
    
    res.json({
      success: true,
      data: positions,
      count: positions.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_POSITIONS_ERROR'
    });
  }
});

// Получение открытых ордеров
app.get('/api/orders', requireApiKey, async (req, res) => {
  try {
    const { symbol } = req.query;
    const orders = await bybitApi.fetchOpenOrders(symbol as string);
    
    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'FETCH_ORDERS_ERROR'
    });
  }
});

// Торговые endpoints (с дополнительным rate limiting)

// Создание ордера
app.post('/api/order', tradingLimiter, requireApiKey, async (req, res) => {
  try {
    const { symbol, side, amount, price, type = 'limit' } = req.body;
    
    if (!symbol || !side || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Обязательные поля: symbol, side, amount',
        code: 'INVALID_PARAMETERS'
      });
    }

    const order = await bybitApi.createOrder({
      symbol,
      side,
      amount: parseFloat(amount),
      price: price ? parseFloat(price) : undefined,
      type
    });
    
    res.json({
      success: true,
      data: order,
      message: 'Ордер успешно создан'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CREATE_ORDER_ERROR'
    });
  }
});

// Отмена ордера
app.delete('/api/order/:orderId', tradingLimiter, requireApiKey, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Обязательное поле: symbol',
        code: 'INVALID_PARAMETERS'
      });
    }

    const order = await bybitApi.cancelOrder(orderId, symbol);
    
    res.json({
      success: true,
      data: order,
      message: 'Ордер успешно отменен'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CANCEL_ORDER_ERROR'
    });
  }
});

// WebSocket статус
app.get('/api/websocket/status', (req, res) => {
  const status = bybitApi.getWebSocketStatus();
  res.json({
    success: true,
    data: status
  });
});

// Rate limiter статистика
app.get('/api/stats/rate-limiter', (req, res) => {
  const stats = bybitApi.getRateLimiterStats();
  res.json({
    success: true,
    data: stats
  });
});

// Получение статистики rate limiter
app.get('/api/rate-limit', (req, res) => {
  const stats = bybitApi.getRateLimiterStats();
  const totalRequests = stats.httpRequests + stats.websocketRequests;
  const totalMaxRequests = stats.maxHttpRequests + stats.maxWebsocketRequests;
  const remaining = totalMaxRequests - totalRequests;

  res.json({
    success: true,
    data: {
      httpRequests: stats.httpRequests,
      maxHttpRequests: stats.maxHttpRequests,
      websocketRequests: stats.websocketRequests,
      maxWebsocketRequests: stats.maxWebsocketRequests,
      totalRequests,
      totalMaxRequests,
      remaining,
      resetTime: new Date(Date.now() + 60000).toISOString(), // Через минуту
      status: remaining > 50 ? 'OK' : remaining > 20 ? 'WARNING' : 'CRITICAL'
    }
  });
});

// Получение статуса WebSocket подключений
app.get('/api/websocket-status', (req, res) => {
  const status = bybitApi.getWebSocketStatus();
  res.json({
    success: true,
    data: {
      publicWebSocket: status.public,
      privateWebSocket: status.private,
      subscriptions: []
    }
  });
});

// ML стратегия endpoints
if (config.ml.enabled) {
  const mlStrategy = new MLTradingStrategy();

  // Получение ML прогноза
  app.post('/api/ml/predict', async (req, res) => {
    try {
      let { symbol = 'BTCUSDT', limit = 100 } = req.body;
      if (limit < 300) limit = 300; // ML модели нужно >= 300 свечей после фильтрации
      
      // Получаем исторические данные
      const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, limit);
      const currentPrice = (await bybitApi.fetchTicker(symbol)).last;
      
      const input = {
        symbol,
        ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
          timestamp: Number(timestamp),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume)
        })),
        currentPrice: Number(currentPrice)
      };
      
      const prediction = await mlStrategy.getPrediction(input);
      
      res.json({
        success: true,
        data: prediction
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ML_PREDICTION_ERROR'
      });
    }
  });

  // Получить облако прогноза для построения коридора
  app.post('/api/ml/predict-cloud', async (req, res) => {
    try {
      const { symbol = 'BTCUSDT', limit = 300, timeframe = '1h', horizon_steps = 8, params = {}, method = 'fan', lookback = 30 } = req.body;
      const ohlcv = await bybitApi.fetchOHLCV(symbol, timeframe, undefined, Math.max(300, Number(limit)));
      const inputOhlcv = ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
        timestamp: Number(timestamp),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume)
      }));
      const cloud = await mlStrategy.getPredictionCloud({ ohlcv: inputOhlcv, horizon_steps: Number(horizon_steps), params: { ...params, method, lookback } });
      res.json({ success: true, data: cloud });
    } catch (error: any) {
      // Подробный лог с телом запроса и укороченными данными, чтобы не засорять лог
      const safeBody = (() => {
        try {
          const b = { ...req.body };
          if (b && b.limit && b.limit > 0) b.limit = Number(b.limit);
          if (b && Array.isArray(b?.ohlcv)) {
            b.ohlcv = `array(${b.ohlcv.length})`;
          }
          return b;
        } catch {
          return { parseError: true };
        }
      })();
      console.error('ML_PREDICT_CLOUD_ERROR:', error?.message || error, 'payload:', safeBody);
      res.status(500).json({ success: false, error: error.message || 'ML cloud error', code: 'ML_PREDICT_CLOUD_ERROR' });
    }
  });

  // Обучение модели
  app.post('/api/ml/train', async (req, res) => {
    try {
      const { symbol = 'BTCUSDT', limit = config.ml.trainDataLimit } = req.body;
      
      // Вычисляем timestamp "since" для получения последних limit свечей
      const timeframeMs = 60 * 60 * 1000; // 1h
      const since = Date.now() - limit * timeframeMs;

      // Получаем исторические данные для обучения – последние limit свечей
      const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', since, limit);
      
      const trainData = {
        ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
          timestamp: Number(timestamp),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume)
        }))
      };
      
      // Отправляем запрос на обучение в ML сервис
      const axios = require('axios');
      const response = await axios.post(`${config.ml.serviceUrl}/train`, trainData);
      
      res.json({
        success: true,
        data: response.data,
        message: 'Модель успешно обучена'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ML_TRAINING_ERROR'
      });
    }
  });

  // Получение технических индикаторов
  app.post('/api/ml/indicators', async (req, res) => {
    try {
      let { symbol = 'BTCUSDT', limit = 100 } = req.body;
      if (limit < 300) limit = 300;
      
      const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, limit);
      const currentPrice = (await bybitApi.fetchTicker(symbol)).last;
      
      const input = {
        symbol,
        ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
          timestamp: Number(timestamp),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume)
        })),
        currentPrice: Number(currentPrice)
      };
      
      const indicators = await mlStrategy.getTechnicalIndicators(input);
      
      res.json({
        success: true,
        data: indicators
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ML_INDICATORS_ERROR'
      });
    }
  });

  // Статус ML сервиса
  app.get('/api/ml/health', async (req, res) => {
    try {
      const isHealthy = await mlStrategy.healthCheck();
      const stats = await mlStrategy.getModelStats();
      
      res.json({
        success: true,
        data: {
          healthy: isHealthy,
          stats: stats,
          enabled: config.ml.enabled
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ML_HEALTH_ERROR'
      });
    }
  });

  // Автоматическая торговля на основе ML
  app.post('/api/ml/auto-trade', tradingLimiter, requireApiKey, async (req, res) => {
    try {
      const { symbol = 'BTCUSDT', amount, enableStopLoss = true } = req.body;
      
      if (!amount) {
        return res.status(400).json({
          success: false,
          error: 'Обязательное поле: amount',
          code: 'INVALID_PARAMETERS'
        });
      }

      // Получаем прогноз
      const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, 300);
      const currentPrice = (await bybitApi.fetchTicker(symbol)).last;
      
             const input = {
         symbol,
         ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
           timestamp: Number(timestamp),
           open: Number(open),
           high: Number(high),
           low: Number(low),
           close: Number(close),
           volume: Number(volume)
         })),
         currentPrice: Number(currentPrice)
       };
      
      const prediction = await mlStrategy.getPrediction(input);
      
      // Проверяем, нужно ли торговать
      if (prediction.signal === 'HOLD' || prediction.confidence < 0.7) {
        return res.json({
          success: true,
          action: 'no_trade',
          data: {
            prediction,
            reason: 'Низкая уверенность или сигнал HOLD'
          }
        });
      }

      // Создаем ордер
      const side = prediction.signal === 'BUY' ? 'buy' : 'sell';
      const order = await bybitApi.createOrder({
        symbol,
        side,
        amount: parseFloat(amount),
        type: 'market'
      });

      // Устанавливаем stop-loss если включен
      let stopLossOrder = null;
      if (enableStopLoss && prediction.stopLoss) {
        const stopSide = side === 'buy' ? 'sell' : 'buy';
        stopLossOrder = await bybitApi.createOrder({
          symbol,
          side: stopSide,
          amount: parseFloat(amount),
          price: prediction.stopLoss,
          type: 'limit'
        });
      }
      
      res.json({
        success: true,
        action: 'trade_executed',
        data: {
          prediction,
          order,
          stopLossOrder
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'ML_AUTO_TRADE_ERROR'
      });
    }
  });
}

// OpenAI стратегия endpoints
if (config.openai.enabled) {
  const openaiStrategy = new OpenAITradingStrategy();

  // Получение OpenAI прогноза
  app.post('/api/openai/predict', async (req, res) => {
    try {
      const { symbol = 'BTCUSDT', limit = 100, riskTolerance = 'moderate', timeframe = '1h' } = req.body;
      
      // Получаем рыночные данные
      const ohlcv = await bybitApi.fetchOHLCV(symbol, timeframe, limit);
      const ticker = await bybitApi.fetchTicker(symbol);
      const currentPrice = Number(ticker.last);
      
      const marketData: MarketData = {
        symbol,
        currentPrice,
        ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
          timestamp: Number(timestamp),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume)
        })),
        technicalIndicators: {
          volume24h: Number(ticker.quoteVolume || 0),
          priceChange24h: Number(ticker.percentage || 0),
        }
      };
      
      // Создаем экземпляр стратегии с нужными параметрами
      const customStrategy = new OpenAITradingStrategy({
        riskTolerance: riskTolerance as 'conservative' | 'moderate' | 'aggressive',
        timeframe: timeframe as '1h' | '4h' | '1d'
      });
      
      const prediction = await customStrategy.getPrediction(marketData);
      
      res.json({
        success: true,
        data: prediction,
        model: customStrategy.getModelInfo()
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'OPENAI_PREDICTION_ERROR'
      });
    }
  });

  // Получение множественных прогнозов с разными настройками
  app.post('/api/openai/predict-variations', async (req, res) => {
    try {
      const { symbol = 'BTCUSDT', limit = 100 } = req.body;
      
      const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, limit);
      const ticker = await bybitApi.fetchTicker(symbol);
      const currentPrice = Number(ticker.last);
      
      const marketData: MarketData = {
        symbol,
        currentPrice,
        ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
          timestamp: Number(timestamp),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume)
        })),
        technicalIndicators: {
          volume24h: Number(ticker.quoteVolume || 0),
          priceChange24h: Number(ticker.percentage || 0),
        }
      };
      
      const predictions = await openaiStrategy.getMultiplePredictions(marketData);
      
      res.json({
        success: true,
        data: predictions,
        count: predictions.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'OPENAI_VARIATIONS_ERROR'
      });
    }
  });

  // Статус OpenAI сервиса
  app.get('/api/openai/health', async (req, res) => {
    try {
      const isHealthy = await openaiStrategy.healthCheck();
      const modelInfo = openaiStrategy.getModelInfo();
      
      res.json({
        success: true,
        data: {
          healthy: isHealthy,
          model: modelInfo,
          enabled: config.openai.enabled
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        code: 'OPENAI_HEALTH_ERROR'
      });
    }
  });
}

// Менеджер стратегий endpoints
const strategyManager = new StrategyManager();

// Получение прогноза от основной стратегии
app.post('/api/strategy/predict', async (req, res) => {
  try {
    const { symbol = 'BTCUSDT', limit = 100 } = req.body;
    
    const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, limit);
    const ticker = await bybitApi.fetchTicker(symbol);
    const currentPrice = Number(ticker.last);
    
    const marketData: MarketData = {
      symbol,
      currentPrice,
      ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
        timestamp: Number(timestamp),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume)
      })),
      technicalIndicators: {
        volume24h: Number(ticker.quoteVolume || 0),
        priceChange24h: Number(ticker.percentage || 0),
      }
    };
    
    const combinedPrediction = await strategyManager.getPrimaryPrediction(marketData);
    
    res.json({
      success: true,
      data: combinedPrediction,
      strategy: strategyManager.getStrategyInfo()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STRATEGY_PREDICTION_ERROR'
    });
  }
});

// Получение прогнозов от всех стратегий для сравнения
app.post('/api/strategy/compare', async (req, res) => {
  try {
    const { symbol = 'BTCUSDT', limit = 100 } = req.body;
    
    const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, limit);
    const ticker = await bybitApi.fetchTicker(symbol);
    const currentPrice = Number(ticker.last);
    
    const marketData: MarketData = {
      symbol,
      currentPrice,
      ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
        timestamp: Number(timestamp),
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume)
      })),
      technicalIndicators: {
        volume24h: Number(ticker.quoteVolume || 0),
        priceChange24h: Number(ticker.percentage || 0),
      }
    };
    
    const allPredictions = await strategyManager.getAllPredictions(marketData);
    
    res.json({
      success: true,
      data: allPredictions,
      strategy: strategyManager.getStrategyInfo()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STRATEGY_COMPARE_ERROR'
    });
  }
});

// Статус всех стратегий
app.get('/api/strategy/health', async (req, res) => {
  try {
    const healthStatus = await strategyManager.healthCheck();
    const strategyInfo = strategyManager.getStrategyInfo();
    
    res.json({
      success: true,
      data: {
        health: healthStatus,
        info: strategyInfo,
        config: {
          primary: config.strategies.primary,
          comparison: config.strategies.enableComparison,
          confidenceThreshold: config.strategies.confidenceThreshold,
          openaiEnabled: config.openai.enabled,
          mlEnabled: config.ml.enabled
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STRATEGY_HEALTH_ERROR'
    });
  }
});

// Получение состояния всех агентов
app.get('/api/agents/status', async (req, res) => {
  try {
    const agents = await strategyManager.getAgentsStatus();
    
    res.json({
      success: true,
      data: agents
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'AGENTS_STATUS_ERROR'
    });
  }
});

// Endpoints для управления торговыми ботами

// Создание нового торгового бота
app.post('/api/bots', requireApiKey, async (req, res) => {
  try {
    const { name, description, strategy, tradingPairs, positionSize, maxDrawdown, riskLevel, initialBalance } = req.body;
    
    if (!name || !strategy || !tradingPairs || !positionSize || !initialBalance) {
      return res.status(400).json({
        success: false,
        error: 'Отсутствуют обязательные поля: name, strategy, tradingPairs, positionSize, initialBalance',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const botId = await botManager.createBot({
      name,
      description,
      strategy,
      tradingPairs,
      positionSize: Number(positionSize),
      maxDrawdown: Number(maxDrawdown) || 10,
      riskLevel: riskLevel || 'medium',
      initialBalance: Number(initialBalance)
    });

    res.json({
      success: true,
      data: { botId },
      message: `Торговый бот "${name}" создан успешно`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CREATE_BOT_ERROR'
    });
  }
});

// Получение списка всех ботов
app.get('/api/bots', async (req, res) => {
  try {
    const bots = await botManager.getAllBots();
    const safeBots = bots.map(sanitizeBot as any);

    res.json({
      success: true,
      data: safeBots,
      count: safeBots.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'GET_BOTS_ERROR'
    });
  }
});

// Получение информации о конкретном боте
app.get('/api/bots/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const bot = await botManager.getBotById(botId);
    
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'Бот не найден',
        code: 'BOT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: sanitizeBot(bot as any)
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'GET_BOT_ERROR'
    });
  }
});

// Запуск торгового бота
app.post('/api/bots/:botId/start', requireApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    await botManager.startBot(botId);
    
    res.json({
      success: true,
      message: 'Торговый бот запущен'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'START_BOT_ERROR'
    });
  }
});

// Остановка торгового бота
app.post('/api/bots/:botId/stop', requireApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    await botManager.stopBot(botId);
    
    res.json({
      success: true,
      message: 'Торговый бот остановлен'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'STOP_BOT_ERROR'
    });
  }
});

// Приостановка торгового бота
app.post('/api/bots/:botId/pause', requireApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    await botManager.pauseBot(botId);
    
    res.json({
      success: true,
      message: 'Торговый бот приостановлен'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'PAUSE_BOT_ERROR'
    });
  }
});

// Удаление торгового бота
app.delete('/api/bots/:botId', requireApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    await botManager.deleteBot(botId);
    
    res.json({
      success: true,
      message: 'Торговый бот удален'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'DELETE_BOT_ERROR'
    });
  }
});

// Получение баланса торгового бота
app.get('/api/bots/:botId/balance', requireApiKey, async (req, res) => {
  try {
    const { botId } = req.params;
    const balance = await botManager.getBotBalance(botId);
    
    res.json({
      success: true,
      data: balance
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'GET_BOT_BALANCE_ERROR'
    });
  }
});

// Получение истории сделок торгового бота
app.get('/api/bots/:botId/trades', async (req, res) => {
  try {
    const { botId } = req.params;
    const { limit = 100 } = req.query;
    
    const trades = await botManager.getBotTradeHistory(botId, Number(limit));
    
    res.json({
      success: true,
      data: trades,
      count: trades.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'GET_BOT_TRADES_ERROR'
    });
  }
});

// Получение списка суб-аккаунтов
app.get('/api/subaccounts', requireApiKey, async (req, res) => {
  try {
    const subAccounts = await bybitApi.getSubAccounts();
    
    res.json({
      success: true,
      data: subAccounts
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'GET_SUBACCOUNTS_ERROR'
    });
  }
});

// Обработка ошибок
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Необработанная ошибка:', err);
  res.status(500).json({
    success: false,
    error: 'Внутренняя ошибка сервера',
    code: 'INTERNAL_SERVER_ERROR'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Эндпоинт не найден',
    code: 'NOT_FOUND'
  });
});

// Запуск сервера
export const startServer = async (): Promise<void> => {
  try {
    // Инициализация TimescaleDB
    await initDb();

    // Инициализация WebSocket соединений
    await bybitApi.initializeWebSockets();

    // Запуск планировщика сбора OHLCV
    startCollector();

    // Инициализация менеджера ботов
    console.log('🤖 Инициализация менеджера торговых ботов...');
    
    app.listen(config.server.port, () => {
      console.log(`🚀 Сервер запущен на порту ${config.server.port}`);
      console.log(`📊 Режим: ${config.bybit.testnet ? 'TESTNET' : 'MAINNET'}`);
      console.log(`🔐 API ключи: ${config.bybit.apiKey ? 'настроены' : 'НЕ настроены'}`);
      console.log(`📡 WebSocket: инициализация...`);
    });
  } catch (error) {
    console.error('Ошибка запуска сервера:', error);
    process.exit(1);
  }
};

// Грациозное отключение
process.on('SIGTERM', async () => {
  console.log('Получен SIGTERM, закрытие соединений...');
  await botManager.cleanup();
  await bybitApi.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Получен SIGINT, закрытие соединений...');
  await botManager.cleanup();
  await bybitApi.disconnect();
  process.exit(0);
});

export default app; 