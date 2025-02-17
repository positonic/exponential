import { type PropsWithChildren } from "react";
import Sidebar from "./Sidebar";

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[#1E1E1E] text-white">
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
} 