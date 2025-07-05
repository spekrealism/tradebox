import OpenAI from 'openai';
import { config } from '../config';

export interface OpenAIPrediction {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  stopLoss?: number;
  takeProfit?: number;
  reasoning: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: string;
  timestamp: number;
  thought?: string; // Последняя мысль/план действий
  marketAnalysis?: string; // Анализ рынка
}

export interface MarketData {
  symbol: string;
  currentPrice: number;
  ohlcv: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  technicalIndicators?: {
    rsi?: number;
    bollinger?: {
      upper: number;
      middle: number;
      lower: number;
    };
    ema?: {
      ema1: number;
      ema20: number;
      ema50: number;
      ema100: number;
    };
    volume24h?: number;
    priceChange24h?: number;
  };
  marketSentiment?: string;
  news?: string[];
}

export interface OpenAIStrategyConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  timeframe: '1h' | '4h' | '1d';
}

export interface AgentState {
  lastThought: string;
  lastMarketAnalysis: string;
  lastPrediction?: OpenAIPrediction;
  totalDecisions: number;
  successfulDecisions: number;
  lastActiveTime: number;
  currentBalance?: number;
  performance?: {
    profit: number;
    profitPercent: number;
    winRate: number;
    totalTrades: number;
  };
}

export class OpenAITradingStrategy {
  private openai: OpenAI;
  private config: OpenAIStrategyConfig;
  private defaultSystemPrompt: string;
  private agentState: AgentState;

  constructor(strategyConfig?: Partial<OpenAIStrategyConfig>) {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API ключ не настроен');
    }

    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    this.config = {
      model: config.openai.model,
      temperature: config.openai.temperature,
      maxTokens: Math.min(config.openai.maxTokens, 500), // Ограничиваем токены для быстрого ответа
      riskTolerance: 'moderate',
      timeframe: '1h',
      ...strategyConfig,
    };

    this.defaultSystemPrompt = this.generateSystemPrompt();
    
    // Инициализация состояния агента
    this.agentState = {
      lastThought: 'Агент только что инициализирован',
      lastMarketAnalysis: 'Ожидание данных рынка',
      totalDecisions: 0,
      successfulDecisions: 0,
      lastActiveTime: Date.now(),
    };
  }

  private generateSystemPrompt(): string {
    return `Ты криптовалютный трейдер. Проанализируй данные и дай торговую рекомендацию.

ПРАВИЛА:
1. Анализируй цену, объемы, тренд
2. Риск: ${this.config.riskTolerance}, Таймфрейм: ${this.config.timeframe}
3. Confidence <0.6 = HOLD

ОТВЕТ JSON:
{
  "signal": "BUY|SELL|HOLD",
  "confidence": 0.1-1.0,
  "stopLoss": число,
  "takeProfit": число,
  "reasoning": "краткое объяснение",
  "riskLevel": "LOW|MEDIUM|HIGH",
  "timeframe": "${this.config.timeframe}"
}`;
  }

  /**
   * Получить торговую рекомендацию от OpenAI
   */
  async getPrediction(marketData: MarketData): Promise<OpenAIPrediction> {
    try {
      const prompt = this.formatMarketDataPrompt(marketData);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 секунд таймаут
      
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.config.systemPrompt || this.defaultSystemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: "json_object" }
      }, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('Пустой ответ от OpenAI');
      }

      const prediction = JSON.parse(response);
      
      // Валидация и обогащение ответа
      const result: OpenAIPrediction = {
        signal: prediction.signal || 'HOLD',
        confidence: Math.max(0, Math.min(1, prediction.confidence || 0)),
        stopLoss: prediction.stopLoss,
        takeProfit: prediction.takeProfit,
        reasoning: prediction.reasoning || 'Анализ завершен',
        riskLevel: prediction.riskLevel || 'MEDIUM',
        timeframe: prediction.timeframe || this.config.timeframe,
        timestamp: Date.now(),
        thought: prediction.thought || this.generateThought(prediction, marketData),
        marketAnalysis: this.generateMarketAnalysis(marketData),
      };
      
      // Обновление состояния агента
      this.updateAgentState(result, marketData);
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      console.error('Ошибка получения прогноза от OpenAI:', {
        error: errorMessage,
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        model: this.config.model,
        symbol: marketData.symbol
      });
      
      // Возвращаем безопасный fallback
      return {
        signal: 'HOLD',
        confidence: 0,
        reasoning: `Ошибка анализа: ${errorMessage}`,
        riskLevel: 'HIGH',
        timeframe: this.config.timeframe,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Форматирование рыночных данных для промпта
   */
  private formatMarketDataPrompt(marketData: MarketData): string {
    const recentCandles = marketData.ohlcv.slice(-20); // Последние 20 свечей
    const currentPrice = marketData.currentPrice;
    
    let prompt = `РЫНОЧНЫЕ ДАННЫЕ ДЛЯ ${marketData.symbol}:

ТЕКУЩАЯ ЦЕНА: $${currentPrice.toFixed(4)}

ПОСЛЕДНИЕ СВЕЧИ (${this.config.timeframe}):`;

    recentCandles.forEach((candle, index) => {
      const date = new Date(candle.timestamp).toISOString().slice(0, 16);
      const change = ((candle.close - candle.open) / candle.open * 100).toFixed(2);
      prompt += `\n${date}: O:${candle.open.toFixed(4)} H:${candle.high.toFixed(4)} L:${candle.low.toFixed(4)} C:${candle.close.toFixed(4)} V:${candle.volume.toFixed(0)} (${change}%)`;
    });

    if (marketData.technicalIndicators) {
      prompt += `\n\nТЕХНИЧЕСКИЕ ИНДИКАТОРЫ:`;
      
      if (marketData.technicalIndicators.rsi) {
        prompt += `\nRSI: ${marketData.technicalIndicators.rsi.toFixed(2)}`;
      }
      
      if (marketData.technicalIndicators.bollinger) {
        const bb = marketData.technicalIndicators.bollinger;
        prompt += `\nBollinger Bands: Upper: ${bb.upper.toFixed(4)}, Middle: ${bb.middle.toFixed(4)}, Lower: ${bb.lower.toFixed(4)}`;
        const bbPosition = ((currentPrice - bb.lower) / (bb.upper - bb.lower) * 100).toFixed(1);
        prompt += `\nПозиция в BB: ${bbPosition}%`;
      }

      if (marketData.technicalIndicators.ema) {
        const ema = marketData.technicalIndicators.ema;
        prompt += `\nEMA: 1: ${ema.ema1.toFixed(4)}, 20: ${ema.ema20.toFixed(4)}, 50: ${ema.ema50.toFixed(4)}, 100: ${ema.ema100.toFixed(4)}`;
      }

      if (marketData.technicalIndicators.volume24h) {
        prompt += `\nОбъем 24ч: ${marketData.technicalIndicators.volume24h.toFixed(0)}`;
      }

      if (marketData.technicalIndicators.priceChange24h) {
        prompt += `\nИзменение за 24ч: ${marketData.technicalIndicators.priceChange24h.toFixed(2)}%`;
      }
    }

    if (marketData.marketSentiment) {
      prompt += `\n\nНАСТРОЕНИЕ РЫНКА: ${marketData.marketSentiment}`;
    }

    if (marketData.news && marketData.news.length > 0) {
      prompt += `\n\nАКТУАЛЬНЫЕ НОВОСТИ:\n${marketData.news.slice(0, 3).join('\n')}`;
    }

    prompt += `\n\nПроанализируй данные и дай торговую рекомендацию в формате JSON.`;

    return prompt;
  }

  /**
   * Получить несколько прогнозов с разными настройками для сравнения
   */
  async getMultiplePredictions(marketData: MarketData): Promise<OpenAIPrediction[]> {
    const variations = [
      { temperature: 0.3, riskTolerance: 'conservative' as const },
      { temperature: 0.7, riskTolerance: 'moderate' as const },
      { temperature: 1.0, riskTolerance: 'aggressive' as const },
    ];

    const predictions = await Promise.allSettled(
      variations.map(async (variation) => {
        const strategy = new OpenAITradingStrategy(variation);
        return strategy.getPrediction(marketData);
      })
    );

    return predictions
      .filter((result): result is PromiseFulfilledResult<OpenAIPrediction> => result.status === 'fulfilled')
      .map(result => result.value);
  }

  /**
   * Проверка состояния OpenAI API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут
      
      await this.openai.models.list({
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return true;
    } catch (error) {
      console.error('OpenAI health check failed:', error);
      return false;
    }
  }

  /**
   * Получить информацию о модели
   */
  getModelInfo(): { model: string; config: OpenAIStrategyConfig } {
    return {
      model: this.config.model,
      config: this.config,
    };
  }

  /**
   * Получить состояние агента
   */
  getAgentState(): AgentState {
    return { ...this.agentState };
  }

  /**
   * Генерация мысли агента
   */
  private generateThought(prediction: any, marketData: MarketData): string {
    const signal = prediction.signal || 'HOLD';
    const confidence = prediction.confidence || 0;
    const price = marketData.currentPrice;
    
    let thought = `Анализирую ${marketData.symbol} по цене $${price.toFixed(2)}. `;
    
    if (signal === 'BUY') {
      thought += `Вижу потенциал роста (уверенность: ${(confidence * 100).toFixed(1)}%). `;
      if (prediction.takeProfit) {
        thought += `Планирую взять прибыль на $${prediction.takeProfit.toFixed(2)}. `;
      }
    } else if (signal === 'SELL') {
      thought += `Предвижу снижение (уверенность: ${(confidence * 100).toFixed(1)}%). `;
      if (prediction.takeProfit) {
        thought += `Цель по снижению: $${prediction.takeProfit.toFixed(2)}. `;
      }
    } else {
      thought += `Рынок неопределен, лучше подождать. `;
    }
    
    if (prediction.stopLoss) {
      thought += `Стоп-лосс установлю на $${prediction.stopLoss.toFixed(2)}. `;
    }
    
    return thought;
  }

  /**
   * Генерация анализа рынка
   */
  private generateMarketAnalysis(marketData: MarketData): string {
    const recentCandles = marketData.ohlcv.slice(-5);
    const currentPrice = marketData.currentPrice;
    
    if (recentCandles.length === 0) {
      return 'Недостаточно данных для анализа';
    }
    
    const priceChange = ((currentPrice - recentCandles[0].close) / recentCandles[0].close) * 100;
    const trend = priceChange > 2 ? 'растущий' : priceChange < -2 ? 'падающий' : 'боковой';
    
    const avgVolume = recentCandles.reduce((sum, candle) => sum + candle.volume, 0) / recentCandles.length;
    const lastVolume = recentCandles[recentCandles.length - 1].volume;
    const volumeChange = ((lastVolume - avgVolume) / avgVolume) * 100;
    
    return `Тренд: ${trend} (${priceChange.toFixed(2)}%). Объем: ${volumeChange > 0 ? 'выше' : 'ниже'} среднего на ${Math.abs(volumeChange).toFixed(1)}%. `;
  }

  /**
   * Обновление состояния агента
   */
  private updateAgentState(prediction: OpenAIPrediction, marketData: MarketData): void {
    this.agentState.lastThought = prediction.thought || 'Анализ завершен';
    this.agentState.lastMarketAnalysis = prediction.marketAnalysis || 'Данные обновлены';
    this.agentState.lastPrediction = prediction;
    this.agentState.totalDecisions++;
    this.agentState.lastActiveTime = Date.now();
    
    // Если уверенность высокая, считаем решение потенциально успешным
    if (prediction.confidence > 0.7) {
      this.agentState.successfulDecisions++;
    }
  }
} 