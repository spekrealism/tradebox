import axios from 'axios';
import { config } from '../config';

export interface MLPrediction {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  stopLoss?: number;
  reasoning: string;
  timestamp: number;
}

export interface TechnicalIndicators {
  rsi: number;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
  ema: {
    ema1: number;
    ema20: number;
    ema50: number;
    ema100: number;
  };
  ultimateOscillator: number;
  zScore: number;
}

export interface MLStrategyInput {
  symbol: string;
  ohlcv: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  currentPrice: number;
}

export class MLTradingStrategy {
  private mlServiceUrl: string;

  constructor() {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5000';
  }

  /**
   * Получить прогноз от ML модели
   */
  async getPrediction(input: MLStrategyInput): Promise<MLPrediction> {
    try {
      const response = await axios.post(`${this.mlServiceUrl}/predict`, input, {
        timeout: 30000, // 30 секунд на предсказание
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      console.error('ML Service error:', error);
      throw new Error(`ML prediction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Получить технические индикаторы (можно использовать как fallback)
   */
  async getTechnicalIndicators(input: MLStrategyInput): Promise<TechnicalIndicators> {
    try {
      const response = await axios.post(`${this.mlServiceUrl}/indicators`, input);
      return response.data;
    } catch (error) {
      console.error('Technical indicators error:', error);
      throw new Error(`Technical indicators calculation failed`);
    }
  }

  /**
   * Проверить статус ML сервиса
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.mlServiceUrl}/health`, {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Получить статистику модели
   */
  async getModelStats(): Promise<any> {
    try {
      const response = await axios.get(`${this.mlServiceUrl}/stats`);
      return response.data;
    } catch (error) {
      console.error('Model stats error:', error);
      return null;
    }
  }
} 