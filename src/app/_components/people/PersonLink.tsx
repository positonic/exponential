import Link from 'next/link';
import type { ReactNode } from 'react';
import { personHref } from '~/lib/personHref';

interface PersonLinkProps {
  userId: string;
  children: ReactNode;
  className?: string;
}

/**
 * A member's name (or avatar) as a link to their Person page. Inherits the
 * surrounding text style and only underlines on hover, so a member list still
 * reads as a list rather than a column of links.
 */
export function PersonLink({ userId, children, className }: PersonLinkProps) {
  return (
    <Link
      href={personHref(userId)}
      data-testid="person-link"
      className={`text-inherit no-underline hover:underline${className ? ` ${className}` : ''}`}
    >
      {children}
    </Link>
  );
}
