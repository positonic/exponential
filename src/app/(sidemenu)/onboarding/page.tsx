import { redirect } from "next/navigation";

// The onboarding wizard is retired; /welcome is the sole new-user flow.
// This stub survives one release for old emails/bookmarks, then disappears.
export default function OnboardingPage() {
  redirect("/welcome");
}
