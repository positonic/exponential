import Link from "next/link";
import { auth } from "~/server/auth";
import { HeaderAuthButtons } from "~/app/_components/HeaderAuthButtons";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";
import {
  HeroSection,
  ProblemStatementSection,
  SolutionIntroSection,
  ProductDemoSection,
  HowItWorksSection,
  KeyFeaturesSection,
  PersonaSection,
  TestimonialsSection,
  PricingSection,
  FinalCTASection,
  FooterSection,
  FeaturesMenu,
  ResourcesMenu,
} from "~/app/_components/home";

export default async function Home() {
  const session = await auth();
  const domain = getThemeDomain();
  const theme = themes[domain];

  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background-primary/80 backdrop-blur-md border-b border-border-primary">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <LogoDisplay theme={theme} href="/" className="text-xl" />
            </div>

            <nav className="hidden md:flex items-center space-x-8">
              <FeaturesMenu />
              <Link
                href="#how-it-works"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                How It Works
              </Link>
              <Link
                href="#pricing"
                className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
              >
                Pricing
              </Link>
              <ResourcesMenu />
            </nav>

            <div className="flex items-center gap-3">
              <HeaderAuthButtons session={session} />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-16" />

      <main>
        {/* Section 1: Hero */}
        <HeroSection />

        {/* Section 2: Problem Statement */}
        <ProblemStatementSection />

        {/* Section 3: Solution Introduction */}
        <SolutionIntroSection />

        {/* Section 4: Product Demo */}
        <ProductDemoSection id="demo" />

        {/* Section 5: How It Works */}
        <HowItWorksSection id="how-it-works" />

        {/* Section 6: Key Features */}
        <KeyFeaturesSection id="features" />

        {/* Section 7: Who It's For */}
        <PersonaSection id="personas" />

        {/* Section 8: Testimonials */}
        <TestimonialsSection id="testimonials" />

        {/* Section 9: Pricing */}
        <PricingSection id="pricing" />

        {/* Section 10: Final CTA */}
        <FinalCTASection />
      </main>

      {/* Section 11: Footer */}
      <FooterSection />
    </div>
  );
}
