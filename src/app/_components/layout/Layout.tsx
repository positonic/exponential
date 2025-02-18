import { type PropsWithChildren } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import Header from "./Header";
import { auth } from "~/server/auth";

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
    <div className="min-h-screen bg-[#1E1E1E] text-white">
      {/* MobileNav is a client component */}
      <MobileNav>
        <Sidebar />
      </MobileNav>

      <div className="flex">
        {/* Desktop Sidebar - server rendered */}
        <div className="hidden lg:block flex-shrink-0">
          <Sidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-8 w-full">
          {children}
        </main>
      </div>
    </div>
  );
} 