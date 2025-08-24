"use client";

import { Text, Paper, Group, Stack, Badge, Alert, Button } from "@mantine/core";
import { IconCalendar, IconClock, IconMapPin, IconAlertCircle, IconRefresh, IconWifiOff } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { format, parseISO } from "date-fns";
import { CalendarEventsSkeleton } from "./CalendarSkeleton";
import { useState, useEffect } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { stripHtml } from "~/lib/utils";

function TodayCalendarEventsContent() {
  const [isOnline, setIsOnline] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  
  const { 
    data: events, 
    isLoading, 
    error, 
    refetch,
    isRefetching 
  } = api.calendar.getTodayEvents.useQuery(undefined, {
    retry: (failureCount, error) => {
      // Custom retry logic with exponential backoff
      if (failureCount >= 3) return false;
      
      // Don't retry on authentication errors
      if (error?.message?.includes('access token')) return false;
      
      const delay = Math.min(1000 * Math.pow(2, failureCount), 10000);
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
      }, delay);
      
      return true;
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
    refetchInterval: 15 * 60 * 1000, // Auto-refresh every 15 minutes
  });

  // Network status detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    void refetch();
  };

  if (isLoading || isRefetching) {
    return <CalendarEventsSkeleton />;
  }

  // Offline state
  if (!isOnline) {
    return (
      <Alert icon={<IconWifiOff size={16} />} color="orange" variant="light">
        <Group justify="space-between">
          <Text size="sm">You&apos;re offline. Calendar events may be outdated.</Text>
          <Button size="xs" variant="light" onClick={handleRetry} disabled={!isOnline}>
            Retry
          </Button>
        </Group>
      </Alert>
    );
  }

  if (error) {
    const isAuthError = error.message.includes("access token") || error.message.includes("Calendar access token");
    const isNetworkError = error.message.includes("fetch") || error.message.includes("Network");
    
    return (
      <Alert 
        icon={<IconAlertCircle size={16} />} 
        color={isAuthError ? "yellow" : "red"} 
        variant="light"
      >
        <Stack gap="xs">
          <Text size="sm">
            {isAuthError 
              ? "Please reconnect your Google Calendar to see events."
              : isNetworkError
              ? "Network error. Please check your connection and try again."
              : `Failed to load calendar events. ${retryCount > 0 ? `(Attempt ${retryCount + 1})` : ""}`}
          </Text>
          
          {!isAuthError && (
            <Group gap="xs">
              <Button 
                size="xs" 
                variant="light" 
                color={isNetworkError ? "orange" : "red"}
                leftSection={<IconRefresh size={14} />}
                onClick={handleRetry}
                loading={isRefetching}
                disabled={retryCount >= 3}
              >
                {retryCount >= 3 ? 'Max retries reached' : 'Try Again'}
              </Button>
              
              {retryCount >= 3 && (
                <Button 
                  size="xs" 
                  variant="subtle" 
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              )}
            </Group>
          )}
        </Stack>
      </Alert>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Paper p="md" className="bg-surface-primary">
        <Group>
          <IconCalendar size={16} className="text-text-muted" />
          <Text size="sm" c="dimmed">No calendar events today</Text>
        </Group>
      </Paper>
    );
  }

  const formatEventTime = (event: typeof events[0]) => {
    if (event.start.dateTime) {
      const startTime = parseISO(event.start.dateTime);
      const endTime = event.end.dateTime ? parseISO(event.end.dateTime) : null;
      
      if (endTime) {
        return `${format(startTime, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
      } else {
        return format(startTime, 'h:mm a');
      }
    } else if (event.start.date) {
      return 'All day';
    }
    return '';
  };

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <IconCalendar size={16} className="text-blue-400" />
        <Text size="sm" fw={500} className="text-text-secondary">Today&apos;s Calendar ({events.length})</Text>
      </Group>
      
      {events.map((event) => (
        <Paper
          key={event.id}
          p="sm"
          className="bg-surface-secondary border border-border-primary hover:bg-surface-hover transition-colors"
        >
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" fw={500} className="flex-1 min-w-0 truncate">
                {event.summary}
              </Text>
              {event.status === 'confirmed' && (
                <Badge size="xs" color="green" variant="light">
                  Confirmed
                </Badge>
              )}
            </Group>
            
            <Group gap="md" wrap="nowrap">
              <Group gap={4}>
                <IconClock size={12} className="text-text-muted" />
                <Text size="xs" c="dimmed">
                  {formatEventTime(event)}
                </Text>
              </Group>
              
              {event.location && (
                <Group gap={4}>
                  <IconMapPin size={12} className="text-text-muted" />
                  <Text size="xs" c="dimmed" className="truncate max-w-[200px]">
                    {event.location}
                  </Text>
                </Group>
              )}
            </Group>
            
            {event.description && (
              <Text size="xs" c="dimmed" className="line-clamp-2">
                {stripHtml(event.description)}
              </Text>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

// Wrap with error boundary
export function TodayCalendarEvents() {
  return (
    <ErrorBoundary>
      <TodayCalendarEventsContent />
    </ErrorBoundary>
  );
}