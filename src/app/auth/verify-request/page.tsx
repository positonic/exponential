import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "~/lib/brand";
import { SIGN_IN_CODE_TTL_MINUTES } from "~/lib/signInCode";
import { AuthMarketingPanel } from "~/app/_components/auth/AuthMarketingPanel";
import { SignInCodeForm } from "./SignInCodeForm";
import "~/styles/auth-surface.css";

export const metadata: Metadata = {
  title: `Check your email | ${PRODUCT_NAME}`,
  description: `Enter the sign-in code we emailed you to continue to ${PRODUCT_NAME}.`,
  robots: { index: false, follow: false },
};

/**
 * Where /signin (and the invite page) land after emailing a **Sign-in code**
 * (ADR-0056). Same `.auth-surface` chrome as /signin — only the left column's
 * content differs: enter-the-code instead of pick-a-provider.
 */
export default function VerifyRequest() {
  const supportEmail =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@exponential.im";

  return (
    <div className="auth-surface">
      <header className="auth-header">
        <Link href="/" className="auth-header__brand">
          <Image
            src="/expo-logo-20.png"
            alt={`${PRODUCT_NAME} logo`}
            width={22}
            height={22}
            priority
          />
          <span>{PRODUCT_NAME}.im</span>
        </Link>
        <div className="auth-header__right">
          <span className="auth-header__hint">
            Need help? <a href={`mailto:${supportEmail}`}>Contact support</a>
          </span>
        </div>
      </header>

      <div className="auth-shell">
        <section className="auth-left">
          <div className="auth-left__inner">
            <div className="eyebrow">
              <span className="eyebrow__dot" aria-hidden="true" />
              <span>Sign-in code sent</span>
            </div>

            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub">
              We&apos;ve sent a sign-in code to your email address.
            </p>

            <SignInCodeForm />

            <p className="auth-note">
              The code expires in <b>{SIGN_IN_CODE_TTL_MINUTES} minutes</b>.
            </p>
            <p className="auth-note">
              If you don&apos;t see the email, check your spam folder.
            </p>

            <Link href="/signin" className="auth-back">
              <ArrowLeftGlyph />
              <span>Back to sign in</span>
            </Link>

            <div className="support">
              <div className="support__icon" aria-hidden="true">
                <ChatGlyph />
              </div>
              <div>
                Trouble signing in? Email{" "}
                <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and
                we&apos;ll sort it out.
              </div>
            </div>
          </div>
        </section>

        <AuthMarketingPanel />
      </div>
    </div>
  );
}

/* ==========================================================================
 * Inline SVG glyphs (stroke via currentColor — no hex in this file)
 * ========================================================================== */

function ArrowLeftGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="M11 19l-7-7 7-7" />
    </svg>
  );
}

function ChatGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
