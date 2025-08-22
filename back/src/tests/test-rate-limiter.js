const { RateLimiter } = require('./dist/api/rate-limiter');

async function testRateLimiter() {
  console.log('🧪 Тестирование нового Rate Limiter...\n');

  const rateLimiter = new RateLimiter(200, 50, 60000);

  // Тест HTTP запросов
  console.log('📡 Тестирование HTTP rate limiting...');
  for (let i = 0; i < 5; i++) {
    await rateLimiter.waitForHttpSlot();
    console.log(`HTTP запрос ${i + 1}: ${rateLimiter.getHttpRequestsCount()}/200`);
  }

  // Тест WebSocket запросов
  console.log('\n🔌 Тестирование WebSocket rate limiting...');
  for (let i = 0; i < 5; i++) {
    await rateLimiter.waitForWebSocketSlot();
    rateLimiter.recordWebSocketActivity();
    console.log(`WebSocket запрос ${i + 1}: ${rateLimiter.getWebSocketRequestsCount()}/50`);
  }

  // Тест общей статистики
  console.log('\n📊 Общая статистика:');
  console.log(`HTTP запросы: ${rateLimiter.getHttpRequestsCount()}/200`);
  console.log(`WebSocket запросы: ${rateLimiter.getWebSocketRequestsCount()}/50`);
  console.log(`Всего запросов: ${rateLimiter.getTotalRequestsCount()}/250`);

  // Тест сброса
  console.log('\n🔄 Тестирование сброса...');
  rateLimiter.reset();
  console.log(`После сброса - HTTP: ${rateLimiter.getHttpRequestsCount()}, WebSocket: ${rateLimiter.getWebSocketRequestsCount()}`);

  console.log('\n✅ Тест завершен!');
}

testRateLimiter().catch(console.error);
