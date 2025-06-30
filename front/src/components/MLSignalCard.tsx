import { useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material'
import {
  TrendingUp,
  TrendingDown,
  TrendingFlat,
  Psychology,
  Refresh,
} from '@mui/icons-material'
import { MLPrediction } from '../services/api'

interface MLSignalCardProps {
  prediction: MLPrediction | null
  onRefresh: () => void
}

export default function MLSignalCard({ prediction, onRefresh }: MLSignalCardProps) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return <TrendingUp />
      case 'SELL':
        return <TrendingDown />
      default:
        return <TrendingFlat />
    }
  }

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return 'success'
      case 'SELL':
        return 'error'
      default:
        return 'warning'
    }
  }

  const getSignalText = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return 'ПОКУПАТЬ'
      case 'SELL':
        return 'ПРОДАВАТЬ'
      default:
        return 'ЖДАТЬ'
    }
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center">
            <Psychology color="secondary" sx={{ mr: 1 }} />
            <Typography variant="h6">ML Сигнал</Typography>
          </Box>
          <Button
            size="small"
            onClick={handleRefresh}
            disabled={refreshing}
            startIcon={refreshing ? <CircularProgress size={16} /> : <Refresh />}
          >
            Обновить
          </Button>
        </Box>

        {!prediction ? (
          <Alert severity="info">
            ML модель недоступна или не обучена
          </Alert>
        ) : (
          <Box>
            {/* Main Signal */}
            <Box display="flex" alignItems="center" justifyContent="center" mb={3}>
              <Chip
                icon={getSignalIcon(prediction.signal)}
                label={getSignalText(prediction.signal)}
                color={getSignalColor(prediction.signal) as any}
                size="large"
                sx={{
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  py: 3,
                  px: 2,
                }}
              />
            </Box>

            {/* Confidence */}
            <Box textAlign="center" mb={2}>
              <Typography variant="body2" color="text.secondary">
                Уверенность
              </Typography>
              <Typography variant="h4" fontWeight="bold" color="secondary.main">
                {(prediction.confidence * 100).toFixed(1)}%
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Additional Info */}
            <Box space={2}>
              {prediction.current_price && (
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Текущая цена:
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    ${prediction.current_price.toLocaleString()}
                  </Typography>
                </Box>
              )}

              {prediction.lstm_prediction && (
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    LSTM прогноз:
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    ${prediction.lstm_prediction.toLocaleString()}
                  </Typography>
                </Box>
              )}

              {prediction.stopLoss && (
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Stop-Loss:
                  </Typography>
                  <Typography variant="body2" fontWeight="bold" color="error.main">
                    ${prediction.stopLoss.toLocaleString()}
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Reasoning */}
            <Typography variant="caption" color="text.secondary">
              {prediction.reasoning}
            </Typography>

            {/* Timestamp */}
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              Обновлено: {new Date(prediction.timestamp * 1000).toLocaleTimeString()}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  )
} 