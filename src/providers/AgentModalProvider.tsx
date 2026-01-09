'use client';

import { createContext, useContext, useState, useCallback, type PropsWithChildren } from 'react';

interface AgentModalContextValue {
  isOpen: boolean;
  projectId: string | null;
  openModal: (projectId?: string) => void;
  closeModal: () => void;
}

const AgentModalContext = createContext<AgentModalContextValue>({
  isOpen: false,
  projectId: null,
  openModal: () => undefined,
  closeModal: () => undefined,
});

export function useAgentModal() {
  return useContext(AgentModalContext);
}

export function AgentModalProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  const openModal = useCallback((projectId?: string) => {
    setProjectId(projectId ?? null);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    // Keep projectId until next open so animations can complete
  }, []);

  const value: AgentModalContextValue = {
    isOpen,
    projectId,
    openModal,
    closeModal,
  };

  return (
    <AgentModalContext.Provider value={value}>
      {children}
    </AgentModalContext.Provider>
  );
}
