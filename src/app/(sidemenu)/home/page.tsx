import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import { CommandCenter } from "~/app/_components/home/CommandCenter";

export default async function HomePage() {
  const session = await auth();
  const userName = session?.user?.name ?? 'there';

  if (session?.user?.id) {
    // Check if user has completed onboarding
    const userData = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingCompletedAt: true,
      },
    });

    // Redirect to onboarding if not completed
    if (userData && !userData.onboardingCompletedAt) {
      redirect('/onboarding');
    }
  }

  return <CommandCenter userName={userName} />;
}