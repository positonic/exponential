'use client';

import { useEffect } from 'react';
import { useAgentModal, type PageContext } from '~/providers/AgentModalProvider';

/**
 * Registers page context for the AI agent chat overlay.
 * When the user opens the chat, the agent will know what page they're on.
 *
 * Pass `null` while data is still loading — registration is skipped until context is ready.
 *
 * `clearOnUnmount` (default `true`) resets the shared context slot to `null` when the
 * component unmounts. The workspace layout registrar — the baseline owner — keeps the
 * default so leaving the workspace clears context. Page-level registrants that live inside
 * components which unmount on same-route tab switches (e.g. the goals page sub-tabs) should
 * pass `false`: nulling the single shared slot on a tab switch would blank the context with
 * no registrant left to restore it (the layout effect doesn't re-run without a pathname
 * change). Real navigations always re-assert context because the layout re-runs on pathname
 * change and overwrites any stale child context.
 */
export function useRegisterPageContext(
  context: PageContext | null,
  options?: { clearOnUnmount?: boolean },
) {
  const { setPageContext } = useAgentModal();
  const clearOnUnmount = options?.clearOnUnmount ?? true;

  useEffect(() => {
    if (context) {
      setPageContext(context);
    }

    return () => {
      if (clearOnUnmount) {
        setPageContext(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stringify avoids infinite loops from object identity changes
  }, [JSON.stringify(context), setPageContext, clearOnUnmount]);
}
