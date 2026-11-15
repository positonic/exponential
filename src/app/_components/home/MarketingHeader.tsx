import Link from "next/link";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
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
}

const NAV_LINK =
  "text-text-secondary hover:text-text-primary transition-colors text-sm font-medium";

/**
 * The fixed header of the marketing surface, with the spacer that keeps the
 * page's first section clear of it. One copy for the home page and every
 * other public page, so they cannot drift apart again. Render it inside an
 * element with the `mkt` class: `--color-bg-nav` is declared there.
 */
export function MarketingHeader({ onHomePage = false }: MarketingHeaderProps) {
  const theme = themes[getThemeDomain()];
  const anchor = (id: string) => (onHomePage ? `#${id}` : `/#${id}`);

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-border-primary"
        style={{ backgroundColor: "var(--color-bg-nav)" }}
      >
        <div className="mkt-container">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
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

            <div className="flex items-center gap-4">
              <Link
                href="/signin"
                className={`hidden sm:inline whitespace-nowrap ${NAV_LINK}`}
              >
                Log in
              </Link>
              <CTAButton href="/signin" variant="pill">
                Get started
              </CTAButton>
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
