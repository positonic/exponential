import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";
import {
  HeroSection,
  ProofStrip,
  PillarsSection,
  FeatureTabsSection,
  AgentAccessSection,
  SelfHostSection,
  PricingSection,
  FinalCTASection,
  FooterSection,
  FeaturesMenu,
  ResourcesMenu,
  CTAButton,
} from "~/app/_components/home";
import {
  PRODUCT_NAME,
  PRODUCT_SEO_DESCRIPTION,
  PRODUCT_SEO_TITLE,
} from "~/lib/brand";

// The homepage's search-result title and description. Other (home) pages fall
// back to the layout's branding copy.
export const metadata: Metadata = {
  title: PRODUCT_SEO_TITLE,
  description: PRODUCT_SEO_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: PRODUCT_NAME,
    url: "/",
    title: PRODUCT_SEO_TITLE,
    description: PRODUCT_SEO_DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_SEO_TITLE,
    description: PRODUCT_SEO_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/home");
  }

  const domain = getThemeDomain();
  const theme = themes[domain];

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-border-primary" style={{ backgroundColor: 'var(--color-bg-nav)' }}>
        <div className="mkt-container">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <LogoDisplay theme={theme} href="/" className="text-xl" imageSize={36} />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-6 xl:space-x-8 whitespace-nowrap">
              <FeaturesMenu />
              <Link
                href="#self-host"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                Self-host
              </Link>
              <Link
                href="/docs"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                Docs
              </Link>
              <Link
                href="#pricing"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                Pricing
              </Link>
              <ResourcesMenu />
            </nav>

            <div className="flex items-center gap-4">
              <Link
                href="/signin"
                className="hidden sm:inline whitespace-nowrap text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
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

      <main>
        <HeroSection />

        {/* What a visitor can check for themselves: source, licence, and
            the public record of what we ship. */}
        <ProofStrip />

        {/* Keeps the "how-it-works" anchor other pages link to. */}
        <PillarsSection id="how-it-works" />

        {/* Goals and projects, agents, meetings and decisions, one tab
            each. Keeps the "features" anchor other pages link to. */}
        <FeatureTabsSection id="features" />

        {/* CLI, SDK and MCP */}
        <AgentAccessSection id="agents" />

        <SelfHostSection id="self-host" />

        <PricingSection id="pricing" />

        <FinalCTASection />
      </main>

      <FooterSection />
    </div>
  );
}
