import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { resolveSignInMethods } from "~/server/auth/signInMethods";
import { PRODUCT_NAME } from "~/lib/brand";
import { SignInLandingPage } from "./SignInLandingPage";

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

  const methods = resolveSignInMethods(process.env);

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
