"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { PRODUCT_NAME } from "~/lib/brand";
import "~/styles/auth-surface.css";

export function SignInLandingPage() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/home";

  const [email, setEmail] = useState("");
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const isBusy = pendingProvider !== null;

  const startSignIn = async (provider: string) => {
    setPendingProvider(provider);
    try {
      if (provider === "postmark") {
        if (!email) return;
        await signIn("postmark", { email, callbackUrl });
      } else {
        await signIn(provider, { callbackUrl });
      }
    } finally {
      setPendingProvider(null);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void startSignIn("postmark");
  };

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
            Need help? <a href="mailto:support@exponential.im">Contact support</a>
          </span>
        </div>
      </header>

      <div className="auth-shell">
        <section className="auth-left">
          <div className="auth-left__inner">
            <div className="eyebrow">
              <span className="eyebrow__dot" aria-hidden="true" />
              <span>Welcome to {PRODUCT_NAME}</span>
            </div>

            <h1 className="auth-title">
              Sign in to{" "}
              <span className="auth-title__brand">{PRODUCT_NAME}</span>
            </h1>
            <p className="auth-sub">
              Where humans and AI build together. Sign in with your work account
              to continue to your workspace — or create one from scratch.
            </p>

            <div className="providers">
              <button
                type="button"
                className="provider"
                onClick={() => void startSignIn("google")}
                disabled={isBusy}
              >
                <span className="provider__logo" aria-hidden="true">
                  <GoogleLogo />
                </span>
                <span className="provider__label">Sign in with Google</span>
                <ChevGlyph />
              </button>

              <button
                type="button"
                className="provider"
                onClick={() => void startSignIn("microsoft-entra-id")}
                disabled={isBusy}
              >
                <span className="provider__logo" aria-hidden="true">
                  <MicrosoftLogo />
                </span>
                <span className="provider__label">
                  Sign in with Microsoft
                </span>
                <ChevGlyph />
              </button>

              <button
                type="button"
                className="provider"
                onClick={() => void startSignIn("discord")}
                disabled={isBusy}
              >
                <span className="provider__logo" aria-hidden="true">
                  <DiscordLogo />
                </span>
                <span className="provider__label">Sign in with Discord</span>
                <ChevGlyph />
              </button>
            </div>

            <div className="or-div">
              <span className="or-div__line" />
              <span className="or-div__txt">or email a magic link</span>
              <span className="or-div__line" />
            </div>

            <form className="field" onSubmit={handleSubmit}>
              <label className="field__label" htmlFor="signin-email">
                Work email
              </label>
              <input
                id="signin-email"
                className="field__input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <button
                className="btn-primary"
                type="submit"
                disabled={isBusy || !email}
              >
                <span>Send me a magic link</span>
                <ArrowRightGlyph />
              </button>
            </form>

            <p className="terms">
              By continuing, you agree to our{" "}
              <a href="/terms">Terms of Service</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>

            <div className="support">
              <div className="support__icon" aria-hidden="true">
                <ChatGlyph />
              </div>
              <div>
                Trouble signing in? Email{" "}
                <a href="mailto:support@exponential.im">
                  support@exponential.im
                </a>{" "}
                and we&apos;ll sort it out.
              </div>
            </div>
          </div>
        </section>

        <aside className="auth-right">
          <div className="auth-right__inner">
            <div className="marketing-eyebrow">
              <span className="marketing-eyebrow__line" />
              <span>Inside {PRODUCT_NAME}</span>
            </div>

            <h2 className="marketing-head">
              A live look at what teams are{" "}
              <em>shipping this week</em>.
            </h2>

            <p className="marketing-sub">
              Rituals, projects, OKRs and meetings — woven into a single home
              the team already uses every day. Sign in to see the real thing.
            </p>

            <div className="snap" aria-hidden="true">
              <div className="snap__bar">
                <div className="snap__dot" />
                <div className="snap__dot" />
                <div className="snap__dot" />
                <div className="snap__crumb">
                  your-workspace / <b>today</b>
                </div>
              </div>
              <div className="snap__body">
                <div className="snap-greeting">Your workspace · Week 17</div>
                <h3 className="snap-title">
                  Shipping this week.{" "}
                  <em>3 rituals, 2 launches.</em>
                </h3>

                <div className="snap-metrics">
                  <div className="snap-metric">
                    <div className="snap-metric__label">
                      <span
                        className="snap-metric__dot"
                        style={{ background: "var(--brand-400)" }}
                      />
                      Focus
                    </div>
                    <div className="snap-metric__value">2h 40m</div>
                    <div className="snap-metric__meta">Protected block</div>
                  </div>
                  <div className="snap-metric">
                    <div className="snap-metric__label">
                      <span
                        className="snap-metric__dot"
                        style={{ background: "var(--accent-okr)" }}
                      />
                      OKR
                    </div>
                    <div className="snap-metric__value">68%</div>
                    <div className="snap-metric__meta">On track · Q2</div>
                  </div>
                  <div className="snap-metric">
                    <div className="snap-metric__label">
                      <span
                        className="snap-metric__dot"
                        style={{ background: "var(--accent-meetings)" }}
                      />
                      Meetings
                    </div>
                    <div className="snap-metric__value">3</div>
                    <div className="snap-metric__meta">1 async draft</div>
                  </div>
                </div>

                <div className="snap-list">
                  <div className="snap-row done">
                    <span className="snap-check done" />
                    <span className="snap-row__label">
                      Review KR-2 movement from last week
                    </span>
                    <span className="snap-row__tag">ritual</span>
                  </div>
                  <div className="snap-row">
                    <span className="snap-check" />
                    <span className="snap-row__label">
                      Ship onboarding redesign to staging
                    </span>
                    <span className="snap-row__tag">#orbit</span>
                  </div>
                  <div className="snap-row">
                    <span className="snap-check" />
                    <span className="snap-row__label">
                      1:1 with the team · draft talking points
                    </span>
                    <span className="snap-row__tag">14:00</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="feats">
              <Feat
                title="Weekly rituals"
                sub="Planning, review and retro baked into your calendar — not another Notion doc."
                icon={<ClockGlyph />}
              />
              <Feat
                title="Living OKRs"
                sub="Key results that update themselves from the work you're already doing."
                icon={<TrendGlyph />}
              />
              <Feat
                title="Project orbits"
                sub="Every task, note and decision in a single, searchable timeline."
                icon={<ListGlyph />}
              />
              <Feat
                title="Zoe, your copilot"
                sub="Drafts your plan, reviews your week, and answers across every doc."
                icon={<StarGlyph />}
              />
            </div>

            <div className="marketing-foot">
              <div className="marketing-foot__group">
                <CheckGlyph />
                <span>SOC 2 · SAML SSO</span>
              </div>
              <div
                className="marketing-foot__group"
                style={{ marginLeft: "auto" }}
              >
                <span>
                  Where humans and AI{" "}
                  <b>build together</b>
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ==========================================================================
 * Helpers + inline SVG glyphs
 * (Google / Microsoft / Discord logos read brand colors from CSS variables
 * declared under .auth-surface in globals.css — no hex in this file.)
 * ========================================================================== */

function Feat({
  title,
  sub,
  icon,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="feat">
      <div className="feat__mark">{icon}</div>
      <div className="feat__body">
        <div className="feat__title">{title}</div>
        <div className="feat__sub">{sub}</div>
      </div>
    </div>
  );
}

function ChevGlyph() {
  return (
    <svg
      className="provider__chev"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function ArrowRightGlyph() {
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
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
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

function CheckGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent-crm)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 7L9 18l-5-5" />
    </svg>
  );
}

function ClockGlyph() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function TrendGlyph() {
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
      <path d="M3 12l4-4 4 4 6-6 4 4" />
      <path d="M3 20h18" />
    </svg>
  );
}

function ListGlyph() {
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
      <path d="M4 7h16M4 12h10M4 17h16" />
    </svg>
  );
}

function StarGlyph() {
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
      <path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.8 6.5 19.5l1-6.3L3 8.9 9 8z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.61z"
        fill="var(--google-blue)"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z"
        fill="var(--google-green)"
      />
      <path
        d="M3.96 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.34z"
        fill="var(--google-yellow)"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l3 2.33C4.67 5.17 6.66 3.58 9 3.58z"
        fill="var(--google-red)"
      />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="0" y="0" width="7" height="7" fill="var(--microsoft-red)" />
      <rect x="9" y="0" width="7" height="7" fill="var(--microsoft-green)" />
      <rect x="0" y="9" width="7" height="7" fill="var(--microsoft-blue)" />
      <rect x="9" y="9" width="7" height="7" fill="var(--microsoft-yellow)" />
    </svg>
  );
}

function DiscordLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="var(--brand-400)"
      aria-hidden="true"
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}
