import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Divider,
  TextField,
} from '@mui/material'
import { Psychology, TrendingUp, Speed, School } from '@mui/icons-material'
import { api } from '../services/api'

export default function MLAnalysis() {
  const [mlHealth, setMLHealth] = useState<any>(null)
  const [prediction, setPrediction] = useState<any>(null)
  const [indicators, setIndicators] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [trainLoading, setTrainLoading] = useState(false)
  const [trainParams, setTrainParams] = useState({
    symbol: 'BTCUSDT',
    limit: 1000,
  })

  const fetchMLData = async () => {
    try {
      setLoading(true)
      const [healthData, predictionData, indicatorData] = await Promise.all([
        api.getMLHealth().catch(() => null),
        api.getMLPrediction('BTCUSDT').catch(() => null),
        api.getTechnicalIndicators('BTCUSDT').catch(() => null),
      ])
      
      setMLHealth(healthData)
      setPrediction(predictionData)
      setIndicators(indicatorData)
    } catch (error) {
      console.error('ML data fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTrain = async () => {
    try {
      setTrainLoading(true)
      const result = await api.trainMLModel(trainParams.symbol, trainParams.limit)
      console.log('Training result:', result)
      await fetchMLData()
    } catch (error) {
      console.error('Training error:', error)
    } finally {
      setTrainLoading(false)
    }
  }

  useEffect(() => {
    fetchMLData()
  }, [])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        🧠 ML Анализ и Мониторинг
      </Typography>

      <Grid container spacing={3}>
        {/* ML Model Status */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Psychology color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">Статус ML Модели</Typography>
              </Box>
              
              {mlHealth ? (
                <Box>
                  <Box display="flex" gap={1} mb={2}>
                    <Chip
                      label={mlHealth.healthy ? 'Активна' : 'Недоступна'}
                      color={mlHealth.healthy ? 'success' : 'error'}
                    />
                    <Chip
                      label={mlHealth.enabled ? 'Включена' : 'Отключена'}
                      color={mlHealth.enabled ? 'success' : 'warning'}
                    />
                  </Box>
                  
                  {mlHealth.stats && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Статистика модели
                      </Typography>
                      <Box mb={1}>
                        <Typography variant="caption">
                          Точность: {(mlHealth.stats.accuracy * 100).toFixed(1)}%
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={mlHealth.stats.accuracy * 100}
                          sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Последнее обновление: {mlHealth.stats.last_update ? 
                          new Date(mlHealth.stats.last_update).toLocaleString() : 'Неизвестно'}
                      </Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Alert severity="error">ML сервис недоступен</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Training Section */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <School color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Обучение Модели</Typography>
              </Box>
              
              <Box>
                <TextField
                  label="Символ"
                  value={trainParams.symbol}
                  onChange={(e) => setTrainParams({ ...trainParams, symbol: e.target.value })}
                  size="small"
                  sx={{ mb: 2, mr: 1 }}
                />
                <TextField
                  label="Количество данных"
                  type="number"
                  value={trainParams.limit}
                  onChange={(e) => setTrainParams({ ...trainParams, limit: parseInt(e.target.value) })}
                  size="small"
                  sx={{ mb: 2 }}
                />
                
                <Button
                  variant="contained"
                  onClick={handleTrain}
                  disabled={trainLoading || !mlHealth?.healthy}
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  {trainLoading ? <CircularProgress size={24} /> : 'Переобучить Модель'}
                </Button>
                
                <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                  Обучение может занять 5-10 минут для 1000 точек данных
                </Alert>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Current Prediction */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <TrendingUp color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">Текущий Прогноз</Typography>
              </Box>
              
              {prediction ? (
                <Box>
                  <Box display="flex" alignItems="center" gap={2} mb={2}>
                    <Chip
                      label={prediction.signal}
                      color={
                        prediction.signal === 'BUY' ? 'success' :
                        prediction.signal === 'SELL' ? 'error' : 'warning'
                      }
                      sx={{ fontSize: '1rem', fontWeight: 'bold' }}
                    />
                    <Typography variant="h6">
                      {(prediction.confidence * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {prediction.reasoning}
                  </Typography>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="caption">Текущая цена:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      ${prediction.current_price?.toLocaleString()}
                    </Typography>
                  </Box>
                  
                  {prediction.lstm_prediction && (
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption">LSTM прогноз:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        ${prediction.lstm_prediction.toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                  
                  {prediction.stopLoss && (
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption">Stop-Loss:</Typography>
                      <Typography variant="body2" fontWeight="bold" color="error.main">
                        ${prediction.stopLoss.toLocaleString()}
                      </Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Alert severity="info">Прогноз недоступен (нужны API ключи для данных)</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Technical Indicators */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Speed color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Технические Индикаторы</Typography>
              </Box>
              
              {indicators ? (
                <Box>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">RSI</Typography>
                      <Typography variant="h6">{indicators.rsi?.toFixed(2)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Z-Score</Typography>
                      <Typography variant="h6">{indicators.zScore?.toFixed(2)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">Ultimate Osc</Typography>
                      <Typography variant="h6">{indicators.ultimateOscillator?.toFixed(2)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">EMA 20</Typography>
                      <Typography variant="h6">${indicators.ema?.ema20?.toLocaleString()}</Typography>
                    </Grid>
                  </Grid>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="caption" color="text.secondary">Bollinger Bands</Typography>
                  <Box display="flex" justifyContent="space-between" mt={1}>
                    <Typography variant="body2">
                      Верх: ${indicators.bollinger?.upper?.toLocaleString()}
                    </Typography>
                    <Typography variant="body2">
                      Сред: ${indicators.bollinger?.middle?.toLocaleString()}
                    </Typography>
                    <Typography variant="body2">
                      Низ: ${indicators.bollinger?.lower?.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Alert severity="info">Индикаторы недоступны (нужны API ключи)</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box display="flex" justifyContent="center" mt={3}>
        <Button
          variant="outlined"
          onClick={fetchMLData}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : undefined}
        >
          Обновить Данные
        </Button>
      </Box>
    </Box>
  )
}