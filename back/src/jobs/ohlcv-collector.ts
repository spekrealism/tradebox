import cron from 'node-cron';
import { bybitApi } from '../api/bybit';
import { saveOHLCVBulk, OHLCVRecord } from '../db';

const SYMBOLS = ['BTCUSDT'];
const TIMEFRAME = '1m';
const LIMIT = 10; // Уменьшено с 60 до 10 - только последние 10 минут

export function startCollector() {
  // Изменено с каждой минуты на каждые 5 минут
  cron.schedule('*/5 * * * *', async () => {
    console.log('🔄 Запуск OHLCV collector...');
    
    try {
      // Добавляем задержку между символами чтобы не делать все запросы одновременно
      for (let i = 0; i < SYMBOLS.length; i++) {
        const symbol = SYMBOLS[i];
        
        // Задержка между символами
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды между символами
        }
        
        try {
          console.log(`📊 Получение данных для ${symbol}...`);
          const candles = await bybitApi.fetchOHLCV(symbol, TIMEFRAME, undefined, LIMIT);
          
          const mapped: OHLCVRecord[] = candles.map(([ts, o, h, l, c, v]) => ({
            symbol,
            timeframe: TIMEFRAME,
            timestamp: Number(ts),
            open: Number(o),
            high: Number(h),
            low: Number(l),
            close: Number(c),
            volume: Number(v),
          }));
          
          await saveOHLCVBulk(symbol, TIMEFRAME, mapped);
          console.log(`✅ Сохранено ${mapped.length} свечей для ${symbol}`);
        } catch (symbolError) {
          console.error(`❌ Ошибка для символа ${symbol}:`, symbolError);
          // Продолжаем с другими символами даже если один не удался
        }
      }
      
      console.log('📥 OHLCV данные обновлены в TimescaleDB');
    } catch (err) {
      console.error('❌ Критическая ошибка OHLCV collector:', err);
    }
  });
  
  console.log('⏲️  Планировщик OHLCV Collector запущен (каждые 5 минут)');
} 