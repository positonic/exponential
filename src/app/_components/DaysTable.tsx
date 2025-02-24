'use client';

import { useState } from 'react';
import { SegmentedControl, Table, Paper, Group, Text } from '@mantine/core';
import Link from 'next/link';

type TimeFilter = 'all' | 'week' | 'month';

export function DaysTable() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');

  // Helper function to get the week range string
  const getWeekRange = (date: Date): string => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.getDate()} - ${end.getDate()}th of ${end.toLocaleString('default', { month: 'long' })} ${end.getFullYear()}`;
  };

  // Sample data - in a real app, this would come from your database
  const entries = [
    {
      id: '1',
      date: new Date(),
      name: `${new Date().getDate()}th ${new Date().toLocaleString('default', { month: 'long' })} ${new Date().getFullYear()}`,
      formattedDate: new Date().toLocaleDateString(),
      weekRange: getWeekRange(new Date()),
    },
    {
      id: '2',
      date: new Date(Date.now() - 86400000),
      name: `${new Date(Date.now() - 86400000).getDate()}th ${new Date(Date.now() - 86400000).toLocaleString('default', { month: 'long' })} ${new Date(Date.now() - 86400000).getFullYear()}`,
      formattedDate: new Date(Date.now() - 86400000).toLocaleDateString(),
      weekRange: getWeekRange(new Date(Date.now() - 86400000)),
    },
    // Add more entries as needed
  ];

  return (
    <div className="space-y-4">
      <Group justify="space-between" align="center">
        <SegmentedControl
          value={timeFilter}
          onChange={(value) => setTimeFilter(value as TimeFilter)}
          data={[
            { label: 'All', value: 'all' },
            { label: 'This week', value: 'week' },
            { label: 'This month', value: 'month' },
          ]}
          className="bg-[#262626]"
        />
      </Group>

      <Paper className="bg-[#262626]">
        <Table verticalSpacing="sm" className="bg-[#262626]">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Date</Table.Th>
              <Table.Th>Week</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {entries.map((entry) => (
              <Table.Tr key={entry.id} className="hover:bg-[#2C2E33] cursor-pointer">
                <Table.Td>
                  <Link href={`/days/${entry.id}`} className="flex items-center no-underline text-gray-300">
                    <span className="mr-2">🌻</span>
                    {entry.name}
                  </Link>
                </Table.Td>
                <Table.Td>{entry.formattedDate}</Table.Td>
                <Table.Td>{entry.weekRange}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </div>
  );
} 