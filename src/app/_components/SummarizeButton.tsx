'use client';

import { Button, Paper, Title, Text, Group, Badge, Table, Checkbox, Select } from '@mantine/core';
import { useState } from 'react';
import { api } from '~/trpc/react';
import type { TranscriptionSummary } from "~/types/transcription";

interface SummarizeButtonProps {
  transcription: string;
  isCompleted: boolean;
}

export function SummarizeButton({ transcription, isCompleted }: SummarizeButtonProps) {
  console.log("SummarizeButton", {transcription, isCompleted})
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<TranscriptionSummary | null>(null);
  const [selectedSetups, setSelectedSetups] = useState<string[]>([]);
  const [summaryType, setSummaryType] = useState<'basic' | 'trade-setups'>('basic');
  
  const summarizeMutation = api.video.summarizeTranscription.useMutation({
    onSuccess: (summary) => {
      console.log("summarizeMutation onSuccess", summary)
      setSummary(summary);
      setIsLoading(false);
    },
    onError: (error) => {
      console.error('Error generating summary:', error);
      setIsLoading(false);
    },
  });

  const handleSummarize = () => {
    setIsLoading(true);
    summarizeMutation.mutate({ transcription, summaryType });
  };

  return (
    <div>
      <Group gap="sm">
        <Select
          data={[
            { value: 'basic', label: 'Basic Summary' },
            { value: 'trade-setups', label: 'Trade Setups' },
          ]}
          value={summaryType}
          onChange={(value) => setSummaryType(value as 'basic' | 'trade-setups')}
          w={200}
        />
        <div>
          <Button
            loading={isLoading}
            disabled={!transcription || !isCompleted}
            onClick={handleSummarize}
            title={!transcription ? "No transcription available" : 
                   !isCompleted ? "Video processing not completed" : 
                   "Generate summary"}
          >
            Summarize transcription
          </Button>
        </div>
      </Group>

      {summary && (
        <Paper shadow="sm" p="md" radius="md" withBorder className="mt-4">
          <Title order={3} mb="md">Summary</Title>
          <Text size="sm" c="dimmed" mb="md">{summary.coins.length} coins analyzed</Text>
          <Text size="sm" mb="md">{summary.generalMarketContext}</Text>
          
          {summary.coins.map((coin) => (
            <Paper key={coin.coin} shadow="xs" p="sm" radius="sm" withBorder mb="md">
              <Title order={4} mb="xs">{coin.coin}</Title>
              <Group gap="xs" mb="xs">
                <Badge 
                  key={`${coin.coin}-${coin.sentiment}`}
                  variant="light"
                  color={coin.sentiment?.toLowerCase().includes('bullish') ? 'green' : 
                         coin.sentiment?.toLowerCase().includes('bearish') ? 'red' : 'blue'}
                >
                  {coin.sentiment}
                </Badge>
              </Group>
              <Text size="sm" mb="md">{coin.marketContext}</Text>
              
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th key="position">Position</Table.Th>
                    <Table.Th key="entry-triggers">Entry Triggers</Table.Th>
                    <Table.Th key="entry-price">Entry Price</Table.Th>
                    <Table.Th key="take-profit">Take Profit</Table.Th>
                    <Table.Th key="stop-loss">Stop Loss</Table.Th>
                    <Table.Th key="timeframe">Timeframe</Table.Th>
                    <Table.Th key="actions" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {coin.tradeSetups?.map((setup) => (
                    <Table.Tr
                      key={`${coin.coin}-${setup.position}`}
                      bg={selectedSetups.includes(`${coin.coin}-${setup.position}`) 
                          ? 'var(--mantine-color-blue-light)' 
                          : undefined}
                    >
                      <Table.Td key="position">{setup.position}</Table.Td>
                      <Table.Td key="entry-triggers">{setup.entryTriggers}</Table.Td>
                      <Table.Td key="entry-price">{setup.entryPrice}</Table.Td>
                      <Table.Td key="take-profit">{setup.takeProfit}</Table.Td>
                      <Table.Td key="stop-loss">{setup.stopLoss}</Table.Td>
                      <Table.Td key="timeframe">{setup.timeframe}</Table.Td>
                      <Table.Td key="actions">
                        <Checkbox
                          aria-label="Select setup"
                          checked={selectedSetups.includes(`${coin.coin}-${setup.position}`)}
                          onChange={(event) =>
                            setSelectedSetups(
                              event.currentTarget.checked
                                ? [...selectedSetups, `${coin.coin}-${setup.position}`]
                                : selectedSetups.filter(id => id !== `${coin.coin}-${setup.position}`)
                            )
                          }
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          ))}
        </Paper>
      )}
    </div>
  );
} 