import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "~/lib/brand";
import { SIGN_IN_SETUP_OPTIONS } from "~/server/auth/signInMethods";
import "~/styles/auth-surface.css";

/**
 * What `/signin` shows on an install with no way in: no OAuth provider, no
 * email transport and no log delivery. Without it the page would offer an
 * email form whose every submit fails.
 *
 * Server-rendered and public, so it names variables only, never values, and
 * reveals nothing beyond which names are unset.
 */
export function SignInSetupError() {
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
              <span>Setup needed</span>
            </div>

            <h1 className="auth-title">Sign-in isn&apos;t set up yet</h1>
            <p className="auth-sub">
              This install has no way to sign in: no OAuth provider, no email
              delivery and no log delivery is configured. Whoever runs it needs
              to set one of the following, then restart the app.
            </p>

            <div className="setup-error" role="alert">
              <ul className="setup-error__list">
                {SIGN_IN_SETUP_OPTIONS.map((option) => (
                  <li key={option.vars.join("+")} className="setup-error__item">
                    <span className="setup-error__vars">
                      {option.vars.map((name, index) => (
                        <span key={name}>
                          {index > 0 && " + "}
                          <code>{name}</code>
                        </span>
                      ))}
                    </span>
                    <span className="setup-error__note">{option.note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="auth-note">
              The self-host example environment file,{" "}
              <code>.env.selfhost.example</code>, describes each one.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
