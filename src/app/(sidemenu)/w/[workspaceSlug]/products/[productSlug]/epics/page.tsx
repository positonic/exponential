import { redirect } from "next/navigation";

/**
 * Epics have detail pages but no index of their own — the list lives as the
 * Epics entity on the tickets board. Trimming an epic URL back to `/epics` is
 * an easy thing to do by hand, so send it somewhere real instead of 404ing.
 */
export default async function EpicsIndexPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; productSlug: string }>;
}) {
  const { workspaceSlug, productSlug } = await params;
  redirect(`/w/${workspaceSlug}/products/${productSlug}/tickets`);
}
