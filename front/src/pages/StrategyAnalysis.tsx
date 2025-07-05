import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import AgentSpace from '../components/StrategyComparison';

const StrategyAnalysis: React.FC = () => {
  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        <AgentSpace />
      </Box>
    </Container>
  );
};

export default StrategyAnalysis; 