import { type PropsWithChildren } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { auth } from "~/server/auth";
import { ThemeWrapper } from "./ThemeWrapper";
import { type ValidDomain, themes } from "~/config/themes";

export default async function Layout({ children, domain }: PropsWithChildren<{ domain: ValidDomain }>) {
  const session = await auth();
  console.log('domain h is ', domain);
  if (!session?.user) {
    return (
      <div className="min-h-screen bg-[#262626] text-white">
        <Header title={themes[domain].logo + ' ' + themes[domain].name} />
        <main className="pt-16">
          {children}
        </main>
      </div>
    );
  }

  return (
    <ThemeWrapper>
      <Sidebar session={session} domain={domain} />
      <main className="flex-1 p-4 lg:p-8 w-full transition-all duration-200">
        {children}
      </main>
    </ThemeWrapper>
  );
} 