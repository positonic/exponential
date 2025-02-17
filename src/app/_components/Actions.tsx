"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';

export function Actions({ viewDate }: { viewDate: string }) {
  const actions = api.action.getAll.useQuery();

  return (
    <div className="w-full max-w-3xl mx-auto">
     <ActionList viewDate={viewDate} actions={actions.data ?? []} />
     <div className="mt-6">
        <CreateActionModal />
      </div>
    </div>
  );
} 