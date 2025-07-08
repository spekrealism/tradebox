import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from '@mui/material'
import { TrendingUp, TrendingDown, AccountBalance } from '@mui/icons-material'
import { api } from '../services/api'

export default function Trading() {
  const [mlSignal, setMLSignal] = useState<any>(null)
  const [balance, setBalance] = useState<any>(null)
  const [positions, setPositions] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [orderForm, setOrderForm] = useState({
    symbol: 'BTCUSDT',
    side: 'buy',
    amount: '0.001',
    price: '',
    type: 'market',
  })
  const [lastTradeTimestamp, setLastTradeTimestamp] = useState<number | null>(null)

  const fetchTradingData = async () => {
    try {
      setLoading(true)
      const [mlPrediction, balanceData] = await Promise.all([
        api.getMLPrediction('BTCUSDT').catch(() => null),
        api.getBalance().catch(() => null),
      ])
      
      setMLSignal(mlPrediction)
      setBalance(balanceData)
      
      if (balanceData) {
        const [positionsData, ordersData] = await Promise.all([
          api.getPositions().catch(() => []),
          api.getOrders().catch(() => []),
        ])
        setPositions(positionsData)
        setOrders(ordersData)
      }

      // Автоматическое выполнение сделки, если есть новый сигнал
      if (
        mlPrediction &&
        mlPrediction.signal !== 'HOLD' &&
        mlPrediction.timestamp !== lastTradeTimestamp
      ) {
        try {
          await api.autoTrade('BTCUSDT', parseFloat(orderForm.amount), true)
          setLastTradeTimestamp(mlPrediction.timestamp)
        } catch (err) {
          console.error('Auto trade error:', err)
        }
      }
    } catch (error) {
      console.error('Trading data fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTradingData()
  }, [])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        💼 Торговая Панель
      </Typography>

      <Grid container spacing={3}>
        {/* ML Trading Section */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🤖 ML Автоторговля
              </Typography>
              
              {mlSignal ? (
                <Box>
                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <Chip
                      icon={mlSignal.signal === 'BUY' ? <TrendingUp /> : <TrendingDown />}
                      label={mlSignal.signal}
                      color={mlSignal.signal === 'BUY' ? 'success' : mlSignal.signal === 'SELL' ? 'error' : 'warning'}
                    />
                    <Typography variant="body2">
                      Уверенность: {(mlSignal.confidence * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                  
                  <TextField
                    label="Размер позиции"
                    type="number"
                    value={orderForm.amount}
                    onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })}
                    fullWidth
                    margin="normal"
                    size="small"
                  />

                  <Alert severity="info" sx={{ mt: 2 }}>
                    Сделка будет выполнена автоматически при появлении сигнала
                  </Alert>
                </Box>
              ) : (
                <Alert severity="warning">
                  ML модель недоступна
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Balance & Positions */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                💰 Баланс и Позиции
              </Typography>
              
              {balance ? (
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Доступный баланс
                  </Typography>
                  <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
                    {Object.entries(balance).map(([currency, data]: [string, any]) => (
                      <Chip
                        key={currency}
                        icon={<AccountBalance />}
                        label={`${currency}: ${data.free || 0}`}
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </Box>
              ) : (
                <Alert severity="info">
                  Для просмотра баланса необходимы API ключи
                </Alert>
              )}
              
              {positions.length > 0 && (
                <Box mt={2}>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Открытые позиции
                  </Typography>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    {positions.map((position: any, index: number) => (
                      <Chip
                        key={index}
                        label={`${position.symbol}: ${position.size}`}
                        color={position.side === 'long' ? 'success' : 'error'}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {loading && (
        <Box display="flex" justifyContent="center" mt={2}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  )
} 