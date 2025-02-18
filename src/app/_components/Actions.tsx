"use client";

import { api } from "~/trpc/react";
import { ActionList } from './ActionList';
import { CreateActionModal } from './CreateActionModal';

export function Actions({ viewName }: { viewName: string }) {
  const actions = api.action.getAll.useQuery();

  return (
    <div className="w-full max-w-3xl mx-auto">
     <ActionList viewName={viewName} actions={actions.data ?? []} />
     <div className="mt-6">
        <CreateActionModal viewName={viewName}/>
      </div>
    </div>
  );
} 