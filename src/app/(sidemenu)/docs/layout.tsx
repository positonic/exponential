import type { ReactNode } from "react";

interface DocsLayoutProps {
  children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <div className="-m-4 lg:-m-8 flex min-h-screen">
      {children}
    </div>
  );
}
