import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from '@mui/material'
import { TrendingUp, TrendingDown, AutoAwesome, AccountBalance } from '@mui/icons-material'
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
    } catch (error) {
      console.error('Trading data fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMLTrade = async () => {
    if (!mlSignal || mlSignal.signal === 'HOLD') return
    
    try {
      setLoading(true)
      const result = await api.autoTrade('BTCUSDT', parseFloat(orderForm.amount), true)
      console.log('ML Trade result:', result)
      await fetchTradingData()
    } catch (error) {
      console.error('ML Trade error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleManualOrder = async () => {
    try {
      setLoading(true)
      const result = await api.createOrder({
        symbol: orderForm.symbol,
        side: orderForm.side as 'buy' | 'sell',
        amount: parseFloat(orderForm.amount),
        price: orderForm.price ? parseFloat(orderForm.price) : undefined,
        type: orderForm.type as 'limit' | 'market',
      })
      console.log('Manual order result:', result)
      await fetchTradingData()
    } catch (error) {
      console.error('Manual order error:', error)
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
        <Grid item xs={12} lg={6}>
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
                  
                  <Button
                    variant="contained"
                    startIcon={<AutoAwesome />}
                    onClick={handleMLTrade}
                    disabled={loading || !mlSignal || mlSignal.signal === 'HOLD'}
                    fullWidth
                    sx={{ mt: 2 }}
                  >
                    Выполнить ML Сделку
                  </Button>
                </Box>
              ) : (
                <Alert severity="warning">
                  ML модель недоступна
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Manual Trading Section */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                🎯 Ручная Торговля
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Символ</InputLabel>
                    <Select
                      value={orderForm.symbol}
                      onChange={(e) => setOrderForm({ ...orderForm, symbol: e.target.value })}
                    >
                      <MenuItem value="BTCUSDT">BTC/USDT</MenuItem>
                      <MenuItem value="ETHUSDT">ETH/USDT</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Направление</InputLabel>
                    <Select
                      value={orderForm.side}
                      onChange={(e) => setOrderForm({ ...orderForm, side: e.target.value })}
                    >
                      <MenuItem value="buy">Покупка</MenuItem>
                      <MenuItem value="sell">Продажа</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Тип</InputLabel>
                    <Select
                      value={orderForm.type}
                      onChange={(e) => setOrderForm({ ...orderForm, type: e.target.value })}
                    >
                      <MenuItem value="market">Рыночный</MenuItem>
                      <MenuItem value="limit">Лимитный</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    label="Количество"
                    type="number"
                    value={orderForm.amount}
                    onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })}
                    fullWidth
                    size="small"
                  />
                </Grid>
                
                <Grid item xs={6}>
                  <TextField
                    label="Цена (для лимитных)"
                    type="number"
                    value={orderForm.price}
                    onChange={(e) => setOrderForm({ ...orderForm, price: e.target.value })}
                    disabled={orderForm.type === 'market'}
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>
              
              <Button
                variant="contained"
                onClick={handleManualOrder}
                disabled={loading}
                fullWidth
                sx={{ mt: 2 }}
              >
                Создать Ордер
              </Button>
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