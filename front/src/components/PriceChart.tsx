import { useState, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Box, CircularProgress, Alert } from '@mui/material'
import { api, OHLCVData } from '../services/api'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
)

interface PriceChartProps {
  symbol: string
  timeframe?: string
  limit?: number
}

export default function PriceChart({ symbol, timeframe = '1h', limit = 100 }: PriceChartProps) {
  const [data, setData] = useState<OHLCVData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async (initial = false) => {
      try {
        if (initial) setLoading(true)
        setError(null)
        const ohlcv = await api.getOHLCV(symbol, timeframe, limit)
        setData(ohlcv)
      } catch (err: any) {
        setError(err.message || 'Ошибка загрузки данных')
      } finally {
        if (initial) setLoading(false)
      }
    }

    fetchData(true)

    // Обновляем данные каждые 120 секунд без перезапуска спиннера
    const interval = setInterval(() => fetchData(false), 120000)
    return () => clearInterval(interval)
  }, [symbol, timeframe, limit])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={300}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>
  }

  const chartData = {
    labels: data.map(item => new Date(item.timestamp)),
    datasets: [
      {
        label: 'Цена закрытия',
        data: data.map(item => item.close),
        borderColor: '#f7931a',
        backgroundColor: 'rgba(247, 147, 26, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 5,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y
            return `Цена: $${value.toLocaleString()}`
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          displayFormats: {
            hour: 'HH:mm',
            day: 'MMM dd',
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)',
        },
      },
      y: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)',
          callback: (value: any) => `$${value.toLocaleString()}`,
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
    elements: {
      point: {
        hoverBackgroundColor: '#f7931a',
      },
    },
  }

  return (
    <Box height={300}>
      <Line data={chartData} options={options} />
    </Box>
  )
} 