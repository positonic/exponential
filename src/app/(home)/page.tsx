import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { HeaderAuthButtons } from "~/app/_components/HeaderAuthButtons";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";
import {
  HeroSection,
  FactsSection,
  ProductPillarsSection,
  AgentAccessSection,
  SelfHostSection,
  MethodSection,
  PricingSection,
  FinalCTASection,
  FooterSection,
  FeaturesMenu,
  ResourcesMenu,
} from "~/app/_components/home";
import {
  PRODUCT_NAME,
  PRODUCT_SEO_DESCRIPTION,
  PRODUCT_SEO_TITLE,
  SOCIAL_PROFILES,
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
    <div className="min-h-screen bg-background-primary text-text-primary">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-border-primary" style={{ backgroundColor: 'var(--color-bg-nav)' }}>
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center [&_span]:!text-white">
              <LogoDisplay theme={theme} href="/" className="text-xl" />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-5 xl:space-x-8">
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
              <Link
                href={SOCIAL_PROFILES.github}
                className="hidden xl:inline text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                GitHub
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              {!session && (
                <Link
                  href="/signin"
                  className="hidden xl:inline text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
                >
                  Sign in
                </Link>
              )}
              <HeaderAuthButtons session={session} />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-20" />

      <main>
        {/* Hero, with the product in the first screen */}
        <HeroSection />

        {/* Verifiable facts, each linked to what backs it */}
        <FactsSection />

        {/* Goal to action, agents as members, meetings and decisions.
            Keeps the "features" anchor other pages link to. */}
        <ProductPillarsSection id="features" />

        {/* CLI, SDK and MCP */}
        <AgentAccessSection id="agents" />

        <SelfHostSection id="self-host" />

        {/* The method, who it is for, and our own use. Keeps the
            "how-it-works" anchor other pages link to. */}
        <MethodSection id="how-it-works" />

        <PricingSection id="pricing" />

        <FinalCTASection />
      </main>

      <FooterSection />
    </div>
  );
}
