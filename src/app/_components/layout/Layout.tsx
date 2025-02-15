import { type PropsWithChildren } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
} 