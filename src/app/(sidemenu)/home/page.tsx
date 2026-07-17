import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import { CommandCenter } from "~/app/_components/home/CommandCenter";
import { resolveNewUserRedirect } from "~/server/services/welcome/resolveNewUserRedirect";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    const userData = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        welcomeCompletedAt: true,
        // User has no createdAt column; the earliest owned workspace (the
        // auto-created Personal one) stands in for account creation time.
        ownedWorkspaces: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    if (userData) {
      const destination = resolveNewUserRedirect({
        createdAt: userData.ownedWorkspaces[0]?.createdAt ?? null,
        welcomeCompletedAt: userData.welcomeCompletedAt,
      });
      if (destination) {
        redirect(destination);
      }
    }
  }

  return <CommandCenter />;
}
