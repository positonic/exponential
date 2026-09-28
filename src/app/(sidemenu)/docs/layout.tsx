import type { ReactNode } from "react";
import { auth } from "~/server/auth";
import { getDocsNavigation, getDocsSearchIndex } from "~/lib/docs/getDoc";
import { DocsMobileBar, DocsNavProvider, DocsSearch, DocsSidebar } from "~/app/_components/docs";

interface DocsLayoutProps {
  children: ReactNode;
}

export default async function DocsLayout({ children }: DocsLayoutProps) {
  const session = await auth();
  const isLoggedIn = !!session?.user;
  const nav = getDocsNavigation();
  const searchIndex = getDocsSearchIndex();

  return (
    <DocsNavProvider nav={nav} searchIndex={searchIndex}>
      <div className={`flex flex-col lg:flex-row ${isLoggedIn ? "-m-4 min-h-screen lg:-m-8" : "min-h-[calc(100vh-4rem)]"}`}>
        <DocsSidebar />
        <DocsMobileBar />
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
      <DocsSearch />
    </DocsNavProvider>
  );
}
