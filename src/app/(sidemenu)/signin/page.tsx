import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { PRODUCT_NAME } from "~/lib/brand";
import { SignInLandingPage } from "./SignInLandingPage";

export const metadata: Metadata = {
  title: `Sign In | ${PRODUCT_NAME}`,
  description: `Sign in to ${PRODUCT_NAME} with Google, Microsoft, Discord, or an email magic link.`,
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

  return <SignInLandingPage />;
}
