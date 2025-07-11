import { TradingBot, TradeRecord, SubAccountInfo } from '../types';
import { bybitApi } from '../api/bybit';
import { MLTradingStrategy, MLPrediction } from '../strategies/ml-strategy';
import { OpenAITradingStrategy, OpenAIPrediction, MarketData } from '../strategies/openai-strategy';
import { 
  createTradingBot, 
  getAllTradingBots, 
  getTradingBotById, 
  updateTradingBot, 
  deleteTradingBot,
  createTradeRecord,
  getTradeHistory,
  fetchOHLCVFromDb
} from '../db';
import { v4 as uuidv4 } from 'uuid';

export class BotManager {
  private activeBots: Map<string, BotInstance> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  async createBot(config: {
    name: string;
    description?: string;
    strategy: 'ml' | 'openai';
    tradingPairs: string[];
    positionSize: number;
    maxDrawdown: number;
    riskLevel: 'low' | 'medium' | 'high';
    initialBalance: number;
  }): Promise<string> {
    try {
      // 1. Создаем суб-аккаунт в Bybit
      const username = `bot_${config.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
      const subAccount = await bybitApi.createSubAccount(username, 1, config.description);
      
      if (!subAccount.result) {
        throw new Error('Не удалось создать суб-аккаунт в Bybit');
      }

      const subAccountId = subAccount.result.uid;

      // 2. Создаем API ключи для суб-аккаунта
      const apiKeyResponse = await bybitApi.createSubAccountApiKey(subAccountId, ['Trade', 'Wallet']);
      
      if (!apiKeyResponse.result) {
        throw new Error('Не удалось создать API ключи для суб-аккаунта');
      }

      const { id: apiKey, secret } = apiKeyResponse.result;

      // 3. Переводим начальный баланс на суб-аккаунт
      if (config.initialBalance > 0) {
        await bybitApi.transferToSubAccount(
          subAccountId, 
          'USDT', 
          config.initialBalance.toString()
        );
      }

      // 4. Сохраняем бота в БД
      const botData: Omit<TradingBot, 'id' | 'createdAt' | 'updatedAt'> = {
        name: config.name,
        description: config.description,
        strategy: config.strategy,
        status: 'paused',
        subAccountId,
        subAccountUsername: username,
        apiKey,
        apiSecret: secret,
        tradingPairs: config.tradingPairs,
        positionSize: config.positionSize,
        maxDrawdown: config.maxDrawdown,
        riskLevel: config.riskLevel,
        totalTrades: 0,
        winningTrades: 0,
        totalPnL: 0,
        currentBalance: config.initialBalance,
        initialBalance: config.initialBalance
      };

      const botId = await createTradingBot(botData);
      
      console.log(`✅ Торговый бот "${config.name}" создан с ID: ${botId}`);
      return botId;

    } catch (error) {
      console.error('❌ Ошибка создания торгового бота:', error);
      throw error;
    }
  }

  async startBot(botId: string): Promise<void> {
    const bot = await getTradingBotById(botId);
    if (!bot) {
      throw new Error(`Бот с ID ${botId} не найден`);
    }

    if (this.activeBots.has(botId)) {
      throw new Error(`Бот ${bot.name} уже запущен`);
    }

    // Создаем экземпляр бота
    const botInstance = new BotInstance(bot);
    await botInstance.initialize();
    
    this.activeBots.set(botId, botInstance);

    // Обновляем статус в БД
    await updateTradingBot(botId, { status: 'active' });

    // Запускаем цикл торговли
    const interval = setInterval(async () => {
      try {
        await botInstance.executeTradingCycle();
      } catch (error) {
        console.error(`❌ Ошибка в торговом цикле бота ${bot.name}:`, error);
        await this.handleBotError(botId, error);
      }
    }, 30000); // Каждые 30 секунд

    this.intervals.set(botId, interval);
    
    console.log(`🚀 Торговый бот "${bot.name}" запущен`);
  }

  async stopBot(botId: string): Promise<void> {
    const bot = await getTradingBotById(botId);
    if (!bot) {
      throw new Error(`Бот с ID ${botId} не найден`);
    }

    // Останавливаем интервал
    const interval = this.intervals.get(botId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(botId);
    }

    // Удаляем из активных
    const botInstance = this.activeBots.get(botId);
    if (botInstance) {
      await botInstance.cleanup();
      this.activeBots.delete(botId);
    }

    // Обновляем статус в БД
    await updateTradingBot(botId, { status: 'stopped' });
    
    console.log(`⏹️ Торговый бот "${bot.name}" остановлен`);
  }

  async pauseBot(botId: string): Promise<void> {
    const bot = await getTradingBotById(botId);
    if (!bot) {
      throw new Error(`Бот с ID ${botId} не найден`);
    }

    // Приостанавливаем интервал, но не удаляем экземпляр
    const interval = this.intervals.get(botId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(botId);
    }

    await updateTradingBot(botId, { status: 'paused' });
    
    console.log(`⏸️ Торговый бот "${bot.name}" приостановлен`);
  }

  async deleteBot(botId: string): Promise<void> {
    // Сначала останавливаем бота
    await this.stopBot(botId);
    
    // Удаляем из БД
    await deleteTradingBot(botId);
    
    console.log(`🗑️ Торговый бот удален`);
  }

  async getAllBots(): Promise<TradingBot[]> {
    return getAllTradingBots();
  }

  async getBotById(botId: string): Promise<TradingBot | null> {
    return getTradingBotById(botId);
  }

  async getBotTradeHistory(botId: string, limit: number = 100): Promise<TradeRecord[]> {
    return getTradeHistory(botId, limit);
  }

  async getBotBalance(botId: string): Promise<any> {
    const bot = await getTradingBotById(botId);
    if (!bot) {
      throw new Error(`Бот с ID ${botId} не найден`);
    }

    try {
      const balance = await bybitApi.getSubAccountBalance(bot.subAccountId);
      return balance;
    } catch (error) {
      console.error(`❌ Ошибка получения баланса бота ${bot.name}:`, error);
      throw error;
    }
  }

  private async handleBotError(botId: string, error: any): Promise<void> {
    console.error(`❌ Ошибка в боте ${botId}:`, error);
    
    // Останавливаем бота при критической ошибке
    await this.stopBot(botId);
    await updateTradingBot(botId, { status: 'error' });
  }

  // Очистка всех ботов при остановке сервера
  async cleanup(): Promise<void> {
    const promises = Array.from(this.activeBots.keys()).map(botId => this.stopBot(botId));
    await Promise.all(promises);
  }
}

class BotInstance {
  private bot: TradingBot;
  private bybitInstance: any;
  private strategy!: MLTradingStrategy | OpenAITradingStrategy;
  private lastSignalTimestamp: number = 0;

  constructor(bot: TradingBot) {
    this.bot = bot;
  }

  async initialize(): Promise<void> {
    // Создаем изолированный экземпляр Bybit API для этого бота
    this.bybitInstance = bybitApi.createSubAccountInstance(this.bot.apiKey, this.bot.apiSecret);

    // Инициализируем стратегию
    if (this.bot.strategy === 'ml') {
      this.strategy = new MLTradingStrategy();
    } else if (this.bot.strategy === 'openai') {
      this.strategy = new OpenAITradingStrategy();
    } else {
      throw new Error(`Неподдерживаемая стратегия: ${this.bot.strategy}`);
    }

    console.log(`🤖 Бот "${this.bot.name}" инициализирован со стратегией ${this.bot.strategy}`);
  }

  async executeTradingCycle(): Promise<void> {
    for (const symbol of this.bot.tradingPairs) {
      try {
        await this.processTradingPair(symbol);
      } catch (error) {
        console.error(`❌ Ошибка обработки пары ${symbol} для бота ${this.bot.name}:`, error);
      }
    }
  }

  private async processTradingPair(symbol: string): Promise<void> {
    try {
      // Получаем рыночные данные
      const ohlcv = await fetchOHLCVFromDb(symbol, '1h', 100);
      if (ohlcv.length === 0) {
        console.log(`⚠️ Нет данных OHLCV для ${symbol}`);
        return;
      }

      const currentPrice = ohlcv[ohlcv.length - 1][4]; // close price
      
      let prediction: MLPrediction | OpenAIPrediction;

      if (this.bot.strategy === 'ml') {
        const mlInput = {
          symbol,
          currentPrice,
          ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
            timestamp,
            open,
            high,
            low,
            close,
            volume
          }))
        };
        prediction = await (this.strategy as MLTradingStrategy).getPrediction(mlInput);
      } else {
        const marketData: MarketData = {
          symbol,
          currentPrice,
          ohlcv: ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
            timestamp,
            open,
            high,
            low,
            close,
            volume
          })),
          technicalIndicators: {} // Добавим если нужно
        };
        prediction = await (this.strategy as OpenAITradingStrategy).getPrediction(marketData);
      }

      // Проверяем, нужно ли выполнять сделку
      if (this.shouldExecuteTrade(prediction)) {
        await this.executeTrade(symbol, prediction, currentPrice);
      }

    } catch (error) {
      console.error(`❌ Ошибка в торговом цикле для ${symbol}:`, error);
      throw error;
    }
  }

  private shouldExecuteTrade(prediction: MLPrediction | OpenAIPrediction): boolean {
    // Проверяем, что сигнал не HOLD
    if (prediction.signal === 'HOLD') {
      return false;
    }

    // Проверяем уверенность
    const minConfidence = this.bot.riskLevel === 'low' ? 0.8 : 
                         this.bot.riskLevel === 'medium' ? 0.6 : 0.4;
    
    if (prediction.confidence < minConfidence) {
      return false;
    }

    // Проверяем, что это новый сигнал
    if (prediction.timestamp <= this.lastSignalTimestamp) {
      return false;
    }

    return true;
  }

  private async executeTrade(symbol: string, prediction: MLPrediction | OpenAIPrediction, currentPrice: number): Promise<void> {
    try {
      // Создаем ордер через изолированный API экземпляр бота
      const order = await this.bybitInstance.createOrder({
        symbol,
        side: prediction.signal.toLowerCase() as 'buy' | 'sell',
        amount: this.bot.positionSize,
        type: 'market'
      });

      // Записываем сделку в историю
      const tradeRecord: Omit<TradeRecord, 'id'> = {
        botId: this.bot.id,
        symbol,
        side: prediction.signal.toLowerCase() as 'buy' | 'sell',
        amount: this.bot.positionSize,
        price: currentPrice,
        timestamp: new Date().toISOString(),
        orderId: order.id,
        signal: {
          type: this.bot.strategy as 'ml' | 'openai',
          confidence: prediction.confidence,
          reasoning: prediction.reasoning
        }
      };

      await createTradeRecord(tradeRecord);

      // Обновляем статистику бота
      await updateTradingBot(this.bot.id, {
        totalTrades: this.bot.totalTrades + 1,
        lastTradeAt: new Date().toISOString()
      });

      this.lastSignalTimestamp = prediction.timestamp;

      console.log(`✅ Бот "${this.bot.name}" выполнил сделку: ${prediction.signal} ${symbol} по ${currentPrice}`);

    } catch (error) {
      console.error(`❌ Ошибка выполнения сделки для бота ${this.bot.name}:`, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    // Закрываем соединения, очищаем ресурсы
    console.log(`🧹 Очистка ресурсов бота "${this.bot.name}"`);
  }
}

// Экспортируем единственный экземпляр менеджера
export const botManager = new BotManager(); 