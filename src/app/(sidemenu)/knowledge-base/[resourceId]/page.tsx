'use client';

import { useParams } from 'next/navigation';
import { ResourceReader } from '~/app/_components/knowledge-base/ResourceReader';

export default function ResourceReaderPage() {
  const { resourceId } = useParams<{ resourceId: string }>();

  return <ResourceReader resourceId={resourceId} />;
}
