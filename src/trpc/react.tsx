"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { loggerLink, unstable_httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { useState, useEffect } from "react";
import SuperJSON from "superjson";

import { type AppRouter } from "~/server/api/root";
import { createQueryClient } from "./query-client";
import { useOnlineStatus } from "~/hooks/useOnlineStatus";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  }
  // Browser: use singleton pattern to keep the same query client
  return (clientQueryClientSingleton ??= createQueryClient());
};

export const api = createTRPCReact<AppRouter>();

/**
 * Inference helper for inputs.
 *
 * @example type HelloInput = RouterInputs['example']['hello']
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helper for outputs.
 *
 * @example type HelloOutput = RouterOutputs['example']['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

function TRPCReactProviderInner(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const { isOnline, wasOffline } = useOnlineStatus();

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        unstable_httpBatchStreamLink({
          transformer: SuperJSON,
          url: getBaseUrl() + "/api/trpc",
          headers: () => {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            return headers;
          },
        }),
      ],
    })
  );

  // Handle offline/online transitions
  useEffect(() => {
    if (!isOnline) {
      // When offline, pause all queries from refetching
      queryClient.setDefaultOptions({
        queries: {
          refetchOnWindowFocus: false,
          refetchOnMount: false,
          refetchOnReconnect: false,
          retry: false,
        },
      });
    } else {
      // When back online, restore normal behavior
      queryClient.setDefaultOptions({
        queries: {
          refetchOnWindowFocus: true,
          refetchOnMount: true,
          refetchOnReconnect: true,
          retry: 3,
        },
      });

      // If we were offline and came back online, refetch all active queries
      if (wasOffline) {
        void queryClient.refetchQueries({ type: 'active' });
      }
    }
  }, [isOnline, wasOffline, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {props.children}
      </api.Provider>
    </QueryClientProvider>
  );
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  return <TRPCReactProviderInner>{props.children}</TRPCReactProviderInner>;
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
