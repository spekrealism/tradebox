import { Pool } from 'pg';
import { config } from './config';

export interface OHLCVRecord {
  symbol: string;
  timeframe: string;
  timestamp: number; // ms since epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
});

/**
 * Выполняет запрос к БД, выводя его в консоль при debug
 */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

/**
 * Инициализация структуры БД – создаём расширение TimescaleDB, таблицу и hypertable.
 */
export async function initDb(): Promise<void> {
  // Создаём расширение, если его нет
  await query('CREATE EXTENSION IF NOT EXISTS timescaledb');

  // Создаём таблицу OHLCV
  await query(`
    CREATE TABLE IF NOT EXISTS ohlcv (
      symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      ts TIMESTAMPTZ NOT NULL,
      open NUMERIC,
      high NUMERIC,
      low NUMERIC,
      close NUMERIC,
      volume NUMERIC,
      PRIMARY KEY (symbol, timeframe, ts)
    );
  `);

  // Превращаем в hypertable (если ещё не)
  await query(`SELECT create_hypertable('ohlcv', 'ts', if_not_exists => TRUE);`);
}

/**
 * Массовое сохранение OHLCV.
 * Использует ON CONFLICT DO NOTHING, чтобы не дублировать записи.
 */
export async function saveOHLCVBulk(symbol: string, timeframe: string, candles: OHLCVRecord[]): Promise<void> {
  if (!candles.length) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  candles.forEach((c, idx) => {
    const base = idx * 8; // 8 полей
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
    values.push(
      symbol,
      timeframe,
      new Date(c.timestamp),
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
    );
  });

  const insertQuery = `INSERT INTO ohlcv (symbol, timeframe, ts, open, high, low, close, volume) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING;`;
  await query(insertQuery, values);
} 