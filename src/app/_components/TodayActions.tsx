"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';

export function TodayActions() {
  const todayActions = api.action.getToday();

  return (
    <div className="w-full max-w-3xl mx-auto">
      <ActionList actions={todayActions.data ?? []} />
      <div className="mt-6">
        <CreateActionModal />
      </div>
    </div>
  );
} 