import { useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
} from '@mui/material'
import {
  PlayArrow,
  Pause,
  Stop,
  Delete,
  MoreVert,
  SmartToy,
  AccountBalance,
  TrendingUp,
  TrendingDown,
} from '@mui/icons-material'
import { TradingBot } from '../services/api'

interface BotCardProps {
  bot: TradingBot
  onStart: (botId: string) => Promise<void>
  onPause: (botId: string) => Promise<void>
  onStop: (botId: string) => Promise<void>
  onDelete: (botId: string) => Promise<void>
  onViewDetails: (bot: TradingBot) => void
}

export default function BotCard({ bot, onStart, onPause, onStop, onDelete, onViewDetails }: BotCardProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleAction = async (action: () => Promise<void>) => {
    try {
      setLoading(true)
      await action()
      handleMenuClose()
    } catch (error) {
      console.error('Bot action error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    await handleAction(() => onDelete(bot.id))
    setDeleteDialogOpen(false)
  }

  const getStatusColor = (status: TradingBot['status']) => {
    switch (status) {
      case 'active': return 'success'
      case 'paused': return 'warning'
      case 'stopped': return 'default'
      case 'error': return 'error'
      default: return 'default'
    }
  }

  const getStatusIcon = (status: TradingBot['status']) => {
    switch (status) {
      case 'active': return <PlayArrow />
      case 'paused': return <Pause />
      case 'stopped': return <Stop />
      case 'error': return <Stop />
      default: return <Stop />
    }
  }

  const winRate = bot.totalTrades > 0 ? (bot.winningTrades / bot.totalTrades) * 100 : 0
  const returnPercent = bot.initialBalance > 0 ? ((bot.currentBalance - bot.initialBalance) / bot.initialBalance) * 100 : 0

  return (
    <>
      <Card 
        sx={{ 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          cursor: 'pointer',
          '&:hover': { boxShadow: 3 }
        }}
        onClick={() => onViewDetails(bot)}
      >
        {loading && <LinearProgress />}
        
        <CardContent sx={{ flexGrow: 1 }}>
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
            <Box flex={1}>
              <Typography variant="h6" component="div" gutterBottom>
                <SmartToy sx={{ mr: 1, verticalAlign: 'middle' }} />
                {bot.name}
              </Typography>
              {bot.description && (
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {bot.description}
                </Typography>
              )}
            </Box>
            
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                icon={getStatusIcon(bot.status)}
                label={bot.status.toUpperCase()}
                color={getStatusColor(bot.status)}
                size="small"
              />
              
              <IconButton 
                size="small" 
                onClick={(e) => {
                  e.stopPropagation()
                  handleMenuClick(e)
                }}
              >
                <MoreVert />
              </IconButton>
            </Box>
          </Box>

          {/* Strategy & Trading Pairs */}
          <Box mb={2}>
            <Chip 
              label={bot.strategy.toUpperCase()} 
              variant="outlined" 
              size="small" 
              sx={{ mr: 1, mb: 1 }}
            />
            <Chip 
              label={`${bot.tradingPairs.length} пар`} 
              variant="outlined" 
              size="small"
              sx={{ mr: 1, mb: 1 }}
            />
            <Chip 
              label={bot.riskLevel} 
              variant="outlined" 
              size="small"
              sx={{ mb: 1 }}
            />
          </Box>

          {/* Trading Pairs */}
          <Box mb={2}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Торговые пары:
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={0.5}>
              {bot.tradingPairs.slice(0, 3).map((pair) => (
                <Chip key={pair} label={pair} size="small" variant="outlined" />
              ))}
              {bot.tradingPairs.length > 3 && (
                <Chip label={`+${bot.tradingPairs.length - 3}`} size="small" variant="outlined" />
              )}
            </Box>
          </Box>

          {/* Performance Stats */}
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography variant="body2" color="text.secondary">
                <AccountBalance sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                Баланс:
              </Typography>
              <Typography variant="body2" fontWeight="medium">
                ${bot.currentBalance.toFixed(2)}
              </Typography>
            </Box>
            
            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography variant="body2" color="text.secondary">
                Доходность:
              </Typography>
              <Typography 
                variant="body2" 
                fontWeight="medium"
                color={returnPercent >= 0 ? 'success.main' : 'error.main'}
              >
                {returnPercent >= 0 ? <TrendingUp sx={{ fontSize: 16, mr: 0.5 }} /> : <TrendingDown sx={{ fontSize: 16, mr: 0.5 }} />}
                {returnPercent >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%
              </Typography>
            </Box>

            <Box display="flex" justifyContent="space-between" mb={1}>
              <Typography variant="body2" color="text.secondary">
                Сделок:
              </Typography>
              <Typography variant="body2" fontWeight="medium">
                {bot.totalTrades}
              </Typography>
            </Box>

            {bot.totalTrades > 0 && (
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Win Rate:
                </Typography>
                <Typography variant="body2" fontWeight="medium" color="success.main">
                  {winRate.toFixed(1)}%
                </Typography>
              </Box>
            )}
          </Box>

          {/* Action Buttons */}
          <Box display="flex" gap={1} onClick={(e) => e.stopPropagation()}>
            {bot.status === 'paused' || bot.status === 'stopped' ? (
              <Button
                variant="contained"
                color="success"
                size="small"
                startIcon={<PlayArrow />}
                onClick={() => handleAction(() => onStart(bot.id))}
                disabled={loading}
                fullWidth
              >
                Запустить
              </Button>
            ) : bot.status === 'active' ? (
              <Button
                variant="outlined"
                color="warning"
                size="small"
                startIcon={<Pause />}
                onClick={() => handleAction(() => onPause(bot.id))}
                disabled={loading}
                fullWidth
              >
                Пауза
              </Button>
            ) : null}
          </Box>

          {/* Last Trade */}
          {bot.lastTradeAt && (
            <Typography variant="caption" color="text.secondary" mt={1} display="block">
              Последняя сделка: {new Date(bot.lastTradeAt).toLocaleString()}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {bot.status === 'active' && (
          <MenuItem onClick={() => handleAction(() => onStop(bot.id))}>
            <Stop sx={{ mr: 1 }} /> Остановить
          </MenuItem>
        )}
        <MenuItem onClick={() => setDeleteDialogOpen(true)}>
          <Delete sx={{ mr: 1 }} color="error" /> Удалить
        </MenuItem>
      </Menu>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Удалить торгового бота?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Это действие нельзя отменить. Все данные бота и история сделок будут удалены.
          </Alert>
          <Typography>
            Вы действительно хотите удалить бота <strong>{bot.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Отмена</Button>
          <Button onClick={handleDelete} color="error" disabled={loading}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
} 