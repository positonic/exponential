import { redirect } from "next/navigation";
import { api } from "~/trpc/server";

export default async function WeeklyReviewSettingsRedirectPage() {
  // Get user's workspaces and redirect to the first one
  const workspaces = await api.workspace.list();
  const defaultWorkspace = workspaces[0];

  if (defaultWorkspace) {
    redirect(`/w/${defaultWorkspace.slug}/weekly-team-checkin/settings`);
  }

  // Fallback to home if no workspaces
  redirect("/");
}
