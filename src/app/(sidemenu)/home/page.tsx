import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { redirect } from "next/navigation";
import { HomeContent } from "~/app/_components/HomeContent";

export default async function HomePage() {
  const session = await auth();
  const userName = session?.user?.name || 'there';

  // Get user data including onboarding info
  let userData = null;
  let isNewUser = false;
  let recentProject = null;

  if (session?.user?.id) {
    userData = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        onboardingCompletedAt: true,
        onboardingStep: true,
        usageType: true,
        userRole: true,
        selectedTools: true,
        projects: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            workspace: {
              select: {
                slug: true
              }
            }
          }
        }
      },
    });

    // Redirect to onboarding if not completed
    if (userData && !userData.onboardingCompletedAt) {
      redirect('/onboarding');
    }

    // Check if user completed onboarding recently (within last 24 hours)
    if (userData?.onboardingCompletedAt) {
      const completedAt = new Date(userData.onboardingCompletedAt);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      isNewUser = completedAt > oneDayAgo;
      recentProject = userData.projects[0] || null;
    }
  }

  return (
    <HomeContent
      userName={userName}
      isNewUser={isNewUser}
      userData={userData ? {
        usageType: userData.usageType,
        userRole: userData.userRole,
        selectedTools: userData.selectedTools,
      } : null}
      recentProject={recentProject}
    />
  );
}