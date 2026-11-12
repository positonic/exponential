"use client";

import { createContext, useContext, type ReactNode } from "react";
import { api } from "~/trpc/react";
import type { AiCapabilities } from "~/server/services/ai/capabilities";

/**
 * Which AI this install has, for hiding or explaining AI surfaces.
 *
 * The (sidemenu) layout resolves it on the server per request and seeds this
 * provider, so a keyless install never flashes an AI button and exponential.im
 * (every key set) renders exactly as before. Outside the provider the hook
 * falls back to the signed-in `ai.getCapabilities` query, treating "still
 * loading" (or signed out) as off.
 */
const AiCapabilitiesContext = createContext<AiCapabilities | null>(null);

const ALL_OFF: AiCapabilities = {
  openai: false,
  anthropic: false,
  assistant: false,
  summaries: false,
  voice: false,
};

export function AiCapabilitiesProvider({
  capabilities,
  children,
}: {
  capabilities: AiCapabilities;
  children: ReactNode;
}) {
  return <AiCapabilitiesContext.Provider value={capabilities}>{children}</AiCapabilitiesContext.Provider>;
}

export function useAiCapabilities(): AiCapabilities {
  const seeded = useContext(AiCapabilitiesContext);
  const { data } = api.ai.getCapabilities.useQuery(undefined, {
    enabled: seeded === null,
    staleTime: Infinity,
  });
  return seeded ?? data ?? ALL_OFF;
}
