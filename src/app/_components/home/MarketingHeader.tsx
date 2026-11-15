import Link from "next/link";
import type { Session } from "next-auth";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import MobileNav from "~/app/_components/layout/MobileNav";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";
import { FeaturesMenu } from "./FeaturesMenu";
import { ResourcesMenu } from "./ResourcesMenu";
import { CTAButton } from "./shared/CTAButton";

interface MarketingHeaderProps {
  /**
   * On the home page the section links are same-page anchors (`#pricing`).
   * Everywhere else they point back at the home page (`/#pricing`).
   */
  onHomePage?: boolean;
  /**
   * Pass the session on pages a signed-in person can reach (learn, blog):
   * they get one "Open app" pill in place of "Log in" and "Get started".
   * The home page redirects signed-in visitors, so it leaves this out.
   */
  session?: Session | null;
  /**
   * Adds the slide-in menu below the `lg` breakpoint, where the desktop
   * links are hidden. The learn and blog pages have always had one.
   */
  mobileNav?: boolean;
}

const NAV_LINK =
  "text-text-secondary hover:text-text-primary transition-colors text-sm font-medium";
const MOBILE_LINK =
  "text-text-secondary hover:text-text-primary transition-colors text-base font-medium py-2";

/**
 * The fixed header of the marketing surface, with the spacer that keeps the
 * page's first section clear of it. One copy for the home page and every
 * other public page, so they cannot drift apart again. Render it inside an
 * element with the `mkt` class: `--color-bg-nav` is declared there.
 */
export function MarketingHeader({
  onHomePage = false,
  session = null,
  mobileNav = false,
}: MarketingHeaderProps) {
  const theme = themes[getThemeDomain()];
  const anchor = (id: string) => (onHomePage ? `#${id}` : `/#${id}`);
  const isSignedIn = Boolean(session?.user);

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-border-primary"
        style={{ backgroundColor: "var(--color-bg-nav)" }}
      >
        <div className="mkt-container">
          <div className="flex justify-between items-center h-16">
            {/* The mobile menu's button is fixed in the top-left corner, so
                the logo steps aside for it below `lg`. */}
            <div className={`flex items-center ${mobileNav ? "pl-14 lg:pl-0" : ""}`}>
              <LogoDisplay theme={theme} href="/" className="text-xl" imageSize={36} />
            </div>

            {/* Desktop Navigation. Only the top-level links are kept on one
                line ("Self-host" breaks at its hyphen otherwise); putting
                nowrap on the nav itself would be inherited by the Product
                and Resources dropdowns and stop their descriptions wrapping. */}
            <nav className="hidden lg:flex items-center space-x-6 xl:space-x-8 [&>a]:whitespace-nowrap">
              <FeaturesMenu />
              <Link href={anchor("self-host")} className={NAV_LINK}>
                Self-host
              </Link>
              <Link href="/docs" className={NAV_LINK}>
                Docs
              </Link>
              <Link href={anchor("pricing")} className={NAV_LINK}>
                Pricing
              </Link>
              <ResourcesMenu />
            </nav>

            {mobileNav && (
              <MobileNav>
                <nav className="flex h-full flex-col space-y-4 bg-background-primary p-4">
                  <Link href={anchor("features")} className={MOBILE_LINK}>
                    Features
                  </Link>
                  <Link href={anchor("self-host")} className={MOBILE_LINK}>
                    Self-host
                  </Link>
                  <Link href="/docs" className={MOBILE_LINK}>
                    Docs
                  </Link>
                  <Link href={anchor("pricing")} className={MOBILE_LINK}>
                    Pricing
                  </Link>
                  <Link href="/learn" className={MOBILE_LINK}>
                    Learn
                  </Link>
                  <Link href="/blog" className={MOBILE_LINK}>
                    Blog
                  </Link>
                  {isSignedIn ? (
                    <Link href="/home" className={MOBILE_LINK}>
                      Open app
                    </Link>
                  ) : (
                    <>
                      <Link href="/signin" className={MOBILE_LINK}>
                        Log in
                      </Link>
                      <Link href="/signin" className={MOBILE_LINK}>
                        Get started
                      </Link>
                    </>
                  )}
                </nav>
              </MobileNav>
            )}

            <div className="flex items-center gap-4">
              {/* With the mobile menu the logo has already stepped aside for
                  its button, so on a phone the pill moves into the menu. A
                  wrapper does the hiding: `.mkt-btn` sets its own display. */}
              <span
                className={
                  mobileNav
                    ? "hidden items-center gap-4 sm:flex"
                    : "flex items-center gap-4"
                }
              >
                {isSignedIn ? (
                  <CTAButton href="/home" variant="pill">
                    Open app
                  </CTAButton>
                ) : (
                  <>
                    <Link
                      href="/signin"
                      className={`hidden sm:inline whitespace-nowrap ${NAV_LINK}`}
                    >
                      Log in
                    </Link>
                    <CTAButton href="/signin" variant="pill">
                      Get started
                    </CTAButton>
                  </>
                )}
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-16" />
    </>
  );
}
