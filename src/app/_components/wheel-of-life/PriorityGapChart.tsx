"use client";

import { useMemo, useState, useEffect } from "react";
import { Text, Loader, Center } from "@mantine/core";

interface LifeDomain {
  id: number;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface Score {
  id: string;
  assessmentId: string;
  lifeDomainId: number;
  currentRank: number;
  desiredRank: number;
  score: number | null;
  reflection: string | null;
  lifeDomain: LifeDomain;
}

interface PriorityGapChartProps {
  scores: Score[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RechartsModule = any;

export function PriorityGapChart({ scores }: PriorityGapChartProps) {
  const [recharts, setRecharts] = useState<RechartsModule>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Dynamically import recharts only on client
    void import("recharts").then((mod) => {
      setRecharts(mod);
    });
  }, []);

  const chartData = useMemo(() => {
    return scores
      .map((s) => ({
        name: s.lifeDomain.title.split("/")[0],
        fullName: s.lifeDomain.title,
        gap: s.currentRank - s.desiredRank,
        currentRank: s.currentRank,
        desiredRank: s.desiredRank,
        score: s.score,
      }))
      .sort((a, b) => b.gap - a.gap);
  }, [scores]);

  const getBarColor = (gap: number) => {
    if (gap > 3) return "var(--mantine-color-red-6)";
    if (gap > 1) return "var(--mantine-color-orange-5)";
    if (gap > 0) return "var(--mantine-color-yellow-5)";
    if (gap === 0) return "var(--mantine-color-green-6)";
    return "var(--mantine-color-blue-5)";
  };

  if (scores.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No assessment data available
      </Text>
    );
  }

  // Show loading while recharts loads on client
  if (!isClient || !recharts) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } = recharts;

  return (
    <div style={{ width: "100%", height: 400 }}>
      <ResponsiveContainer>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 20, right: 30, left: 100, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            type="number"
            domain={[-5, 5]}
            tickFormatter={(value: number) => (value > 0 ? `+${value}` : String(value))}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            content={({ active, payload }: { active?: boolean; payload?: Array<{ payload: (typeof chartData)[0] }> }) => {
              if (active && payload && payload.length) {
                const data = payload[0]?.payload;
                if (!data) return null;
                return (
                  <div className="bg-surface-primary border border-border-primary rounded-md p-3 shadow-lg">
                    <Text fw={600} size="sm">
                      {data.fullName}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Current Priority: #{data.currentRank}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Desired Priority: #{data.desiredRank}
                    </Text>
                    <Text
                      size="xs"
                      mt={4}
                      c={data.gap > 0 ? "orange" : data.gap < 0 ? "blue" : "green"}
                      fw={600}
                    >
                      Gap: {data.gap > 0 ? "+" : ""}
                      {data.gap}
                      {data.gap > 0
                        ? " (needs more focus)"
                        : data.gap < 0
                        ? " (could reduce focus)"
                        : " (balanced)"}
                    </Text>
                    {data.score !== null && (
                      <Text size="xs" c="dimmed" mt={4}>
                        Satisfaction: {data.score}/10
                      </Text>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <ReferenceLine x={0} stroke="var(--mantine-color-gray-5)" strokeWidth={2} />
          <Bar dataKey="gap" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.gap)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded"
            style={{ backgroundColor: "var(--mantine-color-red-6)" }}
          />
          <Text size="xs" c="dimmed">
            Needs much more focus
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded"
            style={{ backgroundColor: "var(--mantine-color-green-6)" }}
          />
          <Text size="xs" c="dimmed">
            Balanced
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded"
            style={{ backgroundColor: "var(--mantine-color-blue-5)" }}
          />
          <Text size="xs" c="dimmed">
            Could reduce focus
          </Text>
        </div>
      </div>
    </div>
  );
}
