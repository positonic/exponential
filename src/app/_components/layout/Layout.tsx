import { type PropsWithChildren } from "react";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[#1E1E1E] text-white">
      {/* MobileNav is a client component */}
      <MobileNav>
        <Sidebar />
      </MobileNav>

      <div className="flex">
        {/* Desktop Sidebar - server rendered */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 p-4 lg:p-8 w-full lg:ml-64">
          {children}
        </main>
      </div>
    </div>
  );
} 