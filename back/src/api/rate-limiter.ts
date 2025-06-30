export class RateLimiter {
  private requests: number[];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 600, windowMs: number = 5000) {
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
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // +100ms буфер
      
      console.log(`Rate limit достигнут. Ожидание ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      return this.waitForSlot(); // Рекурсивная проверка
    }
    
    // Записываем текущий запрос
    this.requests.push(now);
  }

  getRequestsCount(): number {
    const now = Date.now();
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    return this.requests.length;
  }

  reset(): void {
    this.requests = [];
  }
} 