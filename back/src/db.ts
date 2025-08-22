// Rewritten for MongoDB
import { MongoClient, Db, ObjectId } from 'mongodb';
import type { Document } from 'mongodb';
import { config } from './config';
import { TradingBot, TradeRecord } from './types';
import { encryptSecret, decryptSecret } from './crypto';

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

/* -------------------------------------------------------------------------- */
/*                                 Mongo init                                 */
/* -------------------------------------------------------------------------- */

let client: MongoClient;
let db: Db;

export const initDb = async (): Promise<void> => {
  if (db) return; // already initialised

  const uri: string = process.env.MONGODB_URI || 'mongodb://mongo:27017';
  console.log('📡 Подключение к MongoDB по URI:', uri);
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(config.db.database);

  // Создаём индексы (idempotent)
  await Promise.all([
    // OHLCV
    db.collection<OHLCVRecord>('ohlcv').createIndex(
      { symbol: 1, timeframe: 1, timestamp: -1 },
      { name: 'idx_ohlcv_symbol_timeframe_timestamp' }
    ),
    db.collection<OHLCVRecord>('ohlcv').createIndex(
      { symbol: 1, timeframe: 1, timestamp: 1 },
      { unique: true, name: 'idx_ohlcv_unique' }
    ),
    // trading_bots
    db.collection('trading_bots').createIndex({ status: 1 }, { name: 'idx_trading_bots_status' }),
    db.collection('trading_bots').createIndex({ strategy: 1 }, { name: 'idx_trading_bots_strategy' }),
    // trade_records
    db.collection('trade_records').createIndex({ botId: 1 }, { name: 'idx_trade_records_bot_id' }),
    db.collection('trade_records').createIndex({ timestamp: -1 }, { name: 'idx_trade_records_timestamp' }),
    // bot_performance
    db.collection('bot_performance').createIndex({ botId: 1 }, { name: 'idx_bot_performance_bot_id' }),
  ]);

  console.log('📊 Подключение к MongoDB установлено и индексы созданы');

  // One-time/background migration: encrypt existing plaintext apiKey/apiSecret
  try {
    await encryptExistingBotSecrets();
  } catch (e) {
    console.warn('⚠️ Ошибка миграции шифрования секретов:', e);
  }
};

function getCollection<T extends Document = Document>(name: string) {
  if (!db) {
    throw new Error('Database not initialised. Call initDb() first.');
  }
  return db.collection<T>(name);
}

/* -------------------------------------------------------------------------- */
/*                                  OHLCV                                     */
/* -------------------------------------------------------------------------- */

async function encryptExistingBotSecrets(): Promise<void> {
  const col = getCollection<any>('trading_bots');
  // Найти документы, где apiKey или apiSecret не начинаются с v1:
  const cursor = col.find({ $or: [
    { apiKey: { $exists: true, $type: 'string', $not: { $regex: '^v1:' } } },
    { apiSecret: { $exists: true, $type: 'string', $not: { $regex: '^v1:' } } },
  ]});

  const ops: any[] = [];
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const update: any = {};
    if (typeof doc.apiKey === 'string' && !doc.apiKey.startsWith('v1:')) {
      update.apiKey = encryptSecret(doc.apiKey);
    }
    if (typeof doc.apiSecret === 'string' && !doc.apiSecret.startsWith('v1:')) {
      update.apiSecret = encryptSecret(doc.apiSecret);
    }
    if (Object.keys(update).length) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: update } } });
    }
  }
  if (ops.length) {
    await col.bulkWrite(ops, { ordered: false });
    console.log(`🔐 Зашифровано секретов у ${ops.length} ботов`);
  }
}

export async function saveOHLCVBulk(
  symbol: string,
  timeframe: string,
  candles: OHLCVRecord[]
): Promise<void> {
  if (!candles.length) return;

  const col = getCollection<OHLCVRecord>('ohlcv');

  const operations = candles.map((c) => ({
    updateOne: {
      filter: { symbol, timeframe, timestamp: c.timestamp },
      update: { $setOnInsert: c },
      upsert: true,
    },
  }));

  await col.bulkWrite(operations, { ordered: false });
}

export async function fetchOHLCVFromDb(
  symbol: string,
  timeframe: string,
  limit: number = 100
): Promise<number[][]> {
  const rows = await getCollection<OHLCVRecord>('ohlcv')
    .find({ symbol, timeframe })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();

  // Возвращаем в обратном порядке (от старых к новым), аналогично предыдущей реализации
  return rows.reverse().map((r: OHLCVRecord) => [
    r.timestamp,
    r.open,
    r.high,
    r.low,
    r.close,
    r.volume,
  ]);
}

/* -------------------------------------------------------------------------- */
/*                              Trading Bots CRUD                              */
/* -------------------------------------------------------------------------- */

type TradingBotDoc = Omit<TradingBot, 'id'> & { _id: ObjectId };

export async function createTradingBot(
  bot: Omit<TradingBot, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const col = getCollection<TradingBotDoc>('trading_bots');
  const now = new Date().toISOString();
  const toInsert: any = {
    ...bot,
    // Encrypt secrets at rest
    apiKey: bot.apiKey && !bot.apiKey.startsWith('v1:') ? encryptSecret(bot.apiKey) : bot.apiKey,
    apiSecret: bot.apiSecret && !bot.apiSecret.startsWith('v1:') ? encryptSecret(bot.apiSecret) : bot.apiSecret,
    createdAt: now,
    updatedAt: now,
  };
  const result = await col.insertOne(toInsert as any);
  return result.insertedId.toString();
}

export async function getAllTradingBots(): Promise<TradingBot[]> {
  const docs = await getCollection<TradingBotDoc>('trading_bots')
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map(mapBotDoc);
}

export async function getTradingBotById(id: string): Promise<TradingBot | null> {
  const doc = await getCollection<TradingBotDoc>('trading_bots').findOne({ _id: new ObjectId(id) });
  return doc ? mapBotDoc(doc) : null;
}

export async function updateTradingBot(
  id: string,
  updates: Partial<TradingBot>
): Promise<void> {
  const { id: _, ...rest } = updates as any;
  if (Object.keys(rest).length === 0) return;
  if (typeof rest.apiKey === 'string') {
    rest.apiKey = rest.apiKey.startsWith('v1:') ? rest.apiKey : encryptSecret(rest.apiKey);
  }
  if (typeof rest.apiSecret === 'string') {
    rest.apiSecret = rest.apiSecret.startsWith('v1:') ? rest.apiSecret : encryptSecret(rest.apiSecret);
  }
  rest.updatedAt = new Date().toISOString();
  await getCollection('trading_bots').updateOne(
    { _id: new ObjectId(id) },
    { $set: rest }
  );
}

export async function deleteTradingBot(id: string): Promise<void> {
  await getCollection('trading_bots').deleteOne({ _id: new ObjectId(id) });
}

function mapBotDoc(doc: TradingBotDoc): TradingBot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc as any;
  const decrypted: any = { ...rest };
  // Decrypt on read; if value isn't in our envelope, treat as plaintext (backward compatibility)
  if (typeof decrypted.apiKey === 'string') {
    decrypted.apiKey = decryptSecret(decrypted.apiKey);
  }
  if (typeof decrypted.apiSecret === 'string') {
    decrypted.apiSecret = decryptSecret(decrypted.apiSecret);
  }
  return { id: _id.toString(), ...decrypted } as TradingBot;
}

/* -------------------------------------------------------------------------- */
/*                               Trade Records                                 */
/* -------------------------------------------------------------------------- */

type TradeRecordDoc = Omit<TradeRecord, 'id'> & { _id: ObjectId };

export async function createTradeRecord(
  trade: Omit<TradeRecord, 'id'>
): Promise<string> {
  const col = getCollection<TradeRecordDoc>('trade_records');
  const result = await col.insertOne(trade as any);
  return result.insertedId.toString();
}

export async function getTradeHistory(
  botId: string,
  limit: number = 100
): Promise<TradeRecord[]> {
  const docs = await getCollection<TradeRecordDoc>('trade_records')
    .find({ botId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();

  return docs.map((d: TradeRecordDoc) => ({ ...d, id: d._id.toString() } as unknown as TradeRecord));
} 