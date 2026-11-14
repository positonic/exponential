import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PRODUCT_NAME } from "~/lib/brand";
import { db } from "~/server/db";
import { isSetupOpen } from "~/server/services/instance/instanceSettings";
import { SetupForm } from "./SetupForm";
import "~/styles/auth-surface.css";

export const metadata: Metadata = {
  title: `Set up ${PRODUCT_NAME}`,
  description: `Claim this ${PRODUCT_NAME} install as its admin.`,
  robots: { index: false, follow: false },
};

/**
 * First-run claim of a self-host install (ADR-0081): an email address plus the
 * one-time **Setup token** `start:selfhost` printed in the boot log makes that
 * person the **Instance admin** and signs them in, with no email transport.
 *
 * A 404 unless the install is unclaimed — no instance admin and a live token —
 * so on exponential.im (admins, no token) the page does not exist.
 */
export default async function SetupPage() {
  // Per request: whether the install is claimed is database state, not build state.
  await connection();
  if (!(await isSetupOpen(db))) notFound();

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
          <span>{PRODUCT_NAME}</span>
        </Link>
      </header>

      <div className="auth-shell">
        <section className="auth-left">
          <div className="auth-left__inner">
            <div className="eyebrow">
              <span className="eyebrow__dot" aria-hidden="true" />
              <span>First-run setup</span>
            </div>

            <h1 className="auth-title">Claim this install</h1>
            <p className="auth-sub">
              Nobody runs this {PRODUCT_NAME} install yet. Enter your email
              address and the setup token from the server&apos;s boot log. You
              become its admin, and sign-up becomes invite-only: after you,
              people join by invitation.
            </p>

            <SetupForm />

            <p className="auth-note">
              The token is in the log of the process running{" "}
              <code>npm run start:selfhost</code>, on the line after{" "}
              <code>enter your email address with this setup token</code>. It
              works once. Restarting the app prints a new one and retires the
              old.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
