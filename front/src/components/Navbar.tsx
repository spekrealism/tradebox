import { AppBar, Toolbar, Typography, Button, Box, Chip } from '@mui/material'
import { Link, useLocation } from 'react-router-dom'
import {
  Dashboard as DashboardIcon,
  TrendingUp as TradingIcon,
  Psychology as MLIcon,
  Settings as SettingsIcon,
  CurrencyBitcoin,
} from '@mui/icons-material'

const navItems = [
  { path: '/', label: 'Дашборд', icon: DashboardIcon },
  { path: '/trading', label: 'Торговля', icon: TradingIcon },
  { path: '/ml-analysis', label: 'ML Анализ', icon: MLIcon },
  { path: '/settings', label: 'Настройки', icon: SettingsIcon },
]

export default function Navbar() {
  const location = useLocation()

  return (
    <AppBar position="static" elevation={1}>
      <Toolbar>
        <CurrencyBitcoin sx={{ mr: 1 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
          Crypto Trading Bot
          <Chip 
            label="ML Powered" 
            size="small" 
            color="secondary" 
            sx={{ ml: 2, fontSize: '0.7rem' }}
          />
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          {navItems.map((item) => {
            const IconComponent = item.icon
            const isActive = location.pathname === item.path
            
            return (
              <Button
                key={item.path}
                component={Link}
                to={item.path}
                color={isActive ? 'secondary' : 'inherit'}
                startIcon={<IconComponent />}
                sx={{
                  textTransform: 'none',
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? 'rgba(0, 212, 170, 0.1)' : 'transparent',
                }}
              >
                {item.label}
              </Button>
            )
          })}
        </Box>
      </Toolbar>
    </AppBar>
  )
} 