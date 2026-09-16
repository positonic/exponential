'use client';

import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import SuperJSON, { type SuperJSONResult } from 'superjson';
import { api, type RouterOutputs } from '~/trpc/react';

type WorkspaceBySlug = RouterOutputs['workspace']['getBySlug'];

/**
 * The server layout's `workspace.getBySlug` read, superjson-encoded so any
 * Prisma type survives the RSC boundary. `null` means the server could not
 * read it (no access, not found): the client's own fetch then surfaces the
 * real error, and WorkspaceProvider redirects on it as before.
 */
export type ServerWorkspace = Promise<SuperJSONResult | null>;

/** The value of a promise that has already settled, read synchronously. */
function readSettled<T>(promise: Promise<T>): { value: T } | undefined {
  // React Flight promises call back synchronously once resolved (the same
  // trick TanStack's hydrate uses); a pending or native promise does not.
  let settled: { value: T } | undefined;
  void promise.then(
    (value) => {
      settled = { value };
    },
    () => undefined,
  );
  return settled;
}

/**
 * Puts the server's `workspace.getBySlug` result into the query cache before
 * any observer fetches it, so the workspace guards (GuestRouteGuard,
 * ProductLayout) pass on the first render after hydration instead of waiting
 * for a client round trip.
 *
 * A `<HydrationBoundary>` can't do this: WorkspaceProvider and the sidebar
 * sit in the root `(sidemenu)` layout, above any boundary a workspace layout
 * can render, and their `useQuery` calls create the cache entry first.
 * TanStack skips hydrating a pending query into an existing entry.
 *
 * Seeding runs in a layout effect, not during render, so the first client
 * render matches the server HTML (where the query is still pending). Layout
 * effects run before the passive effects in which observers subscribe and
 * fetch, so a seeded query is never fetched twice.
 */
export function useSeedWorkspaceQuery(slug: string, workspace: ServerWorkspace) {
  const queryClient = useQueryClient();
  const utils = api.useUtils();

  useLayoutEffect(() => {
    const { queryKey } = utils.workspace.getBySlug.queryOptions({ slug });
    const state = queryClient.getQueryState(queryKey);
    // Data the client already holds, or a fetch already on the wire, wins.
    if (state?.data !== undefined || state?.fetchStatus === 'fetching') return;

    const settled = readSettled(workspace);
    if (settled) {
      if (settled.value) {
        utils.workspace.getBySlug.setData(
          { slug },
          SuperJSON.deserialize<WorkspaceBySlug>(settled.value),
        );
      }
      return;
    }

    // Still streaming: make the stream the in-flight fetch, so observers that
    // subscribe now share it instead of starting their own request.
    queryClient
      .fetchQuery({
        queryKey,
        queryFn: async () => {
          const serialized = await workspace.catch(() => null);
          return serialized
            ? SuperJSON.deserialize<WorkspaceBySlug>(serialized)
            : utils.client.workspace.getBySlug.query({ slug });
        },
      })
      // The query's own error state carries any failure to its observers.
      .catch(() => undefined);
  }, [queryClient, utils, slug, workspace]);
}
