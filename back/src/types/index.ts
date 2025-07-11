export interface TradingBot {
  id: string;
  name: string;
  description?: string;
  strategy: 'ml' | 'openai' | 'custom';
  status: 'active' | 'paused' | 'stopped' | 'error';
  
  // Bybit суб-аккаунт
  subAccountId: string;
  subAccountUsername: string;
  apiKey: string;
  apiSecret: string;
  
  // Настройки торговли
  tradingPairs: string[];
  positionSize: number; // размер позиции в базовой валюте
  maxDrawdown: number; // максимальная просадка в %
  riskLevel: 'low' | 'medium' | 'high';
  
  // Статистика
  totalTrades: number;
  winningTrades: number;
  totalPnL: number;
  currentBalance: number;
  initialBalance: number;
  
  // Временные метки
  createdAt: string;
  updatedAt: string;
  lastTradeAt?: string;
}

export interface TradeRecord {
  id: string;
  botId: string;
  symbol: string;
  side: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: string;
  orderId: string;
  pnl?: number;
  fees?: number;
  signal?: {
    type: 'ml' | 'openai';
    confidence: number;
    reasoning: string;
  };
}

export interface BotPerformance {
  botId: string;
  timeframe: '1h' | '1d' | '1w' | '1m';
  totalReturn: number;
  sharpeRatio: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  totalTrades: number;
  profitFactor: number;
}

export interface SubAccountInfo {
  uid: string;
  username: string;
  memberType: number;
  status: string;
  remark?: string;
  accountType: string;
  balance: {
    [currency: string]: {
      free: number;
      used: number;
      total: number;
    };
  };
} 