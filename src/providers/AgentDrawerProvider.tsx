'use client';

import { createContext, useContext, useState, useCallback, type PropsWithChildren } from 'react';

interface AgentDrawerContextValue {
  isOpen: boolean;
  projectId: string | null;
  openDrawer: (projectId?: string) => void;
  closeDrawer: () => void;
}

const AgentDrawerContext = createContext<AgentDrawerContextValue>({
  isOpen: false,
  projectId: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  openDrawer: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  closeDrawer: () => {},
});

export function useAgentDrawer() {
  return useContext(AgentDrawerContext);
}

export function AgentDrawerProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  const openDrawer = useCallback((projectId?: string) => {
    setProjectId(projectId ?? null);
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    // Keep projectId until next open so animations can complete
  }, []);

  const value: AgentDrawerContextValue = {
    isOpen,
    projectId,
    openDrawer,
    closeDrawer,
  };

  return (
    <AgentDrawerContext.Provider value={value}>
      {children}
    </AgentDrawerContext.Provider>
  );
}
