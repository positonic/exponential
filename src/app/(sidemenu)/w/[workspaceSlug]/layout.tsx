import { TRPCError } from '@trpc/server';
import SuperJSON from 'superjson';
import { reportHandledErrorServer } from '~/server/utils/reportHandledErrorServer';
import { api } from '~/trpc/server';
import { WorkspaceLayoutClient } from './WorkspaceLayoutClient';

/** Errors a signed-in user can routinely hit here; the client's fetch surfaces them. */
const ACCESS_ERROR_CODES = new Set<TRPCError['code']>([
  'FORBIDDEN',
  'NOT_FOUND',
  'UNAUTHORIZED',
]);

/**
 * Server shell for every workspace page. Starts the `workspace.getBySlug`
 * read here so it streams with the RSC payload, and the client layout seeds
 * the query cache from it (see useSeedWorkspaceQuery).
 *
 * Never await the read: that would hold every hard load and cross-workspace
 * navigation for a database round trip.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  const workspace = api.workspace.getBySlug({ slug: workspaceSlug }).then(
    (data) => SuperJSON.serialize(data),
    (error: unknown) => {
      // Resolve to null either way: the client then fetches the workspace
      // itself, which surfaces the error and drives the access redirect.
      if (!(error instanceof TRPCError && ACCESS_ERROR_CODES.has(error.code))) {
        reportHandledErrorServer(error, {
          area: 'workspace-layout.getBySlug',
          context: { workspaceSlug },
        });
      }
      return null;
    },
  );

  return (
    <WorkspaceLayoutClient workspaceSlug={workspaceSlug} workspace={workspace}>
      {children}
    </WorkspaceLayoutClient>
  );
}
