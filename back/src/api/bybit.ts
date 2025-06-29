import ccxt, { Exchange } from 'ccxt';
import { config } from '../config';

class BybitApi {
  private exchange: Exchange;

  constructor() {
    const exchangeOptions = {
      apiKey: config.bybit.apiKey,
      secret: config.bybit.apiSecret,
    };

    this.exchange = new ccxt.bybit(exchangeOptions);

    if (config.bybit.testnet) {
      this.exchange.setSandboxMode(true);
    }
  }

  public async fetchOHLCV(symbol: string, timeframe = '1h', since?: number, limit?: number) {
    if (!this.exchange.has['fetchOHLCV']) {
      throw new Error(`The exchange does not have fetchOHLCV method`);
    }

    console.log(`Fetching OHLCV for ${symbol}...`);
    try {
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, since, limit);
      console.log(`Fetched ${ohlcv.length} candles.`);
      return ohlcv;
    } catch (error) {
      console.error('Error fetching OHLCV data:', error);
      throw error;
    }
  }
}

export const bybitApi = new BybitApi(); 