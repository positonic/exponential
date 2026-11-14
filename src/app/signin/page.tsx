import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { resolveSignInMethods } from "~/server/auth/signInMethods";
import { db } from "~/server/db";
import { isSetupOpen } from "~/server/services/instance/instanceSettings";
import { PRODUCT_NAME } from "~/lib/brand";
import { SignInLandingPage } from "./SignInLandingPage";
import { SignInSetupError } from "./SignInSetupError";

export const metadata: Metadata = {
  title: `Sign In | ${PRODUCT_NAME}`,
  description: `Sign in to ${PRODUCT_NAME} with Google, Microsoft, Discord, or an emailed sign-in code.`,
  robots: { index: false, follow: false },
  alternates: {
    canonical: "/signin",
  },
};

export default async function SignIn() {
  const session = await auth();
  if (session?.user) {
    redirect("/home");
  }

  // A self-host install nobody has claimed yet: the first person in uses the
  // setup token (ADR-0081). Never true on exponential.im (admins, no token).
  if (await isSetupOpen(db)) {
    redirect("/setup");
  }

  const methods = resolveSignInMethods(process.env);

  // No OAuth provider, no email delivery and no log delivery: say what to set
  // instead of offering a form whose every submit fails.
  if (methods.missing.length > 0) {
    return <SignInSetupError />;
  }

  return (
    <SignInLandingPage
      options={{
        google: methods.google,
        microsoft: methods.microsoft,
        discord: methods.discord,
        email: methods.emailDelivery !== null,
      }}
    />
  );
}
