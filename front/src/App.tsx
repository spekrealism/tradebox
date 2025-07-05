import { Routes, Route } from 'react-router-dom'
import { Container, Box } from '@mui/material'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Trading from './pages/Trading'
import MLAnalysis from './pages/MLAnalysis'
import StrategyAnalysis from './pages/StrategyAnalysis'
import AgentSpacePage from './pages/AgentSpace'
import Settings from './pages/Settings'

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <Container maxWidth="xl" sx={{ flex: 1, py: 3 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trading" element={<Trading />} />
          <Route path="/ml-analysis" element={<MLAnalysis />} />
          <Route path="/strategy-analysis" element={<StrategyAnalysis />} />
          <Route path="/agents" element={<AgentSpacePage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Container>
    </Box>
  )
}

export default App 