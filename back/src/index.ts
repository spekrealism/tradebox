import { startServer } from './server';
import { bybitApi } from './api/bybit';

async function main() {
  console.log("🤖 Запуск трейдинг бота...");

  try {
    // Запуск HTTP сервера с API
    await startServer();

    // Пример работы с WebSocket подписками
    setTimeout(async () => {
      console.log("📡 Настройка WebSocket подписок...");
      
      // Подписка на тикер BTC/USDT
      bybitApi.subscribeToTicker('BTCUSDT', (data: any) => {
        if (process.env.ENABLE_WEBSOCKET_LOGS === 'true') {
          console.log('📊 Тикер BTCUSDT:', {
            price: data.data?.lastPrice,
            volume: data.data?.volume24h,
            timestamp: new Date(data.ts).toISOString()
          });
        }
      });

      // Подписка на книгу ордеров
      bybitApi.subscribeToOrderBook('BTCUSDT', 25, (data: any) => {
        if (process.env.ENABLE_WEBSOCKET_LOGS === 'true') {
          console.log('📖 Книга ордеров BTCUSDT обновлена:', {
            bids: data.data?.b?.length || 0,
            asks: data.data?.a?.length || 0,
            timestamp: new Date(data.ts).toISOString()
          });
        }
      });

      // Подписка на сделки
      bybitApi.subscribeToTrades('BTCUSDT', (data: any) => {
        if (process.env.ENABLE_WEBSOCKET_LOGS === 'true') {
          console.log('💰 Новая сделка BTCUSDT:', {
            price: data.data?.[0]?.p,
            size: data.data?.[0]?.v,
            side: data.data?.[0]?.S,
            timestamp: new Date(data.ts).toISOString()
          });
        }
      });

      console.log("✅ WebSocket подписки настроены");
    }, 3000);

    // Пример получения данных через REST API
    setTimeout(async () => {
      try {
        console.log("📈 Получение исторических данных...");
        const symbol = 'BTCUSDT';
        const limit = 5;
        const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, limit);

        console.log(`\n--- Последние ${limit} свечей для ${symbol} ---`);
        ohlcv.forEach(candle => {
          if (candle[0]) {
            console.log({
              timestamp: new Date(candle[0]).toISOString(),
              open: candle[1],
              high: candle[2],
              low: candle[3],
              close: candle[4],
              volume: candle[5],
            });
          }
        });
        console.log("------------------------------------\n");
      } catch (error) {
        console.error("Ошибка получения данных:", error);
      }
    }, 5000);

  } catch (error) {
    console.error("Ошибка запуска трейдинг бота:", error);
    process.exit(1);
  }
}

main(); 