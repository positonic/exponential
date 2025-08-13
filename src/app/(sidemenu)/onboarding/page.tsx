import OnBoardingComponent from "../../_components/OnboardingComponent"
import { auth } from '~/server/auth';

export default async function OnboardingPage() {
  const session = await auth();
  const userName = session?.user?.name || 'there';
  
  return (
    <OnBoardingComponent userName={userName} />
  )
}