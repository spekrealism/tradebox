export class RateLimiter {
  private httpRequests: number[];
  private websocketRequests: number[];
  private maxHttpRequests: number;
  private maxWebsocketRequests: number;
  private windowMs: number;
  private backoffDelay: number = 1000; // Начальная задержка для backoff

  constructor(maxHttpRequests: number = 200, maxWebsocketRequests: number = 50, windowMs: number = 60000) {
    this.httpRequests = [];
    this.websocketRequests = [];
    this.maxHttpRequests = maxHttpRequests;
    this.maxWebsocketRequests = maxWebsocketRequests;
    this.windowMs = windowMs;
  }

  async waitForHttpSlot(): Promise<void> {
    const now = Date.now();
    
    // Удаляем старые HTTP запросы, выходящие за временное окно
    this.httpRequests = this.httpRequests.filter(timestamp => now - timestamp < this.windowMs);
    
    // Если достигли лимита HTTP запросов, ждем
    if (this.httpRequests.length >= this.maxHttpRequests) {
      const oldestRequest = Math.min(...this.httpRequests);
      const waitTime = this.windowMs - (now - oldestRequest) + 1000; // +1000ms буфер
      
      console.log(`HTTP Rate limit достигнут. Ожидание ${waitTime}ms... (${this.httpRequests.length}/${this.maxHttpRequests})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      return this.waitForHttpSlot(); // Рекурсивная проверка
    }
    
    // Записываем текущий HTTP запрос
    this.httpRequests.push(now);
  }

  async waitForWebSocketSlot(): Promise<void> {
    const now = Date.now();
    
    // Удаляем старые WebSocket запросы, выходящие за временное окно
    this.websocketRequests = this.websocketRequests.filter(timestamp => now - timestamp < this.windowMs);
    
    // Если достигли лимита WebSocket запросов, ждем
    if (this.websocketRequests.length >= this.maxWebsocketRequests) {
      const oldestRequest = Math.min(...this.websocketRequests);
      const waitTime = this.windowMs - (now - oldestRequest) + 1000; // +1000ms буфер
      
      console.log(`WebSocket Rate limit достигнут. Ожидание ${waitTime}ms... (${this.websocketRequests.length}/${this.maxWebsocketRequests})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      return this.waitForWebSocketSlot(); // Рекурсивная проверка
    }
    
    // Записываем текущий WebSocket запрос
    this.websocketRequests.push(now);
  }

  // Метод для обработки ошибок rate limit с экспоненциальной задержкой
  async handleRateLimitError(): Promise<void> {
    console.log(`Rate limit ошибка от сервера. Ожидание ${this.backoffDelay}ms...`);
    await new Promise(resolve => setTimeout(resolve, this.backoffDelay));
    
    // Увеличиваем задержку экспоненциально (но не более 30 секунд)
    this.backoffDelay = Math.min(this.backoffDelay * 2, 30000);
  }

  // Сброс backoff задержки при успешном запросе
  resetBackoff(): void {
    this.backoffDelay = 1000;
  }

  getHttpRequestsCount(): number {
    const now = Date.now();
    this.httpRequests = this.httpRequests.filter(timestamp => now - timestamp < this.windowMs);
    return this.httpRequests.length;
  }

  getWebSocketRequestsCount(): number {
    const now = Date.now();
    this.websocketRequests = this.websocketRequests.filter(timestamp => now - timestamp < this.windowMs);
    return this.websocketRequests.length;
  }

  getTotalRequestsCount(): number {
    return this.getHttpRequestsCount() + this.getWebSocketRequestsCount();
  }

  reset(): void {
    this.httpRequests = [];
    this.websocketRequests = [];
    this.backoffDelay = 1000;
  }

  // Метод для регистрации WebSocket активности (ping, subscribe, etc.)
  recordWebSocketActivity(): void {
    const now = Date.now();
    this.websocketRequests.push(now);
    
    // Ограничиваем количество записей в памяти
    if (this.websocketRequests.length > this.maxWebsocketRequests * 2) {
      this.websocketRequests = this.websocketRequests.slice(-this.maxWebsocketRequests);
    }
  }
} 