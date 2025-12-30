import { type PropsWithChildren } from "react";
import dynamic from "next/dynamic";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { auth } from "~/server/auth";
import { ThemeWrapper } from "./ThemeWrapper";
import { type ValidDomain } from "~/config/themes";

// Dynamic imports to prevent build timeout - ManyChat has 1000+ lines with complex tRPC types
// that cause TypeScript to hang during lint/typecheck when statically imported in Server Components
const MobileBottomNav = dynamic(
  () => import("./MobileBottomNav").then((m) => ({ default: m.MobileBottomNav })),
  { ssr: false }
);

const AgentChatDrawer = dynamic(
  () => import("./AgentChatDrawer").then((m) => ({ default: m.AgentChatDrawer })),
  { ssr: false }
);

export default async function Layout({ children, domain, showSidebar = true }: PropsWithChildren<{ domain: ValidDomain, showSidebar?: boolean }>) {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-background-primary text-text-primary">
        <Header />
        <main className="pt-16">
          {children}
        </main>
      </div>
    );
  }

  return (
    <ThemeWrapper>
      {showSidebar && <Sidebar session={session} domain={domain} />}
      <main className="flex-1 p-4 lg:p-8 pb-20 sm:pb-4 lg:pb-8 w-full transition-all duration-200">
        {children}
      </main>
      <MobileBottomNav />
      <AgentChatDrawer />
    </ThemeWrapper>
  );
} 