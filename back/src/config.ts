import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  bybit: {
    apiKey: process.env.BYBIT_API_KEY || '',
    apiSecret: process.env.BYBIT_API_SECRET || '',
    testnet: process.env.BYBIT_TESTNET === 'true',
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  rateLimiter: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 минут
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    tradingWindowMs: parseInt(process.env.TRADING_RATE_LIMIT_WINDOW_MS || '60000'), // 1 минута
    maxTradingRequests: parseInt(process.env.TRADING_RATE_LIMIT_MAX_REQUESTS || '10'),
  },
  ml: {
    enabled: process.env.ML_ENABLED === 'true',
    serviceUrl: process.env.ML_SERVICE_URL || 'http://ml-service:5000',
    autoTrain: process.env.ML_AUTO_TRAIN === 'true',
    trainDataLimit: parseInt(process.env.ML_TRAIN_DATA_LIMIT || '1000'),
  }
}; 