import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { isWorkspaceGuest } from "~/server/services/access";

interface WorkspaceRootPageProps {
  params: Promise<{ workspaceSlug: string }>;
}

export default async function WorkspaceRootPage({ params }: WorkspaceRootPageProps) {
  const { workspaceSlug } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=/w/${workspaceSlug}`);
  }

  const workspace = await db.workspace.findUnique({
    where: { slug: workspaceSlug },
    select: { id: true },
  });

  if (!workspace) {
    redirect("/");
  }

  // Guests (project-only members) land on the projects list — every other
  // workspace-wide route is hidden for them.
  const guest = await isWorkspaceGuest(db, session.user.id, workspace.id);
  if (guest) {
    redirect(`/w/${workspaceSlug}/projects`);
  }

  redirect(`/w/${workspaceSlug}/home`);
}
