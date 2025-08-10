'use client';

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip
);

interface SparklineChartProps {
  data: number[];
  color?: string;
  height?: number;
  showTooltip?: boolean;
}

export function SparklineChart({ 
  data, 
  color = '#228be6',
  height = 40,
  showTooltip = false 
}: SparklineChartProps) {
  const chartData = useMemo(() => ({
    labels: data.map((_, i) => i.toString()),
    datasets: [
      {
        data,
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: showTooltip ? 4 : 0,
        tension: 0.4,
      },
    ],
  }), [data, color, showTooltip]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        enabled: showTooltip,
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          title: () => '',
          label: (context: any) => context.parsed.y.toFixed(1),
        },
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
      },
    },
    elements: {
      line: {
        borderCapStyle: 'round' as const,
        borderJoinStyle: 'round' as const,
      },
    },
  }), [showTooltip]);

  return (
    <div style={{ height }}>
      <Line data={chartData} options={options} />
    </div>
  );
}