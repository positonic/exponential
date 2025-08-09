"use client";

import { Paper, Stack, Group, Skeleton, Box } from "@mantine/core";

export function CalendarEventsSkeleton() {
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Skeleton height={16} width={16} />
        <Skeleton height={16} width={150} />
      </Group>
      
      {Array.from({ length: 3 }).map((_, index) => (
        <Paper
          key={index}
          p="sm"
          className="bg-[#252525] border border-gray-700"
        >
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <Skeleton height={16} width="70%" />
              <Skeleton height={20} width={60} radius="xl" />
            </Group>
            
            <Group gap="md">
              <Group gap={4}>
                <Skeleton height={12} width={12} />
                <Skeleton height={12} width={80} />
              </Group>
              
              <Group gap={4}>
                <Skeleton height={12} width={12} />
                <Skeleton height={12} width={120} />
              </Group>
            </Group>
            
            <Skeleton height={12} width="90%" />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

export function CalendarDayViewSkeleton() {
  const hours = Array.from({ length: 8 }, (_, i) => i); // Show first 8 hours for skeleton
  
  return (
    <div className="relative bg-[#25262B] rounded-lg border border-gray-700 p-4">
      <Stack gap="xs">
        {hours.map(hour => (
          <div key={hour} className="relative">
            <Group gap="sm" align="flex-start">
              <Skeleton height={12} width={40} />
              <div className="flex-1 min-h-[60px] relative border-t border-gray-700/30">
                {/* Random event skeletons */}
                {Math.random() > 0.6 && (
                  <Paper
                    className="absolute bg-blue-500/20 border border-blue-500/50"
                    style={{
                      top: Math.random() * 20,
                      left: 10,
                      width: Math.random() * 200 + 100,
                      height: Math.random() * 30 + 20,
                    }}
                    p={4}
                  >
                    <Skeleton height={10} width="80%" />
                    <Skeleton height={8} width="60%" mt={2} />
                  </Paper>
                )}
              </div>
            </Group>
          </div>
        ))}
      </Stack>
    </div>
  );
}

export function CalendarDrawerSkeleton() {
  return (
    <Stack gap="md">
      {/* View mode toggle skeleton */}
      <Group gap="xs">
        <Skeleton height={28} width={60} radius="sm" />
        <Skeleton height={28} width={80} radius="sm" />
        <Skeleton height={28} width={80} radius="sm" />
      </Group>
      
      {/* Content skeleton */}
      <CalendarEventsSkeleton />
    </Stack>
  );
}