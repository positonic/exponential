import { redirect, notFound } from "next/navigation";
import { db } from "~/server/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RedirectRecordingPage({ params }: PageProps) {
  const { id } = await params;

  const session = await db.transcriptionSession.findUnique({
    where: { id },
    select: {
      projectId: true,
      workspaceId: true,
      project: {
        select: {
          id: true,
          slug: true,
          workspaceId: true,
          workspace: {
            select: { slug: true },
          },
        },
      },
      workspace: {
        select: { slug: true },
      },
    },
  });

  if (!session) {
    notFound();
  }

  // Resolve workspace slug and project slug
  const workspaceSlug =
    session.project?.workspace?.slug ?? session.workspace?.slug;
  const projectSlug = session.project
    ? `${session.project.slug}-${session.project.id}`
    : null;

  if (workspaceSlug && projectSlug) {
    redirect(`/w/${workspaceSlug}/projects/${projectSlug}?tab=transcriptions`);
  }

  // Fallback: if we have a workspace but no project, go to workspace home
  if (workspaceSlug) {
    redirect(`/w/${workspaceSlug}`);
  }

  // Last resort: go to recordings page
  redirect("/recordings");
}
