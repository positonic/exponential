'use client';

import { WorkspaceProvider } from '~/providers/WorkspaceProvider';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      {children}
    </WorkspaceProvider>
  );
}
