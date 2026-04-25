import type { ReactNode } from "react";
import { auth } from "~/server/auth";

interface DocsLayoutProps {
  children: ReactNode;
}

export default async function DocsLayout({ children }: DocsLayoutProps) {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className={`flex ${isLoggedIn ? "-m-4 lg:-m-8 min-h-screen" : "min-h-[calc(100vh-4rem)]"}`}>
      {children}
    </div>
  );
}
