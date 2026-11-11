import { notFound } from "next/navigation";
import { auth } from "~/server/auth";
import { UiGallery } from "./UiGallery";

/**
 * /dev/ui: every primitive in every variant, plus the shape tokens, on one
 * page. Three jobs:
 *
 * 1. The visual regression target. e2e/ui-gallery.spec.ts opens this page,
 *    asserts the computed radius of each token and variant, and attaches
 *    light and dark screenshots for review.
 * 2. What a session screenshots to see the primitives before using them,
 *    cheaper than Storybook and with the real app chrome and theme.
 * 3. The place a new variant is added alongside its siblings, so the review
 *    sees it next to the rest.
 *
 * Open in development; admins only in production.
 */
export const metadata = { title: "UI primitives" };

export default async function UiGalleryPage() {
  if (process.env.NODE_ENV === "production") {
    const session = await auth();
    if (!session?.user?.isAdmin) notFound();
  }
  return <UiGallery />;
}
