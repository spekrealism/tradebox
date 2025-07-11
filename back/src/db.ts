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
export const initDb = async (): Promise<void> => {
  try {
    console.log('📊 Подключение к TimescaleDB установлено');

    // Создание основной таблицы OHLCV
    await query(`
      CREATE TABLE IF NOT EXISTS ohlcv (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        timeframe VARCHAR(10) NOT NULL,
        timestamp BIGINT NOT NULL,
        open DECIMAL(20, 8) NOT NULL,
        high DECIMAL(20, 8) NOT NULL,
        low DECIMAL(20, 8) NOT NULL,
        close DECIMAL(20, 8) NOT NULL,
        volume DECIMAL(20, 8) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Создание индексов для быстрого поиска
    await query(`
      CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_timeframe_timestamp 
      ON ohlcv (symbol, timeframe, timestamp DESC);
    `);

    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ohlcv_unique 
      ON ohlcv (symbol, timeframe, timestamp);
    `);

    // Создание таблицы торговых ботов
    await query(`
      CREATE TABLE IF NOT EXISTS trading_bots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        strategy VARCHAR(50) NOT NULL CHECK (strategy IN ('ml', 'openai', 'custom')),
        status VARCHAR(20) NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'stopped', 'error')),
        
        sub_account_id VARCHAR(50) NOT NULL,
        sub_account_username VARCHAR(100) NOT NULL,
        api_key VARCHAR(500) NOT NULL,
        api_secret VARCHAR(500) NOT NULL,
        
        trading_pairs TEXT[] NOT NULL DEFAULT '{}',
        position_size DECIMAL(20, 8) NOT NULL DEFAULT 0.001,
        max_drawdown DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
        risk_level VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
        
        total_trades INTEGER NOT NULL DEFAULT 0,
        winning_trades INTEGER NOT NULL DEFAULT 0,
        total_pnl DECIMAL(20, 8) NOT NULL DEFAULT 0,
        current_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
        initial_balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
        
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_trade_at TIMESTAMPTZ
      );
    `);

    // Создание таблицы истории сделок
    await query(`
      CREATE TABLE IF NOT EXISTS trade_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bot_id UUID NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
        amount DECIMAL(20, 8) NOT NULL,
        price DECIMAL(20, 8) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        order_id VARCHAR(100) NOT NULL,
        pnl DECIMAL(20, 8),
        fees DECIMAL(20, 8),
        signal_type VARCHAR(20),
        signal_confidence DECIMAL(5, 4),
        signal_reasoning TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Создание таблицы производительности ботов
    await query(`
      CREATE TABLE IF NOT EXISTS bot_performance (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bot_id UUID NOT NULL REFERENCES trading_bots(id) ON DELETE CASCADE,
        timeframe VARCHAR(10) NOT NULL CHECK (timeframe IN ('1h', '1d', '1w', '1m')),
        total_return DECIMAL(10, 4) NOT NULL,
        sharpe_ratio DECIMAL(10, 4),
        win_rate DECIMAL(5, 4) NOT NULL,
        avg_win DECIMAL(20, 8),
        avg_loss DECIMAL(20, 8),
        max_drawdown DECIMAL(5, 2),
        total_trades INTEGER NOT NULL,
        profit_factor DECIMAL(10, 4),
        calculated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(bot_id, timeframe)
      );
    `);

    // Индексы для оптимизации запросов
    await query(`CREATE INDEX IF NOT EXISTS idx_trading_bots_status ON trading_bots(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_trading_bots_strategy ON trading_bots(strategy);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_trade_records_bot_id ON trade_records(bot_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_trade_records_timestamp ON trade_records(timestamp DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bot_performance_bot_id ON bot_performance(bot_id);`);

    console.log('✅ Все таблицы БД инициализированы успешно');
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
    throw error;
  }
};

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
      new Date(c.timestamp).getTime(),
      c.open,
      c.high,
      c.low,
      c.close,
      c.volume,
    );
  });

  const insertQuery = `INSERT INTO ohlcv (symbol, timeframe, timestamp, open, high, low, close, volume) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING;`;
  await query(insertQuery, values);
}

/**
 * Получает последние N OHLCV записей для символа/таймфрейма из TimescaleDB.
 * Возвращает массив в формате ccxt: [timestamp, open, high, low, close, volume]
 */
export async function fetchOHLCVFromDb(symbol: string, timeframe: string, limit: number = 100): Promise<number[][]> {
  const rows = await query<{
    timestamp: string,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number,
  }>(
    `SELECT timestamp, open, high, low, close, volume
     FROM ohlcv
     WHERE symbol = $1 AND timeframe = $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [symbol, timeframe, limit]
  );

  // Возвращаем в обратном порядке (от старых к новым)
  return rows.reverse().map(r => [
    new Date(r.timestamp).getTime(),
    Number(r.open),
    Number(r.high),
    Number(r.low),
    Number(r.close),
    Number(r.volume),
  ]);
}

// Функции для работы с торговыми ботами
export async function createTradingBot(bot: Omit<import('./types').TradingBot, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const result = await query<{ id: string }>(`
    INSERT INTO trading_bots (
      name, description, strategy, status,
      sub_account_id, sub_account_username, api_key, api_secret,
      trading_pairs, position_size, max_drawdown, risk_level,
      total_trades, winning_trades, total_pnl, current_balance, initial_balance
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id
  `, [
    bot.name, bot.description, bot.strategy, bot.status,
    bot.subAccountId, bot.subAccountUsername, bot.apiKey, bot.apiSecret,
    bot.tradingPairs, bot.positionSize, bot.maxDrawdown, bot.riskLevel,
    bot.totalTrades, bot.winningTrades, bot.totalPnL, bot.currentBalance, bot.initialBalance
  ]);
  
  return result[0].id;
}

export async function getAllTradingBots(): Promise<import('./types').TradingBot[]> {
  const rows = await query<any>(`
    SELECT 
      id, name, description, strategy, status,
      sub_account_id as "subAccountId", 
      sub_account_username as "subAccountUsername",
      api_key as "apiKey", 
      api_secret as "apiSecret",
      trading_pairs as "tradingPairs", 
      position_size as "positionSize", 
      max_drawdown as "maxDrawdown", 
      risk_level as "riskLevel",
      total_trades as "totalTrades", 
      winning_trades as "winningTrades", 
      total_pnl as "totalPnL", 
      current_balance as "currentBalance", 
      initial_balance as "initialBalance",
      created_at as "createdAt", 
      updated_at as "updatedAt", 
      last_trade_at as "lastTradeAt"
    FROM trading_bots
    ORDER BY created_at DESC
  `);
  
  return rows.map(row => ({
    ...row,
    tradingPairs: row.tradingPairs || [],
    positionSize: Number(row.positionSize),
    maxDrawdown: Number(row.maxDrawdown),
    totalTrades: Number(row.totalTrades),
    winningTrades: Number(row.winningTrades),
    totalPnL: Number(row.totalPnL),
    currentBalance: Number(row.currentBalance),
    initialBalance: Number(row.initialBalance),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastTradeAt: row.lastTradeAt?.toISOString()
  }));
}

export async function getTradingBotById(id: string): Promise<import('./types').TradingBot | null> {
  const rows = await query<any>(`
    SELECT 
      id, name, description, strategy, status,
      sub_account_id as "subAccountId", 
      sub_account_username as "subAccountUsername",
      api_key as "apiKey", 
      api_secret as "apiSecret",
      trading_pairs as "tradingPairs", 
      position_size as "positionSize", 
      max_drawdown as "maxDrawdown", 
      risk_level as "riskLevel",
      total_trades as "totalTrades", 
      winning_trades as "winningTrades", 
      total_pnl as "totalPnL", 
      current_balance as "currentBalance", 
      initial_balance as "initialBalance",
      created_at as "createdAt", 
      updated_at as "updatedAt", 
      last_trade_at as "lastTradeAt"
    FROM trading_bots 
    WHERE id = $1
  `, [id]);
  
  if (rows.length === 0) return null;
  
  const row = rows[0];
  return {
    ...row,
    tradingPairs: row.tradingPairs || [],
    positionSize: Number(row.positionSize),
    maxDrawdown: Number(row.maxDrawdown),
    totalTrades: Number(row.totalTrades),
    winningTrades: Number(row.winningTrades),
    totalPnL: Number(row.totalPnL),
    currentBalance: Number(row.currentBalance),
    initialBalance: Number(row.initialBalance),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastTradeAt: row.lastTradeAt?.toISOString()
  };
}

export async function updateTradingBot(id: string, updates: Partial<import('./types').TradingBot>): Promise<void> {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined && key !== 'id') {
      // Конвертируем camelCase в snake_case
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      setClause.push(`${dbKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (setClause.length === 0) return;

  setClause.push(`updated_at = NOW()`);
  values.push(id);

  await query(`
    UPDATE trading_bots 
    SET ${setClause.join(', ')}
    WHERE id = $${paramIndex}
  `, values);
}

export async function deleteTradingBot(id: string): Promise<void> {
  await query('DELETE FROM trading_bots WHERE id = $1', [id]);
}

// Функции для работы с записями сделок
export async function createTradeRecord(trade: Omit<import('./types').TradeRecord, 'id'>): Promise<string> {
  const result = await query<{ id: string }>(`
    INSERT INTO trade_records (
      bot_id, symbol, side, amount, price, timestamp, order_id, 
      pnl, fees, signal_type, signal_confidence, signal_reasoning
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `, [
    trade.botId, trade.symbol, trade.side, trade.amount, trade.price, 
    trade.timestamp, trade.orderId, trade.pnl, trade.fees,
    trade.signal?.type, trade.signal?.confidence, trade.signal?.reasoning
  ]);
  
  return result[0].id;
}

export async function getTradeHistory(botId: string, limit: number = 100): Promise<import('./types').TradeRecord[]> {
  const rows = await query<any>(`
    SELECT 
      id, bot_id as "botId", symbol, side, amount, price, 
      timestamp, order_id as "orderId", pnl, fees,
      signal_type as "signalType", signal_confidence as "signalConfidence", 
      signal_reasoning as "signalReasoning"
    FROM trade_records 
    WHERE bot_id = $1 
    ORDER BY timestamp DESC 
    LIMIT $2
  `, [botId, limit]);
  
  return rows.map(row => ({
    id: row.id,
    botId: row.botId,
    symbol: row.symbol,
    side: row.side,
    amount: Number(row.amount),
    price: Number(row.price),
    timestamp: row.timestamp,
    orderId: row.orderId,
    pnl: row.pnl ? Number(row.pnl) : undefined,
    fees: row.fees ? Number(row.fees) : undefined,
    signal: row.signalType ? {
      type: row.signalType,
      confidence: Number(row.signalConfidence),
      reasoning: row.signalReasoning
    } : undefined
  }));
} 