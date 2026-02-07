'use client';

import { useEffect } from 'react';
import { useAgentModal, type PageContext } from '~/providers/AgentModalProvider';

/**
 * Registers page context for the AI agent chat overlay.
 * When the user opens the chat, the agent will know what page they're on.
 * Context is automatically cleared when the component unmounts (navigation).
 *
 * Pass `null` while data is still loading — registration is skipped until context is ready.
 */
export function useRegisterPageContext(context: PageContext | null) {
  const { setPageContext } = useAgentModal();

  useEffect(() => {
    if (context) {
      setPageContext(context);
    }

    return () => {
      setPageContext(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stringify avoids infinite loops from object identity changes
  }, [JSON.stringify(context), setPageContext]);
}
