import ccxt, { Exchange, Order, Ticker, OrderBook, Balances, Position } from 'ccxt';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
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

    // Более консервативные настройки: 200 HTTP + 50 WebSocket запросов за 60 секунд
    this.rateLimiter = new RateLimiter(200, 50, 60000);
    
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
      await this.rateLimiter.waitForHttpSlot();
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
        await this.rateLimiter.waitForHttpSlot();
        await this.syncServerTime();
        
        const result = await requestFunc();
        this.rateLimiter.resetBackoff();
        return result;
      } catch (error: any) {
        console.error(
          `Попытка ${attempt}/${retries} не удалась:`,
          error.message,
          process.env.DEBUG ? error : ''
        );
        
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
  async subscribeToTicker(symbol: string, callback: Function): Promise<void> {
    const topic = `tickers.${symbol}`;
    await this.publicWs.subscribe(topic, callback);
  }

  // Подписка на книгу ордеров через WebSocket
  async subscribeToOrderBook(symbol: string, depth: number = 25, callback: Function): Promise<void> {
    // Правильный формат для Bybit V5: orderBook.{depth}.{symbol}
    const topic = `orderBook.${depth}.${symbol}`;
    await this.publicWs.subscribe(topic, callback);
  }

  // Подписка на сделки через WebSocket
  async subscribeToTrades(symbol: string, callback: Function): Promise<void> {
    const topic = `publicTrade.${symbol}`;
    await this.publicWs.subscribe(topic, callback);
  }

  // Подписка на позиции через приватный WebSocket
  async subscribeToPositions(callback: Function): Promise<void> {
    if (!config.bybit.apiKey) {
      throw new Error('API ключ не настроен для приватных подписок');
    }
    await this.privateWs.subscribe('position', callback);
  }

  // Подписка на ордера через приватный WebSocket
  async subscribeToOrders(callback: Function): Promise<void> {
    if (!config.bybit.apiKey) {
      throw new Error('API ключ не настроен для приватных подписок');
    }
    await this.privateWs.subscribe('order', callback);
  }

  public async fetchOHLCV(symbol: string, timeframe = '1h', since?: number, limit?: number) {
    return this.makeRequest(async () => {
      if (!this.publicExchange.has['fetchOHLCV']) {
        throw new Error(`The exchange does not have fetchOHLCV method`);
      }

      console.log(`Получение OHLCV для ${symbol}... (${this.rateLimiter.getHttpRequestsCount()}/200 HTTP запросов)`);
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
      return positions.filter((pos: any) => pos.contracts && pos.contracts !== 0); // Только открытые позиции
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
  public getRateLimiterStats(): { httpRequests: number, websocketRequests: number, maxHttpRequests: number, maxWebsocketRequests: number } {
    return {
      httpRequests: this.rateLimiter.getHttpRequestsCount(),
      websocketRequests: this.rateLimiter.getWebSocketRequestsCount(),
      maxHttpRequests: 200,
      maxWebsocketRequests: 50
    };
  }

  // Закрытие WebSocket соединений
  public async disconnect(): Promise<void> {
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

  // Методы для работы с суб-аккаунтами
  public async createSubAccount(username: string, memberType: 1 | 6 = 1, note?: string): Promise<any> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен для операций с суб-аккаунтами');
      }

      const params = {
        username,
        memberType, // 1 - нормальный суб-аккаунт, 6 - кастодиальный
        ...(note && { note })
      };

      // Используем приватный эндпоинт Bybit V5 для создания суб-аккаунта
      const response = await (this.exchange as any).privatePostV5UserCreateSubMember(params);
      return response;
    });
  }

  public async getSubAccounts(): Promise<any> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен для операций с суб-аккаунтами');
      }

      const response = await (this.exchange as any).privateGetV5UserQuerySubMembers();
      return response;
    });
  }

  public async createSubAccountApiKey(
    subUid: string | number,
    permissions: Record<string, string[]> = {
      Spot: ['SpotTrade'],
      ContractTrade: ['Order', 'Position'],
      Wallet: ['AccountTransfer'],
    }
  ): Promise<any> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен для операций с суб-аккаунтами');
      }

      // Ensure subuid is an integer as required by the API
      const subuidInt = typeof subUid === 'string' ? parseInt(subUid, 10) : subUid;
      if (isNaN(subuidInt as any)) {
        throw new Error('subUid должен быть числом');
      }

      const params: any = {
        subuid: subuidInt,
        readOnly: 0,
        permissions,
      };

      // The official docs do not require request_id here; if idempotency issues appear, you can uncomment the next line:
      // params.request_id = uuidv4();

      const response = await (this.exchange as any).privatePostV5UserCreateSubApi(params);
      return response;
    });
  }

  public async getSubAccountBalance(subUid: string, accountType: string = 'UNIFIED'): Promise<any> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен для операций с суб-аккаунтами');
      }

      const params = {
        memberId: subUid,
        accountType // UNIFIED, CONTRACT, SPOT
      };

      const response = await (this.exchange as any).privateGetV5AssetTransferQuerySubMemberList(params);
      return response;
    });
  }

  public async transferToSubAccount(
    subUid: string, 
    coin: string, 
    amount: string, 
    fromAccountType: string = 'UNIFIED',
    toAccountType: string = 'UNIFIED'
  ): Promise<any> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен для внутренних переводов');
      }

      const params = {
        transferId: uuidv4(),
        coin,
        amount,
        fromMemberId: await this.getCurrentUid(), // Главный аккаунт
        toMemberId: subUid,
        fromAccountType,
        toAccountType,
      };

      const response = await (this.exchange as any).privatePostV5AssetTransferUniversalTransfer(params);
      return response;
    });
  }

  /**
   * Internal transfer between different account types under the same UID.
   * Ошибка 131200 = переданы одинаковые fromAccountType и toAccountType.
   */
  public async internalTransferBetweenAccountTypes(
    coin: string,
    amount: string,
    fromAccountType: string,
    toAccountType: string
  ): Promise<any> {
    const fromType = fromAccountType.toUpperCase();
    const toType = toAccountType.toUpperCase();
    if (fromType === toType) {
      throw new Error('fromAccountType и toAccountType должны быть разными');
    }
    return this.makeRequest(async () => {
      const params = {
        transferId: uuidv4(),
        coin: coin.toUpperCase(),
        amount,
        fromAccountType: 'UNIFIED',
        toAccountType: 'UNIFIED',
      };
      const response = await (this.exchange as any).privatePostV5AssetTransferInterTransfer(params);
      return response;
    });
  }

  public async getCurrentUid(): Promise<string> {
    return this.makeRequest(async () => {
      if (!config.bybit.apiKey) {
        throw new Error('API ключ не настроен');
      }

      const response = await (this.exchange as any).privateGetV5UserQueryApi();
      // console.log(`[BybitApi DEBUG] getCurrentUid response:`, JSON.stringify(response, null, 2));
      
      // В ответе поле называется 'userID', а не 'uid'
      if (response.result && response.result.userID) {
        return response.result.userID;
      } else if (response.result && response.result.userID) {
        return response.result.userID;
      } else {
        throw new Error('Не удалось получить UID из ответа API');
      }
    });
  }

  // Создание экземпляра для конкретного суб-аккаунта
  public createSubAccountInstance(apiKey: string, secret: string): BybitApi {
    const subAccountConfig = {
      ...config,
      bybit: {
        ...config.bybit,
        apiKey,
        apiSecret: secret
      }
    };

    // Создаем новый экземпляр с конфигурацией суб-аккаунта
    const subAccountApi = new BybitApi();
    
    // Переопределяем exchange для суб-аккаунта
    const exchangeOptions = {
      apiKey,
      secret,
      options: {
        recvWindow: 10000,
      }
    };

    subAccountApi.exchange = new ccxt.bybit(exchangeOptions);
    
    if (config.bybit.testnet) {
      subAccountApi.exchange.setSandboxMode(true);
    }

    return subAccountApi;
  }
}

export const bybitApi = new BybitApi(); 