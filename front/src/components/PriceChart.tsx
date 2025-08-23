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
  Filler,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Box, CircularProgress, Alert } from '@mui/material'
import { api, OHLCVData, PredictionCloudResponse } from '../services/api'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
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
  const [cloud, setCloud] = useState<PredictionCloudResponse | null>(null)

  useEffect(() => {
    const fetchData = async (initial = false) => {
      try {
        if (initial) setLoading(true)
        setError(null)
        const ohlcv = await api.getOHLCV(symbol, timeframe, limit)
        setData(ohlcv)
        // подгружаем прогнозный коридор от ML
        const horizonByTf: Record<string, number> = { '1m': 30, '5m': 36, '15m': 20, '30m': 16, '1h': 16, '4h': 12, '1d': 7 }
        const horizonSteps = horizonByTf[timeframe] ?? 16
        const params = { samples_per_step: 25, steps: 120, k_atr: 1.0, method: 'fan' as const }
        const cloudResp = await api.getPredictionCloud(symbol, timeframe, Math.max(300, limit), horizonSteps, params)
        setCloud(cloudResp)
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

  // Формируем ось времени: исторические + прогнозные метки
  const histTs = data.map(d => d.timestamp)
  const lastTs = histTs.length ? histTs[histTs.length - 1] : undefined
  const futureTs = (cloud?.centerline || [])
    .map(p => p.t)
    .filter(t => (lastTs ? t >= lastTs : true))
  const mergedTs = Array.from(new Set([...
    histTs,
    ...futureTs
  ])).sort((a, b) => a - b)

  // Ряды данных по mergedTs
  const closeSeries = mergedTs.map(ts => {
    const idx = histTs.indexOf(ts)
    return idx >= 0 ? data[idx].close : null
  })

  const centerlineSeries = mergedTs.map(ts => {
    const p = cloud?.centerline.find(pt => pt.t === ts)
    return p ? p.p : null
  })

  // Облако: используем scatter с индивидуальной альфой
  const cloudPoints = (cloud?.cloud || []).map(pt => ({ x: new Date(pt.t), y: pt.p, a: pt.a }))
  const cloudColors = cloudPoints.map(pt => `rgba(79, 195, 247, ${Math.max(0.06, Math.min(0.35, pt.a))})`)

  const chartData: any = {
    labels: mergedTs.map(ts => new Date(ts)),
    datasets: [
      {
        label: 'Цена закрытия',
        data: closeSeries,
        borderColor: '#f7931a',
        backgroundColor: 'rgba(247, 147, 26, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 5,
        spanGaps: true,
      },
      {
        label: 'Центр прогноза',
        data: centerlineSeries,
        borderColor: '#4fc3f7',
        backgroundColor: 'rgba(79, 195, 247, 0.05)',
        borderWidth: 2,
        fill: false,
        tension: 0.25,
        pointRadius: 0,
        spanGaps: true,
      },
      {
        type: 'scatter' as const,
        label: 'Прогнозный коридор',
        data: cloudPoints as any,
        showLine: false,
        pointRadius: 2,
        pointHoverRadius: 0,
        pointBackgroundColor: cloudColors,
        borderColor: cloudColors,
        parsing: {
          xAxisKey: 'x',
          yAxisKey: 'y',
        },
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