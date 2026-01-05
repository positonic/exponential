'use client';

import { Container } from '@mantine/core';
import { GreetingHeader } from './GreetingHeader';
import { LifeBalanceWidget } from './LifeBalanceWidget';
import { MomentumWidget } from './MomentumWidget';
import { TodayFocusPanel } from './TodayFocusPanel';
import { api } from '~/trpc/react';

interface CommandCenterProps {
  userName: string;
  workspaceId?: string;
}

export function CommandCenter({ userName, workspaceId }: CommandCenterProps) {
  // Fetch habit data for AI insight
  const { data: habitStatus } = api.habit.getTodayStatus.useQuery();
  const { data: todayActions } = api.action.getToday.useQuery({ workspaceId });

  // Generate contextual AI insight based on data
  const generateAiInsight = () => {
    const habitsToComplete = habitStatus?.filter(h => !h.isCompletedToday)?.length ?? 0;
    const actionsCount = todayActions?.length ?? 0;

    if (habitsToComplete > 0 && actionsCount > 0) {
      return `${habitsToComplete} habit${habitsToComplete > 1 ? 's' : ''} and ${actionsCount} action${actionsCount > 1 ? 's' : ''} for today`;
    } else if (habitsToComplete > 0) {
      return `${habitsToComplete} habit${habitsToComplete > 1 ? 's' : ''} to complete today`;
    } else if (actionsCount > 0) {
      return `${actionsCount} action${actionsCount > 1 ? 's' : ''} on your plate today`;
    }
    return 'Your day is clear. Time to plan something meaningful.';
  };

  const handleQuickCapture = (text: string) => {
    // TODO: Implement quick capture with AI categorization
    console.log('Quick capture:', text);
  };

  return (
    <Container size="xl" py="lg" className="min-h-screen">
      {/* Greeting Header with Quick Capture */}
      <GreetingHeader
        userName={userName}
        aiInsight={generateAiInsight()}
        onQuickCapture={handleQuickCapture}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar - Life Balance & Momentum */}
        <div className="lg:col-span-3 space-y-6">
          <LifeBalanceWidget workspaceId={workspaceId} />
          <MomentumWidget workspaceId={workspaceId} />
        </div>

        {/* Main Content - Today's Focus */}
        <div className="lg:col-span-9">
          <TodayFocusPanel workspaceId={workspaceId} />
        </div>
      </div>
    </Container>
  );
}
