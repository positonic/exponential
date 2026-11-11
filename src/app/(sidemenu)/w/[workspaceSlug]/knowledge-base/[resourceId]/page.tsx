'use client';

import { useParams } from 'next/navigation';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { ResourceReader } from '~/app/_components/knowledge-base/ResourceReader';

export default function WorkspaceResourceReaderPage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const { workspaceSlug } = useWorkspace();

  return <ResourceReader resourceId={resourceId} workspaceSlug={workspaceSlug} />;
}
