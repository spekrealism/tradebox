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
  private rateLimiter: RateLimiter;
  private publicWs: BybitWebSocket;
  private privateWs: BybitWebSocket;

  constructor() {
    const exchangeOptions = {
      apiKey: config.bybit.apiKey,
      secret: config.bybit.apiSecret,
      options: {
        recvWindow: 5000, // 5 секунд для синхронизации времени
      }
    };

    this.exchange = new ccxt.bybit(exchangeOptions);
    this.rateLimiter = new RateLimiter(500, 5000); // 500 запросов за 5 секунд (с запасом)
    
    if (config.bybit.testnet) {
      this.exchange.setSandboxMode(true);
    }

    // Инициализация WebSocket соединений
    this.publicWs = new BybitWebSocket(false);
    this.privateWs = new BybitWebSocket(true);
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
    await this.rateLimiter.waitForSlot();
    
    if (!this.exchange.has['fetchOHLCV']) {
      throw new Error(`The exchange does not have fetchOHLCV method`);
    }

    console.log(`Получение OHLCV для ${symbol}... (${this.rateLimiter.getRequestsCount()}/500 запросов)`);
    try {
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
      console.log(`Получено ${ohlcv.length} свечей для ${symbol}`);
      return ohlcv;
    } catch (error) {
      console.error('Ошибка получения OHLCV данных:', error);
      throw error;
    }
  }

  public async fetchTicker(symbol: string): Promise<Ticker> {
    await this.rateLimiter.waitForSlot();
    
    console.log(`Получение тикера для ${symbol}...`);
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return ticker;
    } catch (error) {
      console.error('Ошибка получения тикера:', error);
      throw error;
    }
  }

  public async fetchOrderBook(symbol: string, limit?: number): Promise<OrderBook> {
    await this.rateLimiter.waitForSlot();
    
    try {
      const orderBook = await this.exchange.fetchOrderBook(symbol, limit);
      return orderBook;
    } catch (error) {
      console.error('Ошибка получения книги ордеров:', error);
      throw error;
    }
  }

  public async fetchBalance(): Promise<Balances> {
    await this.rateLimiter.waitForSlot();
    
    if (!config.bybit.apiKey) {
      throw new Error('API ключ не настроен');
    }

    try {
      const balance = await this.exchange.fetchBalance();
      return balance;
    } catch (error) {
      console.error('Ошибка получения баланса:', error);
      throw error;
    }
  }

  public async createOrder(signal: TradeSignal): Promise<Order> {
    await this.rateLimiter.waitForSlot();
    
    if (!config.bybit.apiKey) {
      throw new Error('API ключ не настроен для торговли');
    }

    console.log(`Создание ордера: ${signal.side} ${signal.amount} ${signal.symbol} по ${signal.price || 'рыночной цене'}`);
    
    try {
      const order = await this.exchange.createOrder(
        signal.symbol,
        signal.type,
        signal.side,
        signal.amount,
        signal.price
      );
      
      console.log(`✅ Ордер создан: ${order.id}`);
      return order;
    } catch (error) {
      console.error('Ошибка создания ордера:', error);
      throw error;
    }
  }

  public async cancelOrder(orderId: string, symbol: string): Promise<any> {
    await this.rateLimiter.waitForSlot();
    
    try {
      const order = await this.exchange.cancelOrder(orderId, symbol);
      console.log(`✅ Ордер отменен: ${orderId}`);
      return order;
    } catch (error) {
      console.error('Ошибка отмены ордера:', error);
      throw error;
    }
  }

  public async fetchOpenOrders(symbol?: string): Promise<Order[]> {
    await this.rateLimiter.waitForSlot();
    
    try {
      const orders = await this.exchange.fetchOpenOrders(symbol);
      return orders;
    } catch (error) {
      console.error('Ошибка получения открытых ордеров:', error);
      throw error;
    }
  }

  public async fetchPositions(symbols?: string[]): Promise<Position[]> {
    await this.rateLimiter.waitForSlot();
    
    try {
      const positions = await this.exchange.fetchPositions(symbols);
      return positions.filter(pos => pos.contracts && pos.contracts !== 0); // Только открытые позиции
    } catch (error) {
      console.error('Ошибка получения позиций:', error);
      throw error;
    }
  }

  // Получение информации о символах
  public async fetchMarkets(): Promise<any> {
    await this.rateLimiter.waitForSlot();
    
    try {
      const markets = await this.exchange.fetchMarkets();
      return markets;
    } catch (error) {
      console.error('Ошибка получения рынков:', error);
      throw error;
    }
  }

  // Статистика rate limiter
  public getRateLimiterStats(): { requests: number, maxRequests: number } {
    return {
      requests: this.rateLimiter.getRequestsCount(),
      maxRequests: 500
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