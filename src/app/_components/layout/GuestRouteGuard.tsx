'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspace } from '~/providers/WorkspaceProvider';

/**
 * Silent redirect for guests hitting workspace-wide routes that the
 * stripped-down nav doesn't expose (Home, Goals, OKRs, CRM, Calendar,
 * Meetings, Knowledge, Settings, etc.).
 *
 * - Blocks children from rendering while the role is unknown so no flash
 *   of restricted content reaches the DOM.
 * - Silently router.replaces a guest to /w/[slug]/projects.
 * - Full members (any non-guest role) see no regression.
 */
export function GuestRouteGuard({ children }: { children: React.ReactNode }) {
  const { workspaceSlug, userRole, isLoading } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();

  const isGuest = userRole === 'guest';
  const guestAllowedPrefix = workspaceSlug
    ? `/w/${workspaceSlug}/projects`
    : null;
  const isOnAllowedPath =
    guestAllowedPrefix !== null && pathname.startsWith(guestAllowedPrefix);
  const shouldRedirect = isGuest && guestAllowedPrefix !== null && !isOnAllowedPath;

  useEffect(() => {
    if (shouldRedirect && guestAllowedPrefix) {
      router.replace(guestAllowedPrefix);
    }
  }, [shouldRedirect, guestAllowedPrefix, router]);

  if (shouldRedirect) return null;
  if (isLoading && !userRole) return null;

  return <>{children}</>;
}
