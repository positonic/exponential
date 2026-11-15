'use client';

import { useParams } from 'next/navigation';
import { PersonPage } from '~/app/_components/people/PersonPage';

/**
 * `/people/<userId>` or `/people/<handle>` — the Person page: what one person,
 * human or agent, has done across the workspaces the viewer belongs to. Not
 * workspace-scoped, so it sits beside `/activity` rather than under
 * `/w/[workspaceSlug]`. The segment is named `userId` because an id always
 * works; a person who picked a handle is reached by either.
 */
export default function PersonRoutePage() {
  const { userId } = useParams<{ userId: string }>();
  return (
    <div className="flex h-full flex-col text-text-primary">
      <PersonPage personRef={userId} />
    </div>
  );
}
