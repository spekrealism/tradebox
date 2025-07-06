import { useState, useEffect } from 'react'
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material'
import {
  TrendingUp,
  TrendingDown,
  Psychology,
  AccountBalance,
  ShowChart,
} from '@mui/icons-material'
import { api, HealthStatus, TickerData, MLPrediction } from '../services/api'
import PriceChart from '../components/PriceChart'
import MLSignalCard from '../components/MLSignalCard'

interface DashboardStats {
  health: HealthStatus | null
  ticker: TickerData | null
  mlPrediction: MLPrediction | null
  mlHealth: any
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    health: null,
    ticker: null,
    mlPrediction: null,
    mlHealth: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboardData = async (initial = false) => {
    try {
      if (initial) setLoading(true)
      setError(null)

      const [health, ticker, mlHealth] = await Promise.all([
        api.getHealth(),
        api.getTicker('BTCUSDT'),
        api.getMLHealth().catch(() => null), // ML может быть недоступна
      ])

      let mlPrediction = null
      if (mlHealth?.healthy) {
        try {
          mlPrediction = await api.getMLPrediction('BTCUSDT')
        } catch (err) {
          console.warn('ML prediction unavailable:', err)
        }
      }

      setStats({
        health,
        ticker,
        mlPrediction,
        mlHealth,
      })
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных')
      console.error('Dashboard error:', err)
    } finally {
      if (initial) setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData(true)

    // Обновляем данные каждые 30 секунд без переключения в режим loading
    const interval = setInterval(() => fetchDashboardData(false), 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress size={60} />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    )
  }

  const { health, ticker, mlPrediction, mlHealth } = stats

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        🚀 Дашборд Торгового Бота
      </Typography>

      {/* Status Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* System Status */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <AccountBalance color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Система</Typography>
              </Box>
              <Chip
                label={health?.status === 'ok' ? 'Работает' : 'Ошибка'}
                color={health?.status === 'ok' ? 'success' : 'error'}
                size="small"
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {health?.testnet ? 'Testnet' : 'Mainnet'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* BTC Price */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <ShowChart color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">BTC/USDT</Typography>
              </Box>
              <Typography variant="h5" fontWeight="bold">
                ${ticker?.last.toLocaleString()}
              </Typography>
              <Box display="flex" alignItems="center" mt={1}>
                {ticker && ticker.change >= 0 ? (
                  <TrendingUp color="success" fontSize="small" />
                ) : (
                  <TrendingDown color="error" fontSize="small" />
                )}
                <Typography
                  variant="body2"
                  color={ticker && ticker.change >= 0 ? 'success.main' : 'error.main'}
                  sx={{ ml: 0.5 }}
                >
                  {ticker?.percentage.toFixed(2)}%
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ML Status */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Psychology color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">ML Модель</Typography>
              </Box>
              <Chip
                label={mlHealth?.healthy ? 'Активна' : 'Недоступна'}
                color={mlHealth?.healthy ? 'success' : 'warning'}
                size="small"
              />
              {mlHealth?.stats?.accuracy && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Точность: {(mlHealth.stats.accuracy * 100).toFixed(1)}%
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* WebSocket Status */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                WebSocket
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <Chip
                  label="Public"
                  color={health?.websocket.public ? 'success' : 'error'}
                  size="small"
                />
                <Chip
                  label="Private"
                  color={health?.websocket.private ? 'success' : 'error'}
                  size="small"
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Rate Limit: {health?.rateLimiter.requests}/{health?.rateLimiter.maxRequests}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(health?.rateLimiter.requests || 0) / (health?.rateLimiter.maxRequests || 1) * 100}
                sx={{ mt: 1, height: 4, borderRadius: 2 }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts and ML Analysis */}
      <Grid container spacing={3}>
        {/* Price Chart */}
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                График BTC/USDT
              </Typography>
              <PriceChart symbol="BTCUSDT" />
            </CardContent>
          </Card>
        </Grid>

        {/* ML Signal */}
        <Grid item xs={12} lg={4}>
          <MLSignalCard prediction={mlPrediction} onRefresh={fetchDashboardData} />
        </Grid>
      </Grid>
    </Box>
  )
} 