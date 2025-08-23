import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Alert,
  Divider,
  Chip,
} from '@mui/material'
import { Settings as SettingsIcon, Security, Speed, Psychology } from '@mui/icons-material'
import { api } from '../services/api'

export default function Settings() {
  const [systemStatus, setSystemStatus] = useState<any>(null)
  const [mlSettings, setMLSettings] = useState({
    enabled: true,
    autoTrain: false,
    trainDataLimit: 1000,
    confidenceThreshold: 0.7,
  })

  const fetchSystemStatus = async () => {
    try {
      const health = await api.getHealth()
      setSystemStatus(health)
    } catch (error) {
      console.error('Failed to fetch system status:', error)
    }
  }

  useEffect(() => {
    fetchSystemStatus()
  }, [])

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        ⚙️ Настройки Системы
      </Typography>

      <Grid container spacing={3}>
        {/* System Status */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <SettingsIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Статус Системы</Typography>
              </Box>
              
              {systemStatus ? (
                <Box>
                  <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                    <Chip
                      label={`Статус: ${systemStatus.status}`}
                      color={systemStatus.status === 'ok' ? 'success' : 'error'}
                    />
                    <Chip
                      label={systemStatus.testnet ? 'Testnet' : 'Mainnet'}
                      color={systemStatus.testnet ? 'warning' : 'success'}
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    WebSocket Соединения:
                  </Typography>
                  <Box display="flex" gap={1} mb={2}>
                    <Chip
                      label="Public"
                      size="small"
                      color={systemStatus.websocket?.public ? 'success' : 'error'}
                    />
                    <Chip
                      label="Private" 
                      size="small"
                      color={systemStatus.websocket?.private ? 'success' : 'error'}
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary">
                    Rate Limiter: {systemStatus.rateLimiter?.requests || 0} / {systemStatus.rateLimiter?.maxRequests || 0}
                  </Typography>
                </Box>
              ) : (
                <Alert severity="error">Не удалось загрузить статус системы</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* API Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Security color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">API Конфигурация</Typography>
              </Box>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                API ключи настраиваются через переменные окружения (.env файл)
              </Alert>
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Переменные окружения:
              </Typography>
              <Box component="code" sx={{ 
                display: 'block', 
                backgroundColor: 'background.paper', 
                p: 2, 
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                fontSize: '0.8rem'
              }}>
                BYBIT_API_KEY=your_api_key<br/>
                BYBIT_API_SECRET=your_api_secret<br/>
                BYBIT_TESTNET=true<br/>
                ENCRYPTION_KEY=please_set_strong_key<br/>
                ML_ENABLED=true<br/>
                ML_SERVICE_URL=http://localhost:5000
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ML Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Psychology color="secondary" sx={{ mr: 1 }} />
                <Typography variant="h6">ML Настройки</Typography>
              </Box>
              
              <Box>
                <FormControlLabel
                  control={
                    <Switch 
                      checked={mlSettings.enabled}
                      onChange={(e) => setMLSettings({...mlSettings, enabled: e.target.checked})}
                    />
                  }
                  label="Включить ML модель"
                />
                
                <FormControlLabel
                  control={
                    <Switch 
                      checked={mlSettings.autoTrain}
                      onChange={(e) => setMLSettings({...mlSettings, autoTrain: e.target.checked})}
                    />
                  }
                  label="Автоматическое переобучение"
                />
                
                <TextField
                  label="Лимит данных для обучения"
                  type="number"
                  value={mlSettings.trainDataLimit}
                  onChange={(e) => setMLSettings({...mlSettings, trainDataLimit: parseInt(e.target.value)})}
                  fullWidth
                  margin="normal"
                  size="small"
                />
                
                <TextField
                  label="Минимальная уверенность для торговли"
                  type="number"
                  inputProps={{ min: 0, max: 1, step: 0.1 }}
                  value={mlSettings.confidenceThreshold}
                  onChange={(e) => setMLSettings({...mlSettings, confidenceThreshold: parseFloat(e.target.value)})}
                  fullWidth
                  margin="normal"
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                <Speed color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Производительность</Typography>
              </Box>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                Настройки производительности влияют на скорость работы системы
              </Alert>
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Рекомендуемые настройки:
              </Typography>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.875rem' }}>
                <li>Обновление данных: каждые 30-60 секунд</li>
                <li>Размер данных для обучения: 500-1000 точек</li>
                <li>Таймфрейм для анализа: 1h</li>
                <li>Минимальная уверенность: 0.7 (70%)</li>
              </ul>
            </CardContent>
          </Card>
        </Grid>

        {/* About & Documentation */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📚 О Системе
              </Typography>
              
              <Typography variant="body2" color="text.secondary" paragraph>
                Crypto Trading Bot - это автоматизированная система торговли криптовалютами с использованием
                машинного обучения. Система включает MLP классификатор и LSTM для предсказания цен.
              </Typography>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Технологии:
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                <Chip label="React + TypeScript" size="small" />
                <Chip label="Material-UI" size="small" />
                <Chip label="Node.js + Express" size="small" />
                <Chip label="Python + Flask" size="small" />
                <Chip label="TensorFlow + scikit-learn" size="small" />
                <Chip label="Bybit API" size="small" />
              </Box>
              
              <Alert severity="warning">
                ⚠️ Внимание: Всегда тестируйте стратегии на тестовой сети перед использованием реальных средств!
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
} 