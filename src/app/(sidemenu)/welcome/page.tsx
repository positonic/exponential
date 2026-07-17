import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import { GettingStarted } from "~/app/_components/welcome/GettingStarted";

/**
 * Post-signup "Getting started" page. The assistant is embedded in the page
 * (Chat + Checklist views) — it must never auto-open as an overlay.
 */
export default async function WelcomePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userData = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      onboardingCompletedAt: true,
      welcomeCompletedAt: true,
    },
  });

  // Redirect to onboarding if not completed
  if (userData && !userData.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  // If welcome is already completed, go to home
  if (userData?.welcomeCompletedAt) {
    redirect("/home");
  }

  return <GettingStarted />;
}
