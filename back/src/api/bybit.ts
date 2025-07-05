import ccxt, { Exchange, Order, Ticker, OrderBook, Balances, Position } from 'ccxt';
import { config } from '../config';
import { RateLimiter } from './rate-limiter';
import { BybitWebSocket } from './bybit-websocket';

export interface TradeSignal {
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price?: number;
  type: 'market' | 'limit';
}

class BybitApi {
  private exchange: Exchange;
  private publicExchange: Exchange;
  private rateLimiter: RateLimiter;
  private publicWs: BybitWebSocket;
  private privateWs: BybitWebSocket;
  private serverTimeOffset: number = 0;
  private lastTimeSync: number = 0;

  constructor() {
    const exchangeOptions = {
      apiKey: config.bybit.apiKey,
      secret: config.bybit.apiSecret,
      options: {
        recvWindow: 10000, // Увеличено до 10 секунд
      }
    };

    // Приватный экземпляр (с ключами) для торговых/приватных операций
    this.exchange = new ccxt.bybit(exchangeOptions);

    // Публичный экземпляр — без ключей, чтобы Bybit не требовал подпись и не возвращал 10003
    this.publicExchange = new ccxt.bybit({
      options: {
        recvWindow: 10000, // Увеличено до 10 секунд
      },
    });

    if (config.bybit.testnet) {
      this.publicExchange.setSandboxMode(true);
      this.exchange.setSandboxMode(true);
    }

    // Более консервативные настройки: 200 запросов за 60 секунд
    this.rateLimiter = new RateLimiter(200, 60000);
    
    // Инициализация WebSocket соединений
    this.publicWs = new BybitWebSocket(false);
    this.privateWs = new BybitWebSocket(true);
  }

  // Синхронизация времени с сервером Bybit
  private async syncServerTime(): Promise<void> {
    const now = Date.now();
    
    // Синхронизируем время раз в 5 минут
    if (now - this.lastTimeSync < 300000) {
      return;
    }

    try {
      await this.rateLimiter.waitForSlot();
      const serverTime = await this.publicExchange.fetchTime();
      
      if (serverTime) {
        this.serverTimeOffset = serverTime - now;
        this.lastTimeSync = now;
        console.log(`🕐 Синхронизация времени с Bybit: offset ${this.serverTimeOffset}ms`);
      }
    } catch (error) {
      console.error('Ошибка синхронизации времени:', error);
    }
  }

  // Получение текущего времени с учетом offset
  private getCurrentTimestamp(): number {
    return Date.now() + this.serverTimeOffset;
  }

  // Универсальная обработка запросов с retry логикой
  private async makeRequest<T>(requestFunc: () => Promise<T>, retries: number = 3): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.rateLimiter.waitForSlot();
        await this.syncServerTime();
        
        const result = await requestFunc();
        this.rateLimiter.resetBackoff();
        return result;
      } catch (error: any) {
        console.error(`Попытка ${attempt}/${retries} не удалась:`, error.message);
        
        // Проверяем код ошибки rate limit
        if (error.message?.includes('Rate limit') || 
            error.message?.includes('Too many visits') || 
            error.message?.includes('403') ||
            error.message?.includes('10006')) {
          
          console.log('🚫 Обнаружена ошибка rate limit, применяем backoff...');
          await this.rateLimiter.handleRateLimitError();
          
          if (attempt === retries) {
            throw new Error('Превышен лимит попыток после ошибки rate limit');
          }
          continue;
        }
        
        // Для других ошибок - повторяем только один раз
        if (attempt === retries) {
          throw error;
        }
      }
    }
    
    throw new Error('Неожиданная ошибка в makeRequest');
  }

  // Инициализация WebSocket соединений
  async initializeWebSockets(): Promise<void> {
    try {
      await this.publicWs.connect();
      
      if (config.bybit.apiKey && config.bybit.apiSecret) {
        await this.privateWs.connect();
      }
    } catch (error) {
      console.error('Ошибка инициализации WebSocket:', error);
      throw error;
    }
  }

  // Подписка на тикеры через WebSocket
  subscribeToTicker(symbol: string, callback: Function): void {
    const topic = `tickers.${symbol}`;
    this.publicWs.subscribe(topic, callback);
  }

  // Подписка на книгу ордеров через WebSocket
  subscribeToOrderBook(symbol: string, depth: number = 25, callback: Function): void {
    // Правильный формат для Bybit V5: orderBook.{depth}.{symbol}
    const topic = `orderBook.${depth}.${symbol}`;
    this.publicWs.subscribe(topic, callback);
  }

  // Подписка на сделки через WebSocket
  subscribeToTrades(symbol: string, callback: Function): void {
    const topic = `publicTrade.${symbol}`;
    this.publicWs.subscribe(topic, callback);
  }

  // Подписка на позиции через приватный WebSocket
  subscribeToPositions(callback: Function): void {
    if (!config.bybit.apiKey) {
      throw new Error('API ключ не настроен для приватных подписок');
    }
    this.privateWs.subscribe('position', callback);
  }

  // Подписка на ордера через приватный WebSocket
  subscribeToOrders(callback: Function): void {
    if (!config.bybit.apiKey) {
      throw new Error('API ключ не настроен для приватных подписок');
    }
    this.privateWs.subscribe('order', callback);
  }

  public async fetchOHLCV(symbol: string, timeframe = '1h', since?: number, limit?: number) {
    return this.makeRequest(async () => {
      if (!this.publicExchange.has['fetchOHLCV']) {
        throw new Error(`The exchange does not have fetchOHLCV method`);
      }

      console.log(`Получение OHLCV для ${symbol}... (${this.rateLimiter.getRequestsCount()}/200 запросов)`);
      const ohlcv = await this.publicExchange.fetchOHLCV(symbol, timeframe, since, limit);
      console.log(`Получено ${ohlcv.length} свечей для ${symbol}`);
      return ohlcv;
    });
  }

  public async fetchTicker(symbol: string): Promise<Ticker> {
    return this.makeRequest(async () => {
      console.log(`Получение тикера для ${symbol}...`);
      const ticker = await this.publicExchange.fetchTicker(symbol);
      return ticker;
    });
  }

  public async fetchOrderBook(symbol: string, limit?: number): Promise<OrderBook> {
    return this.makeRequest(async () => {
      const orderBook = await this.publicExchange.fetchOrderBook(symbol, limit);
      return orderBook;
    });
  }

  public async fetchBalance(): Promise<Balances> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен');
      }

      const balance = await this.exchange.fetchBalance();
      return balance;
    });
  }

  public async createOrder(signal: TradeSignal): Promise<Order> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен для торговли');
      }

      console.log(`Создание ордера: ${signal.side} ${signal.amount} ${signal.symbol} по ${signal.price || 'рыночной цене'}`);
      
      const order = await this.exchange.createOrder(
        signal.symbol,
        signal.type,
        signal.side,
        signal.amount,
        signal.price
      );
      
      console.log(`✅ Ордер создан: ${order.id}`);
      return order;
    });
  }

  public async cancelOrder(orderId: string, symbol: string): Promise<any> {
    return this.makeRequest(async () => {
      const order = await this.exchange.cancelOrder(orderId, symbol);
      console.log(`✅ Ордер отменен: ${orderId}`);
      return order;
    });
  }

  public async fetchOpenOrders(symbol?: string): Promise<Order[]> {
    return this.makeRequest(async () => {
      const orders = await this.exchange.fetchOpenOrders(symbol);
      return orders;
    });
  }

  public async fetchPositions(symbols?: string[]): Promise<Position[]> {
    return this.makeRequest(async () => {
      const positions = await this.exchange.fetchPositions(symbols);
      return positions.filter(pos => pos.contracts && pos.contracts !== 0); // Только открытые позиции
    });
  }

  // Получение информации о символах
  public async fetchMarkets(): Promise<any> {
    return this.makeRequest(async () => {
      const markets = await this.exchange.fetchMarkets();
      return markets;
    });
  }

  // Статистика rate limiter
  public getRateLimiterStats(): { requests: number, maxRequests: number } {
    return {
      requests: this.rateLimiter.getRequestsCount(),
      maxRequests: 200
    };
  }

  // Закрытие WebSocket соединений
  public disconnect(): void {
    this.publicWs.disconnect();
    this.privateWs.disconnect();
  }

  // Проверка подключения WebSocket
  public getWebSocketStatus(): { public: boolean, private: boolean } {
    return {
      public: this.publicWs.isConnected(),
      private: this.privateWs.isConnected()
    };
  }
}

export const bybitApi = new BybitApi(); 