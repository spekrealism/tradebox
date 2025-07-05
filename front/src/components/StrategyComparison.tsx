/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Grid,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  LinearProgress,
  Avatar,
  Badge,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ShowChartIcon from '@mui/icons-material/ShowChart';

interface StrategyResult {
  strategy: string;
  prediction: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    timeframe?: string;
  };
  executionTime: number;
  success: boolean;
  error?: string;
}

interface CombinedPrediction {
  primaryStrategy: string;
  finalSignal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  strategyResults: StrategyResult[];
  consensus?: {
    buyCount: number;
    sellCount: number;
    holdCount: number;
    avgConfidence: number;
  };
  timestamp: number;
}

interface StrategyHealth {
  openai?: boolean;
  ml?: boolean;
}

interface Agent {
  id: string;
  name: string;
  type: 'ai' | 'ml';
  status: 'active' | 'inactive';
  avatar: string;
  lastThought: string;
  lastMarketAnalysis: string;
  totalDecisions: number;
  successfulDecisions: number;
  lastActiveTime: number;
  winRate: string;
  model: string;
  capabilities: string[];
  lastActiveFormatted: string;
  currentBalance?: number;
  performance?: {
    profit: number;
    profitPercent: number;
    winRate: number;
    totalTrades: number;
  };
}

const AgentSpace: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/agents/status`, {
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('API error:', response.status, response.statusText);
        return;
      }

      const data = await response.json().catch((err) => {
        console.error('JSON parse error:', err);
        return null;
      });

      if (data?.success) {
        setAgents(data.data);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Ошибка получения статуса агентов:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAgents();
    
    // Автообновление каждые 30 секунд
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'error';
      default: return 'default';
    }
  };

  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'ai': return <SmartToyIcon />;
      case 'ml': return <ShowChartIcon />;
      default: return <SmartToyIcon />;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h3" component="h1">
          🤖 Пространство Агентов
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {lastUpdate && (
            <Typography variant="body2" color="text.secondary">
              Обновлено: {lastUpdate.toLocaleTimeString('ru-RU')}
            </Typography>
          )}
          <IconButton onClick={fetchAgents} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Мониторинг и управление торговыми агентами в реальном времени
      </Typography>

      {loading && agents.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {agents.map((agent) => (
            <Grid item xs={12} md={6} lg={4} key={agent.id}>
              <Card 
                sx={{ 
                  height: '100%',
                  border: agent.status === 'active' ? '2px solid #4caf50' : '1px solid #e0e0e0',
                  position: 'relative'
                }}
              >
                <CardContent>
                  {/* Заголовок агента */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Badge
                      overlap="circular"
                      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      badgeContent={
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: agent.status === 'active' ? 'success.main' : 'error.main',
                            border: '2px solid white'
                          }}
                        />
                      }
                    >
                      <Avatar sx={{ width: 48, height: 48, fontSize: '1.5rem' }}>
                        {agent.avatar}
                      </Avatar>
                    </Badge>
                    <Box>
                      <Typography variant="h6" component="h2">
                        {agent.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {agent.model}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Статус и статистика */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Chip
                        label={agent.status === 'active' ? 'Активен' : 'Неактивен'}
                        color={getStatusColor(agent.status) as any}
                        size="small"
                      />
                      <Chip
                        label={`Успешность: ${agent.winRate}%`}
                        color={parseFloat(agent.winRate) > 70 ? 'success' : 'warning'}
                        size="small"
                      />
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary">
                      Решений: {agent.totalDecisions} | Успешных: {agent.successfulDecisions}
                    </Typography>
                  </Box>

                  {/* Последняя мысль */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      💭 Последняя мысль:
                    </Typography>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontStyle: 'italic',
                        bgcolor: 'action.hover',
                        p: 1,
                        borderRadius: 1,
                        minHeight: 40
                      }}
                    >
                      {agent.lastThought}
                    </Typography>
                  </Box>

                  {/* Анализ рынка */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      📊 Анализ рынка:
                    </Typography>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        p: 1,
                        borderRadius: 1,
                        minHeight: 30
                      }}
                    >
                      {agent.lastMarketAnalysis}
                    </Typography>
                  </Box>

                  {/* Возможности */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      🎯 Возможности:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {agent.capabilities.map((capability, index) => (
                        <Chip
                          key={index}
                          label={capability}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* Последняя активность */}
                  <Typography variant="body2" color="text.secondary">
                    Последняя активность: {agent.lastActiveFormatted}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {agents.length === 0 && !loading && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Агенты не найдены. Убедитесь, что стратегии настроены и активны.
        </Alert>
      )}

      {/* Сводка */}
      {agents.length > 0 && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              📈 Сводка по агентам
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" color="primary">
                    {agents.length}
                  </Typography>
                  <Typography variant="body2">Всего агентов</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" color="success.main">
                    {agents.filter(a => a.status === 'active').length}
                  </Typography>
                  <Typography variant="body2">Активных</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" color="info.main">
                    {agents.reduce((sum, a) => sum + a.totalDecisions, 0)}
                  </Typography>
                  <Typography variant="body2">Всего решений</Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h4" color="warning.main">
                    {agents.length > 0 ? 
                      (agents.reduce((sum, a) => sum + parseFloat(a.winRate), 0) / agents.length).toFixed(1) : 0
                    }%
                  </Typography>
                  <Typography variant="body2">Средняя успешность</Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default AgentSpace; 