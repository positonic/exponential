import SuperJSON from 'superjson';
import { api } from '~/trpc/server';
import { WorkspaceLayoutClient } from './WorkspaceLayoutClient';

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
    // No access or not found: the client's own fetch reports it.
    () => null,
  );

  return (
    <WorkspaceLayoutClient workspaceSlug={workspaceSlug} workspace={workspace}>
      {children}
    </WorkspaceLayoutClient>
  );
}
