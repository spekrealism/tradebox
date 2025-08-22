import WebSocket from 'ws';
import crypto from 'crypto';
import { config } from '../config';
import { RateLimiter } from './rate-limiter';

export interface BybitWebSocketData {
  topic: string;
  data: any;
  ts: number;
  type: string;
}

export class BybitWebSocket {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private pingInterval: NodeJS.Timeout | null = null;
  private subscriptions: Set<string> = new Set();
  private messageHandlers: Map<string, Function[]> = new Map();
  private rateLimiter: RateLimiter;

  private readonly baseUrl: string;
  private readonly isPrivate: boolean;

  constructor(isPrivate = false) {
    this.isPrivate = isPrivate;
    this.baseUrl = config.bybit.testnet 
      ? (isPrivate ? 'wss://stream-testnet.bybit.com/v5/private' : 'wss://stream-testnet.bybit.com/v5/public/linear')
      : (isPrivate ? 'wss://stream.bybit.com/v5/private' : 'wss://stream.bybit.com/v5/public/linear');
    
    // Инициализируем rate limiter для WebSocket операций
    this.rateLimiter = new RateLimiter(200, 50, 60000);
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    
    try {
      console.log(`Подключение к Bybit WebSocket: ${this.baseUrl}`);
      this.ws = new WebSocket(this.baseUrl);

      this.ws.on('open', async () => {
        console.log('✅ WebSocket подключен к Bybit');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        if (this.isPrivate) {
          this.authenticate();
        }
        
        this.startPing();
        await this.resubscribeAll();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('Ошибка парсинга WebSocket сообщения:', error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`WebSocket закрыт. Код: ${code}, Причина: ${reason.toString()}`);
        this.cleanup();
        this.scheduleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        console.error('WebSocket ошибка:', error);
        this.cleanup();
        this.scheduleReconnect();
      });

    } catch (error) {
      console.error('Ошибка подключения WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private authenticate(): void {
    if (!config.bybit.apiKey || !config.bybit.apiSecret) {
      console.error('API ключи не настроены для приватного WebSocket');
      return;
    }

    // Используем текущее время + 10 секунд для expires
    // В соответствии с документацией: server_time - recv_window <= timestamp < server_time + 1000
    const expires = Date.now() + 10000;
    const signature = crypto
      .createHmac('sha256', config.bybit.apiSecret)
      .update(`GET/realtime${expires}`)
      .digest('hex');

    const authMessage = {
      op: 'auth',
      args: [config.bybit.apiKey, expires, signature]
    };

    console.log('🔐 Отправка аутентификации WebSocket...');
    this.send(authMessage);
  }

  private startPing(): void {
    this.pingInterval = setInterval(async () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          // Проверяем, не слишком ли много WebSocket запросов
          if (this.rateLimiter.getWebSocketRequestsCount() < 40) { // Оставляем запас
            await this.rateLimiter.waitForWebSocketSlot();
            this.send({ op: 'ping' });
            this.rateLimiter.recordWebSocketActivity();
          } else {
            console.log('Пропускаем ping из-за высокого количества WebSocket запросов');
          }
        } catch (error) {
          console.warn('Не удалось отправить ping из-за rate limit:', error);
        }
      }
    }, 45000); // Увеличиваем интервал до 45 секунд для снижения нагрузки
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.isConnecting = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Максимальное количество попыток переподключения достигнуто');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Переподключение через ${delay}ms (попытка ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private async resubscribeAll(): Promise<void> {
    if (this.subscriptions.size > 0) {
      try {
        await this.rateLimiter.waitForWebSocketSlot();
        console.log('Повторная подписка на топики:', Array.from(this.subscriptions));
        const subscribeMessage = {
          op: 'subscribe',
          args: Array.from(this.subscriptions)
        };
        this.send(subscribeMessage);
        this.rateLimiter.recordWebSocketActivity();
      } catch (error) {
        console.warn('Не удалось переподписаться из-за rate limit:', error);
      }
    }
  }

  private handleMessage(message: any): void {
    if (message.op === 'pong') {
      // Pong ответ на ping
      return;
    }

    if (message.op === 'auth') {
      if (message.success) {
        console.log('✅ WebSocket авторизация успешна');
      } else {
        console.error('❌ WebSocket авторизация не удалась:', message.ret_msg);
      }
      return;
    }

    if (message.op === 'subscribe') {
      if (message.success) {
        console.log('✅ Подписка успешна:', message.req_id);
      } else {
        console.error('❌ Подписка не удалась:', message.ret_msg);
      }
      return;
    }

    // Обработка данных топиков
    if (message.topic && message.data) {
      this.notifyHandlers(message.topic, message);
    }
  }

  private notifyHandlers(topic: string, data: any): void {
    const handlers = this.messageHandlers.get(topic) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Ошибка в обработчике для топика ${topic}:`, error);
      }
    });
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket не подключен, сообщение не отправлено:', data);
    }
  }

  async subscribe(topic: string, handler?: Function): Promise<void> {
    this.subscriptions.add(topic);
    
    if (handler) {
      if (!this.messageHandlers.has(topic)) {
        this.messageHandlers.set(topic, []);
      }
      this.messageHandlers.get(topic)!.push(handler);
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        await this.rateLimiter.waitForWebSocketSlot();
        const subscribeMessage = {
          op: 'subscribe',
          args: [topic]
        };
        this.send(subscribeMessage);
        this.rateLimiter.recordWebSocketActivity();
      } catch (error) {
        console.warn('Не удалось подписаться из-за rate limit:', error);
      }
    }
  }

  async unsubscribe(topic: string): Promise<void> {
    this.subscriptions.delete(topic);
    this.messageHandlers.delete(topic);

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        await this.rateLimiter.waitForWebSocketSlot();
        const unsubscribeMessage = {
          op: 'unsubscribe',
          args: [topic]
        };
        this.send(unsubscribeMessage);
        this.rateLimiter.recordWebSocketActivity();
      } catch (error) {
        console.warn('Не удалось отписаться из-за rate limit:', error);
      }
    }
  }

  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.messageHandlers.clear();
    this.rateLimiter.reset();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  // Получение статистики rate limiter для WebSocket
  getRateLimiterStats(): { websocketRequests: number, maxWebsocketRequests: number } {
    return {
      websocketRequests: this.rateLimiter.getWebSocketRequestsCount(),
      maxWebsocketRequests: 50
    };
  }
} 