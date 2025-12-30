import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { AdminSidebar } from "~/app/_components/admin/AdminSidebar";

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await auth();

  // Redirect if not authenticated
  if (!session?.user) {
    redirect("/signin?callbackUrl=/admin");
  }

  // Redirect if not admin
  if (!session.user.isAdmin) {
    redirect("/home");
  }

  return (
    <div className="-m-4 flex min-h-screen lg:-m-8">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
