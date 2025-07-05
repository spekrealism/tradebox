import { OpenAITradingStrategy, OpenAIPrediction, MarketData } from './openai-strategy';
import { MLTradingStrategy, MLPrediction, MLStrategyInput } from './ml-strategy';
import { config } from '../config';

export interface StrategyResult {
  strategy: string;
  prediction: OpenAIPrediction | MLPrediction;
  executionTime: number;
  success: boolean;
  error?: string;
}

export interface CombinedPrediction {
  primaryStrategy: string;
  finalSignal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  strategyResults: StrategyResult[];
  consensus?: {
    buyCount: number;
    sellCount: number;
    holdCount: number;
    avgConfidence: number;
  };
  timestamp: number;
}

export class StrategyManager {
  private openaiStrategy?: OpenAITradingStrategy;
  private mlStrategy?: MLTradingStrategy;
  private primaryStrategy: string;
  private enableComparison: boolean;

  constructor() {
    this.primaryStrategy = config.strategies.primary;
    this.enableComparison = config.strategies.enableComparison;

    // Инициализация стратегий
    if (config.openai.enabled) {
      this.openaiStrategy = new OpenAITradingStrategy();
    }

    if (config.ml.enabled) {
      this.mlStrategy = new MLTradingStrategy();
    }

    console.log(`Инициализирован StrategyManager - Primary: ${this.primaryStrategy}, Comparison: ${this.enableComparison}`);
  }

  /**
   * Получить решение от основной стратегии
   */
  async getPrimaryPrediction(marketData: MarketData): Promise<CombinedPrediction> {
    const results: StrategyResult[] = [];
    let primaryResult: StrategyResult | null = null;

    // Выполняем основную стратегию
    if (this.primaryStrategy === 'openai' && this.openaiStrategy) {
      primaryResult = await this.executeOpenAIStrategy(marketData);
      results.push(primaryResult);
    } else if (this.primaryStrategy === 'ml' && this.mlStrategy) {
      primaryResult = await this.executeMLStrategy(marketData);
      results.push(primaryResult);
    }

    // Если включено сравнение, выполняем дополнительные стратегии
    if (this.enableComparison) {
      const additionalResults = await this.getComparisonResults(marketData, this.primaryStrategy);
      results.push(...additionalResults);
    }

    return this.combinePredictions(results, this.primaryStrategy);
  }

  /**
   * Получить прогнозы от всех доступных стратегий для сравнения
   */
  async getAllPredictions(marketData: MarketData): Promise<CombinedPrediction> {
    console.log('🔄 Начинаем получение прогнозов от всех стратегий для', marketData.symbol);
    const results: StrategyResult[] = [];

    // Параллельно выполняем все доступные стратегии
    const promises: Promise<StrategyResult>[] = [];

    if (this.openaiStrategy) {
      console.log('✅ Добавляем OpenAI стратегию');
      promises.push(this.executeOpenAIStrategy(marketData));
    }

    if (this.mlStrategy) {
      console.log('✅ Добавляем ML стратегию');
      promises.push(this.executeMLStrategy(marketData));
    }

    // Также получаем вариации OpenAI стратегии
    if (this.openaiStrategy) {
      console.log('✅ Добавляем OpenAI вариации');
      promises.push(this.executeOpenAIVariations(marketData));
    }

    console.log(`📊 Выполняем ${promises.length} стратегий параллельно`);
    const allResults = await Promise.allSettled(promises);
    
    allResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`✅ Стратегия ${index} (${result.value.strategy}) выполнена успешно за ${result.value.executionTime}ms`);
        results.push(result.value);
      } else {
        console.error(`❌ Стратегия ${index} упала:`, result.reason);
      }
    });

    console.log(`📈 Получено ${results.length} результатов, создаем консенсус`);
    return this.combinePredictions(results, 'consensus');
  }

  /**
   * Выполнить OpenAI стратегию
   */
  private async executeOpenAIStrategy(marketData: MarketData): Promise<StrategyResult> {
    const startTime = Date.now();
    
    try {
      if (!this.openaiStrategy) {
        throw new Error('OpenAI strategy not initialized');
      }
      const prediction = await this.openaiStrategy.getPrediction(marketData);
      
      return {
        strategy: 'openai',
        prediction,
        executionTime: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      return {
        strategy: 'openai',
        prediction: this.getErrorPrediction('OpenAI strategy failed'),
        executionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Выполнить ML стратегию
   */
  private async executeMLStrategy(marketData: MarketData): Promise<StrategyResult> {
    const startTime = Date.now();
    
    try {
      if (!this.mlStrategy) {
        throw new Error('ML strategy not initialized');
      }
      // Конвертация формата данных для ML стратегии
      const mlInput: MLStrategyInput = {
        symbol: marketData.symbol,
        currentPrice: marketData.currentPrice,
        ohlcv: marketData.ohlcv,
      };

      const prediction = await this.mlStrategy.getPrediction(mlInput);
      
      return {
        strategy: 'ml',
        prediction,
        executionTime: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      return {
        strategy: 'ml',
        prediction: this.getErrorPrediction('ML strategy failed'),
        executionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Выполнить вариации OpenAI стратегии
   */
  private async executeOpenAIVariations(marketData: MarketData): Promise<StrategyResult> {
    const startTime = Date.now();
    
    try {
      if (!this.openaiStrategy) {
        throw new Error('OpenAI strategy not initialized');
      }
      const predictions = await this.openaiStrategy.getMultiplePredictions(marketData);
      
      // Объединяем результаты нескольких вариаций
      const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
      const mostCommonSignal = this.getMostCommonSignal(predictions.map(p => p.signal));
      
      const combinedPrediction: OpenAIPrediction = {
        signal: mostCommonSignal,
        confidence: avgConfidence,
        reasoning: `Консенсус из ${predictions.length} вариаций: ${predictions.map(p => `${p.signal}(${p.confidence.toFixed(2)})`).join(', ')}`,
        riskLevel: predictions[0]?.riskLevel || 'MEDIUM',
        timeframe: predictions[0]?.timeframe || '1h',
        timestamp: Date.now(),
      };

      return {
        strategy: 'openai-variations',
        prediction: combinedPrediction,
        executionTime: Date.now() - startTime,
        success: true,
      };
    } catch (error) {
      return {
        strategy: 'openai-variations',
        prediction: this.getErrorPrediction('OpenAI variations failed'),
        executionTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Получить результаты сравнения для дополнительных стратегий
   */
  private async getComparisonResults(marketData: MarketData, excludeStrategy: string): Promise<StrategyResult[]> {
    const results: StrategyResult[] = [];

    if (excludeStrategy !== 'openai' && this.openaiStrategy) {
      results.push(await this.executeOpenAIStrategy(marketData));
    }

    if (excludeStrategy !== 'ml' && this.mlStrategy) {
      results.push(await this.executeMLStrategy(marketData));
    }

    return results;
  }

  /**
   * Объединить прогнозы от разных стратегий
   */
  private combinePredictions(results: StrategyResult[], primaryStrategy: string): CombinedPrediction {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return {
        primaryStrategy,
        finalSignal: 'HOLD',
        confidence: 0,
        reasoning: 'Все стратегии вернули ошибки',
        strategyResults: results,
        timestamp: Date.now(),
      };
    }

    // Находим результат основной стратегии
    const primaryResult = successfulResults.find(r => r.strategy === primaryStrategy);
    let finalSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let finalConfidence = 0;
    let reasoning = '';

    if (primaryResult) {
      finalSignal = primaryResult.prediction.signal;
      finalConfidence = primaryResult.prediction.confidence;
      reasoning = primaryResult.prediction.reasoning;
    } else if (successfulResults.length > 0) {
      // Если основная стратегия недоступна, используем консенсус
      const consensus = this.calculateConsensus(successfulResults);
      finalSignal = consensus.signal;
      finalConfidence = consensus.confidence;
      reasoning = consensus.reasoning;
    }

    // Применяем порог уверенности
    if (finalConfidence < config.strategies.confidenceThreshold) {
      finalSignal = 'HOLD';
      reasoning += ` (Confidence ${finalConfidence.toFixed(2)} below threshold ${config.strategies.confidenceThreshold})`;
    }

    return {
      primaryStrategy,
      finalSignal,
      confidence: finalConfidence,
      reasoning,
      strategyResults: results,
      consensus: this.calculateConsensusStats(successfulResults),
      timestamp: Date.now(),
    };
  }

  /**
   * Вычислить консенсус между стратегиями
   */
  private calculateConsensus(results: StrategyResult[]): { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string } {
    const signals = results.map(r => r.prediction.signal);
    const confidences = results.map(r => r.prediction.confidence);
    
    const buyCount = signals.filter(s => s === 'BUY').length;
    const sellCount = signals.filter(s => s === 'SELL').length;
    const holdCount = signals.filter(s => s === 'HOLD').length;
    
    let consensusSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    
    if (buyCount > sellCount && buyCount > holdCount) {
      consensusSignal = 'BUY';
    } else if (sellCount > buyCount && sellCount > holdCount) {
      consensusSignal = 'SELL';
    }
    
    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    
    return {
      signal: consensusSignal,
      confidence: avgConfidence,
      reasoning: `Консенсус: BUY(${buyCount}) SELL(${sellCount}) HOLD(${holdCount}), avg confidence: ${avgConfidence.toFixed(2)}`,
    };
  }

  /**
   * Вычислить статистику консенсуса
   */
  private calculateConsensusStats(results: StrategyResult[]) {
    const signals = results.map(r => r.prediction.signal);
    const confidences = results.map(r => r.prediction.confidence);
    
    return {
      buyCount: signals.filter(s => s === 'BUY').length,
      sellCount: signals.filter(s => s === 'SELL').length,
      holdCount: signals.filter(s => s === 'HOLD').length,
      avgConfidence: confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
    };
  }

  /**
   * Найти наиболее частый сигнал
   */
  private getMostCommonSignal(signals: ('BUY' | 'SELL' | 'HOLD')[]): 'BUY' | 'SELL' | 'HOLD' {
    const counts = { BUY: 0, SELL: 0, HOLD: 0 };
    signals.forEach(signal => counts[signal]++);
    
    return Object.entries(counts).reduce((a, b) => counts[a[0] as keyof typeof counts] > counts[b[0] as keyof typeof counts] ? a : b)[0] as 'BUY' | 'SELL' | 'HOLD';
  }

  /**
   * Создать прогноз для ошибки
   */
  private getErrorPrediction(message: string): OpenAIPrediction {
    return {
      signal: 'HOLD',
      confidence: 0,
      reasoning: message,
      riskLevel: 'HIGH',
      timeframe: '1h',
      timestamp: Date.now(),
    };
  }

  /**
   * Проверить здоровье всех стратегий
   */
  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const status: { [key: string]: boolean } = {};

    if (this.openaiStrategy) {
      status.openai = await this.openaiStrategy.healthCheck();
    }

    if (this.mlStrategy) {
      status.ml = await this.mlStrategy.healthCheck();
    }

    return status;
  }

  /**
   * Получить статистику по стратегиям
   */
  getStrategyInfo() {
    return {
      primary: this.primaryStrategy,
      comparison: this.enableComparison,
      available: {
        openai: !!this.openaiStrategy,
        ml: !!this.mlStrategy,
      },
      config: {
        confidenceThreshold: config.strategies.confidenceThreshold,
      },
    };
  }

  /**
   * Получить состояние всех агентов
   */
  async getAgentsStatus() {
    try {
      console.log('🔍 Получение статуса агентов...');
      const agents = [];

      // OpenAI агент
      if (this.openaiStrategy) {
        try {
          console.log('📊 Получение состояния OpenAI агента...');
          const agentState = this.openaiStrategy.getAgentState();
          console.log('✅ Состояние OpenAI агента получено:', agentState);
          
          const healthStatus = await this.openaiStrategy.healthCheck();
          console.log('✅ Health check OpenAI агента:', healthStatus);
          
          agents.push({
            id: 'openai',
            name: 'OpenAI Трейдер',
            type: 'ai',
            status: healthStatus ? 'active' : 'inactive',
            avatar: '🤖',
            ...agentState,
            winRate: agentState.totalDecisions > 0 ? 
              (agentState.successfulDecisions / agentState.totalDecisions * 100).toFixed(1) : '0.0',
            model: 'GPT-4',
            capabilities: ['Анализ рынка', 'Генерация сигналов', 'Планирование'],
            lastActiveFormatted: new Date(agentState.lastActiveTime).toLocaleString('ru-RU')
          });
          console.log('✅ OpenAI агент добавлен в список');
        } catch (error) {
          console.error('❌ Ошибка при получении состояния OpenAI агента:', error);
          // Добавляем агента с ошибкой
          agents.push({
            id: 'openai',
            name: 'OpenAI Трейдер',
            type: 'ai',
            status: 'error',
            avatar: '🤖',
            lastThought: 'Ошибка получения данных',
            lastMarketAnalysis: 'Недоступно',
            totalDecisions: 0,
            successfulDecisions: 0,
            lastActiveTime: Date.now(),
            winRate: '0.0',
            model: 'GPT-4',
            capabilities: ['Анализ рынка', 'Генерация сигналов', 'Планирование'],
            lastActiveFormatted: new Date().toLocaleString('ru-RU')
          });
        }
      }

      // ML агент
      if (this.mlStrategy) {
        try {
          console.log('📊 Получение состояния ML агента...');
          const healthStatus = await this.mlStrategy.healthCheck();
          console.log('✅ Health check ML агента:', healthStatus);
          
          agents.push({
            id: 'ml',
            name: 'ML Аналитик',
            type: 'ml',
            status: healthStatus ? 'active' : 'inactive',
            avatar: '📊',
            lastThought: 'Анализирую исторические данные для предсказания',
            lastMarketAnalysis: 'Обрабатываю технические индикаторы',
            totalDecisions: 0,
            successfulDecisions: 0,
            lastActiveTime: Date.now(),
            winRate: '85.0',
            model: 'LSTM + MLP',
            capabilities: ['Технический анализ', 'Предсказание цены', 'Распознавание паттернов'],
            lastActiveFormatted: new Date().toLocaleString('ru-RU')
          });
          console.log('✅ ML агент добавлен в список');
        } catch (error) {
          console.error('❌ Ошибка при получении состояния ML агента:', error);
          // Добавляем агента с ошибкой
          agents.push({
            id: 'ml',
            name: 'ML Аналитик',
            type: 'ml',
            status: 'error',
            avatar: '📊',
            lastThought: 'Ошибка получения данных',
            lastMarketAnalysis: 'Недоступно',
            totalDecisions: 0,
            successfulDecisions: 0,
            lastActiveTime: Date.now(),
            winRate: '0.0',
            model: 'LSTM + MLP',
            capabilities: ['Технический анализ', 'Предсказание цены', 'Распознавание паттернов'],
            lastActiveFormatted: new Date().toLocaleString('ru-RU')
          });
        }
      }

      console.log('✅ Список агентов сформирован:', agents.length);
      return agents;
    } catch (error) {
      console.error('❌ Критическая ошибка в getAgentsStatus():', error);
      throw error;
    }
  }
} 