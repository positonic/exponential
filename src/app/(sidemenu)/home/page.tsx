import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import { CommandCenter } from "~/app/_components/home/CommandCenter";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    // Check if user has completed onboarding and has a default workspace
    const userData = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingCompletedAt: true,
        defaultWorkspaceId: true,
      },
    });

    // Redirect to onboarding if not completed
    if (userData && !userData.onboardingCompletedAt) {
      redirect('/onboarding');
    }

    // Ensure user has a workspace (for existing users without one)
    if (userData && !userData.defaultWorkspaceId) {
      // Check if they have any workspace
      const existingWorkspace = await db.workspace.findFirst({
        where: {
          members: { some: { userId: session.user.id } }
        },
        orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      });

      if (!existingWorkspace) {
        // Create personal workspace for existing users
        try {
          const slug = `personal-${session.user.id}`;
          const workspace = await db.workspace.create({
            data: {
              name: "Personal",
              slug,
              type: "personal",
              ownerId: session.user.id,
              members: {
                create: {
                  userId: session.user.id,
                  role: "owner",
                },
              },
            },
          });

          await db.user.update({
            where: { id: session.user.id },
            data: { defaultWorkspaceId: workspace.id },
          });
        } catch (error) {
          console.error("[HomePage] Failed to create personal workspace:", error);
        }
      } else {
        // Set existing workspace as default
        await db.user.update({
          where: { id: session.user.id },
          data: { defaultWorkspaceId: existingWorkspace.id },
        });
      }
    }
  }

  return <CommandCenter />;
}