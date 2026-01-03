import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { ProjectSetupWizard } from "~/app/_components/ProjectSetupWizard";

export default async function ProjectSetupPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/signin");
  }

  const userData = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      onboardingCompletedAt: true,
      projectSetupCompletedAt: true,
    },
  });

  // Redirect to onboarding if not completed
  if (!userData?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  // Redirect to home if project setup already completed
  if (userData?.projectSetupCompletedAt) {
    redirect("/home");
  }

  return <ProjectSetupWizard />;
}
