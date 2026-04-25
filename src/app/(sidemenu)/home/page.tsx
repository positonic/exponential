import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import { CommandCenter } from "~/app/_components/home/CommandCenter";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    // Check if user has completed onboarding
    const userData = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingCompletedAt: true,
        welcomeCompletedAt: true,
      },
    });

    // Redirect to onboarding if not completed
    if (userData && !userData.onboardingCompletedAt) {
      redirect('/onboarding');
    }

    // Redirect new users (completed onboarding within 24h, haven't finished welcome) to welcome
    if (userData?.onboardingCompletedAt && !userData.welcomeCompletedAt) {
      const completedAt = new Date(userData.onboardingCompletedAt);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (completedAt > oneDayAgo) {
        redirect('/welcome');
      }
    }
  }

  return <CommandCenter />;
}