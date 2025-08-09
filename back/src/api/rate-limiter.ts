export class RateLimiter {
  private requests: number[];
  private maxRequests: number;
  private windowMs: number;
  private backoffDelay: number = 1000; // Начальная задержка для backoff

  constructor(maxRequests: number = 500, windowMs: number = 60000) { // 100 запросов в минуту
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Удаляем старые запросы, выходящие за временное окно
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    
    // Если достигли лимита, ждем
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest) + 1000; // +1000ms буфер
      
      console.log(`Rate limit достигнут. Ожидание ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      return this.waitForSlot(); // Рекурсивная проверка
    }
    
    // Записываем текущий запрос
    this.requests.push(now);
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

  getRequestsCount(): number {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    return this.requests.length;
  }

  reset(): void {
    this.requests = [];
    this.backoffDelay = 1000;
  }
} 