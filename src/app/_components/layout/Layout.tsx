import { type PropsWithChildren } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { auth } from "~/server/auth";
import { ThemeWrapper } from "./ThemeWrapper";

export default async function Layout({ children }: PropsWithChildren) {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="min-h-screen bg-[#262626] text-white">
        <Header />
        <main className="pt-16">
          {children}
        </main>
      </div>
    );
  }

  return (
    <ThemeWrapper>
      <Sidebar session={session} />
      <main className="flex-1 p-4 lg:p-8 w-full transition-all duration-200">
        {children}
      </main>
    </ThemeWrapper>
  );
} 