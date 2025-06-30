import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    console.error('❌ API Request Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`)
    return response
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.status, error.response?.data)
    return Promise.reject(error)
  }
)

export interface HealthStatus {
  status: string
  timestamp: string
  websocket: {
    public: boolean
    private: boolean
  }
  rateLimiter: {
    requests: number
    maxRequests: number
  }
  testnet: boolean
}

export interface MLPrediction {
  signal: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  stopLoss?: number
  reasoning: string
  timestamp: number
  lstm_prediction?: number
  current_price?: number
}

export interface TechnicalIndicators {
  rsi: number
  bollinger: {
    upper: number
    middle: number
    lower: number
  }
  ema: {
    ema1: number
    ema20: number
    ema50: number
    ema100: number
  }
  ultimateOscillator: number
  zScore: number
}

export interface OHLCVData {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TickerData {
  symbol: string
  last: number
  bid: number
  ask: number
  high: number
  low: number
  volume: number
  change: number
  percentage: number
}

// API Methods
export const api = {
  // Health check
  getHealth: async (): Promise<HealthStatus> => {
    const response = await apiClient.get('/health')
    return response.data
  },

  // Market data
  getOHLCV: async (symbol: string, timeframe: string = '1h', limit: number = 100): Promise<OHLCVData[]> => {
    const response = await apiClient.get(`/api/ohlcv/${symbol}?timeframe=${timeframe}&limit=${limit}`)
    return response.data.data.map(([timestamp, open, high, low, close, volume]: number[]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    }))
  },

  getTicker: async (symbol: string): Promise<TickerData> => {
    const response = await apiClient.get(`/api/ticker/${symbol}`)
    return response.data.data
  },

  // ML endpoints
  getMLPrediction: async (symbol: string = 'BTCUSDT', limit: number = 100): Promise<MLPrediction> => {
    const response = await apiClient.post('/api/ml/predict', { symbol, limit })
    return response.data.data
  },

  trainMLModel: async (symbol: string = 'BTCUSDT', limit: number = 1000): Promise<any> => {
    const response = await apiClient.post('/api/ml/train', { symbol, limit })
    return response.data
  },

  getTechnicalIndicators: async (symbol: string = 'BTCUSDT', limit: number = 100): Promise<TechnicalIndicators> => {
    const response = await apiClient.post('/api/ml/indicators', { symbol, limit })
    return response.data.data
  },

  getMLHealth: async (): Promise<any> => {
    const response = await apiClient.get('/api/ml/health')
    return response.data.data
  },

  autoTrade: async (symbol: string, amount: number, enableStopLoss: boolean = true): Promise<any> => {
    const response = await apiClient.post('/api/ml/auto-trade', {
      symbol,
      amount,
      enableStopLoss,
    })
    return response.data
  },

  // Trading endpoints
  getBalance: async (): Promise<any> => {
    const response = await apiClient.get('/api/balance')
    return response.data.data
  },

  getPositions: async (): Promise<any> => {
    const response = await apiClient.get('/api/positions')
    return response.data.data
  },

  getOrders: async (symbol?: string): Promise<any> => {
    const url = symbol ? `/api/orders?symbol=${symbol}` : '/api/orders'
    const response = await apiClient.get(url)
    return response.data.data
  },

  createOrder: async (orderData: {
    symbol: string
    side: 'buy' | 'sell'
    amount: number
    price?: number
    type?: 'limit' | 'market'
  }): Promise<any> => {
    const response = await apiClient.post('/api/order', orderData)
    return response.data.data
  },
}

export default api 