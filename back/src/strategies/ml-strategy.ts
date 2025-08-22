import axios, { AxiosError } from 'axios';
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
    this.mlServiceUrl = config.ml.serviceUrl;
  }

  private buildErrorMessage(error: any, context: string): string {
    if (axios.isAxiosError(error)) {
      const ae = error as AxiosError<any>;
      const status = ae.response?.status;
      const statusText = ae.response?.statusText;
      const data = ae.response?.data;
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      const code = ae.code;
      return `${context}: ${status || ''} ${statusText || ''} ${code || ''} ${dataStr || ae.message}`.trim();
    }
    if (error instanceof Error) return `${context}: ${error.message}`;
    try { return `${context}: ${JSON.stringify(error)}`; } catch { return `${context}: Unknown error`; }
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
      const msg = this.buildErrorMessage(error, 'ML prediction failed');
      console.error('ML Service error:', msg);
      throw new Error(msg);
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
      const msg = this.buildErrorMessage(error, 'Technical indicators calculation failed');
      console.error('Technical indicators error:', msg);
      throw new Error(msg);
    }
  }

  /**
   * Получить облако прогноза (fan + bifurcation) для отрисовки коридора
   */
  async getPredictionCloud(payload: {
    ohlcv: MLStrategyInput['ohlcv'];
    horizon_steps?: number;
    params?: any;
  }): Promise<{ centerline: Array<{ t: number; p: number }>; cloud: Array<{ t: number; p: number; a: number }>; meta: any }>
  {
    const desiredMethod = (payload.params && payload.params.method) || 'fan';
    const requestBody = {
      ohlcv: payload.ohlcv,
      horizon_steps: payload.horizon_steps ?? 8,
      params: payload.params ?? {},
      method: desiredMethod,
      lookback: (payload.params && payload.params.lookback) || 30,
    };
    try {
      const response = await axios.post(`${this.mlServiceUrl}/predict_cloud`, requestBody, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (primaryError) {
      const primaryMsg = this.buildErrorMessage(primaryError, 'ML cloud prediction failed');
      console.error('ML Service cloud error (primary):', primaryMsg);

      // Фолбэк на fan в случае проблем с quantile/LightGBM или обрыва соединения
      const shouldFallbackToFan = desiredMethod !== 'fan';
      if (shouldFallbackToFan) {
        try {
          const fallbackBody = { ...requestBody, method: 'fan' };
          const response = await axios.post(`${this.mlServiceUrl}/predict_cloud`, fallbackBody, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
          });
          const data = response.data;
          return { ...data, meta: { ...(data?.meta || {}), fallback: true, originalError: primaryMsg } };
        } catch (fallbackError) {
          const fallbackMsg = this.buildErrorMessage(fallbackError, 'ML cloud prediction fallback (fan) failed');
          console.error('ML Service cloud error (fallback):', fallbackMsg);
          throw new Error(`${primaryMsg}; ${fallbackMsg}`);
        }
      }
      throw new Error(primaryMsg);
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