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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Chip,
  Fab,
  Autocomplete,
} from '@mui/material'
import { Add, SmartToy, AccountBalance } from '@mui/icons-material'
import { api, TradingBot, CreateBotRequest } from '../services/api'
import BotCard from '../components/BotCard'

export default function Trading() {
  const [bots, setBots] = useState<TradingBot[]>([])
  const [loading, setLoading] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedBot, setSelectedBot] = useState<TradingBot | null>(null)
  const [botDetailsOpen, setBotDetailsOpen] = useState(false)
  
  const [createForm, setCreateForm] = useState<CreateBotRequest>({
    name: '',
    description: '',
    strategy: 'ml',
    tradingPairs: ['BTCUSDT'],
    positionSize: 0.001,
    maxDrawdown: 10,
    riskLevel: 'medium',
    initialBalance: 100
  })

  const tradingPairsOptions = [
    'BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT', 'DOTUSDT', 
    'LINKUSDT', 'LTCUSDT', 'AVAXUSDT', 'MATICUSDT', 'UNIUSDT'
  ]

  const fetchBots = async () => {
    try {
      setLoading(true)
      const botsData = await api.getBots()
      setBots(botsData)
    } catch (error) {
      console.error('Ошибка загрузки ботов:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBot = async () => {
    try {
      setLoading(true)
      const result = await api.createBot(createForm)
      console.log('Бот создан:', result)
      
      await fetchBots()
      setCreateDialogOpen(false)
      
      // Сброс формы
      setCreateForm({
        name: '',
        description: '',
        strategy: 'ml',
        tradingPairs: ['BTCUSDT'],
        positionSize: 0.001,
        maxDrawdown: 10,
        riskLevel: 'medium',
        initialBalance: 100
      })
    } catch (error) {
      console.error('Ошибка создания бота:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStartBot = async (botId: string) => {
    try {
      await api.startBot(botId)
      await fetchBots()
    } catch (error) {
      console.error('Ошибка запуска бота:', error)
    }
  }

  const handlePauseBot = async (botId: string) => {
    try {
      await api.pauseBot(botId)
      await fetchBots()
    } catch (error) {
      console.error('Ошибка приостановки бота:', error)
    }
  }

  const handleStopBot = async (botId: string) => {
    try {
      await api.stopBot(botId)
      await fetchBots()
    } catch (error) {
      console.error('Ошибка остановки бота:', error)
    }
  }

  const handleDeleteBot = async (botId: string) => {
    try {
      await api.deleteBot(botId)
      await fetchBots()
    } catch (error) {
      console.error('Ошибка удаления бота:', error)
    }
  }

  const handleViewBotDetails = (bot: TradingBot) => {
    setSelectedBot(bot)
    setBotDetailsOpen(true)
  }

  useEffect(() => {
    fetchBots()
  }, [])

  const activeBots = bots.filter(bot => bot.status === 'active').length
  const totalBalance = bots.reduce((sum, bot) => sum + bot.currentBalance, 0)
  const totalPnL = bots.reduce((sum, bot) => sum + bot.totalPnL, 0)

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" gutterBottom>
          🤖 Торговые Боты
        </Typography>
        
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setCreateDialogOpen(true)}
          size="large"
        >
          Создать Бота
        </Button>
      </Box>

      {/* Statistics */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <SmartToy color="primary" />
                <Box>
                  <Typography variant="h4">{bots.length}</Typography>
                  <Typography color="text.secondary">
                    Всего ботов ({activeBots} активных)
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <AccountBalance color="primary" />
                <Box>
                  <Typography variant="h4">${totalBalance.toFixed(2)}</Typography>
                  <Typography color="text.secondary">Общий баланс</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: totalPnL >= 0 ? 'success.main' : 'error.main',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                  }}
                >
                  {totalPnL >= 0 ? '+' : '-'}
                </Box>
                <Box>
                  <Typography variant="h4" color={totalPnL >= 0 ? 'success.main' : 'error.main'}>
                    ${Math.abs(totalPnL).toFixed(2)}
                  </Typography>
                  <Typography color="text.secondary">Общий P&L</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Bots Grid */}
      {loading ? (
        <Box display="flex" justifyContent="center" mt={4}>
          <CircularProgress />
        </Box>
      ) : bots.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <SmartToy sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Торговых ботов пока нет
            </Typography>
            <Typography color="text.secondary" mb={3}>
              Создайте своего первого торгового бота для автоматической торговли
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Создать Первого Бота
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {bots.map((bot) => (
            <Grid item xs={12} sm={6} lg={4} key={bot.id}>
              <BotCard
                bot={bot}
                onStart={handleStartBot}
                onPause={handlePauseBot}
                onStop={handleStopBot}
                onDelete={handleDeleteBot}
                onViewDetails={handleViewBotDetails}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Bot Dialog */}
      <Dialog 
        open={createDialogOpen} 
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Создать Торгового Бота</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Название бота"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Описание (необязательно)"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Стратегия</InputLabel>
                <Select
                  value={createForm.strategy}
                  onChange={(e) => setCreateForm({ ...createForm, strategy: e.target.value as 'ml' | 'openai' })}
                >
                  <MenuItem value="ml">ML Модель</MenuItem>
                  <MenuItem value="openai">OpenAI</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Уровень риска</InputLabel>
                <Select
                  value={createForm.riskLevel}
                  onChange={(e) => setCreateForm({ ...createForm, riskLevel: e.target.value as 'low' | 'medium' | 'high' })}
                >
                  <MenuItem value="low">Низкий</MenuItem>
                  <MenuItem value="medium">Средний</MenuItem>
                  <MenuItem value="high">Высокий</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <Autocomplete
                multiple
                options={tradingPairsOptions}
                value={createForm.tradingPairs}
                onChange={(_, newValue) => setCreateForm({ ...createForm, tradingPairs: newValue })}
                renderInput={(params) => (
                  <TextField {...params} label="Торговые пары" />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip label={option} {...getTagProps({ index })} key={option} size="small" />
                  ))
                }
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Размер позиции"
                type="number"
                value={createForm.positionSize}
                onChange={(e) => setCreateForm({ ...createForm, positionSize: Number(e.target.value) })}
                fullWidth
                inputProps={{ step: 0.001, min: 0.001 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label="Макс. просадка (%)"
                type="number"
                value={createForm.maxDrawdown}
                onChange={(e) => setCreateForm({ ...createForm, maxDrawdown: Number(e.target.value) })}
                fullWidth
                inputProps={{ step: 1, min: 1, max: 50 }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Начальный баланс ($)"
                type="number"
                value={createForm.initialBalance}
                onChange={(e) => setCreateForm({ ...createForm, initialBalance: Number(e.target.value) })}
                fullWidth
                inputProps={{ step: 10, min: 10 }}
                required
              />
            </Grid>
          </Grid>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            Для каждого бота будет создан отдельный суб-аккаунт в Bybit с изолированным балансом
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Отмена</Button>
          <Button 
            onClick={handleCreateBot} 
            variant="contained"
            disabled={!createForm.name || !createForm.initialBalance || loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Создать Бота'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bot Details Dialog */}
      <Dialog
        open={botDetailsOpen}
        onClose={() => setBotDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        {selectedBot && (
          <>
            <DialogTitle>
              <SmartToy sx={{ mr: 1, verticalAlign: 'middle' }} />
              {selectedBot.name}
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>Детальная информация</Typography>
                  {/* Здесь можно добавить больше деталей, графики производительности и т.д. */}
                  <Typography>Статус: {selectedBot.status}</Typography>
                  <Typography>Стратегия: {selectedBot.strategy}</Typography>
                  <Typography>Баланс: ${selectedBot.currentBalance.toFixed(2)}</Typography>
                  <Typography>Торговые пары: {selectedBot.tradingPairs.join(', ')}</Typography>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setBotDetailsOpen(false)}>Закрыть</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  )
} 