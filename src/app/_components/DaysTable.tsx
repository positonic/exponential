'use client';

import { useState } from 'react';
import { SegmentedControl, Table, Paper, Group, Text, Loader } from '@mantine/core';
import Link from 'next/link';
import { format, isThisWeek, isThisMonth } from 'date-fns';
import { api } from '~/trpc/react';

type TimeFilter = 'all' | 'week' | 'month';

export function DaysTable() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  
  // Fetch days from the database
  const { data: days, isLoading, isError } = api.day.getUserDays.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Helper function to get the week range string
  const getWeekRange = (date: Date): string => {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.getDate()} - ${end.getDate()}th of ${end.toLocaleString('default', { month: 'long' })} ${end.getFullYear()}`;
  };

  // Filter days based on selected time filter
  const filteredDays = days
    ? days
        .filter(day => {
          const date = new Date(day.date);
          if (timeFilter === 'week') return isThisWeek(date);
          if (timeFilter === 'month') return isThisMonth(date);
          return true; // 'all' filter
        })
        // Sort by most recent first
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader color="orange" />
      </div>
    );
  }

  if (isError) {
    return (
      <Paper className="bg-[#262626] p-4">
        <Text c="dimmed">Error loading days. Please try again later.</Text>
      </Paper>
    );
  }

  if (!filteredDays.length) {
    return (
      <Paper className="bg-[#262626] p-4">
        <Text c="dimmed">No days found. Create your first day by clicking the &quot;Today&quot; button.</Text>
      </Paper>
    );
  }

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
            {filteredDays.map((day) => {
              const date = new Date(day.date);
              const formattedDate = format(date, 'PPP');
              const dayName = `${date.getDate()}${getDaySuffix(date.getDate())} ${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
              const weekRange = getWeekRange(date);
              const formattedUrlDate = format(date, 'yyyy-MM-dd');
              
              return (
                <Table.Tr key={day.id} className="hover:bg-[#2C2E33] cursor-pointer">
                  <Table.Td>
                    <Link href={`/days/${formattedUrlDate}`} className="flex items-center no-underline text-gray-300">
                      <span className="mr-2">🌻</span>
                      {dayName}
                    </Link>
                  </Table.Td>
                  <Table.Td>{formattedDate}</Table.Td>
                  <Table.Td>{weekRange}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
    </div>
  );
}

// Helper function to get the day suffix (st, nd, rd, th)
function getDaySuffix(day: number): string {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
} 