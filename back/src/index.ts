import { bybitApi } from './api/bybit';

async function main() {
  console.log("Starting trading bot...");

  try {
    const symbol = 'BTC/USDT';
    const limit = 5; // Fetch last 5 candles
    const ohlcv = await bybitApi.fetchOHLCV(symbol, '1h', undefined, limit);

    console.log(`\n--- Last ${limit} candles for ${symbol} ---`);
    ohlcv.forEach(candle => {
      if (candle[0]) { // Ensure timestamp is not undefined
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
    console.error("An error occurred in the main function:", error);
  }

  console.log("Trading bot finished its task.");
}

main(); 