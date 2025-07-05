import React from 'react';
import { Container, Box } from '@mui/material';
import AgentSpace from '../components/StrategyComparison';

const AgentSpacePage: React.FC = () => {
  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        <AgentSpace />
      </Box>
    </Container>
  );
};

export default AgentSpacePage; 