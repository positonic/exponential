import Link from "next/link";
import { auth } from "~/server/auth";
import { HeaderAuthButtons } from "~/app/_components/HeaderAuthButtons";
import { LogoDisplay } from "~/app/_components/layout/LogoDisplay";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { themes } from "~/config/themes";
import { getThemeDomain } from "~/config/site";
import {
  FeaturesMenu,
  ResourcesMenu,
  FooterSection,
} from "~/app/_components/home";
import MobileNav from "~/app/_components/layout/MobileNav";

export default async function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const domain = getThemeDomain();
  const theme = themes[domain];

  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
      {/* Navigation */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b border-border-primary"
        style={{ backgroundColor: "rgba(12, 16, 34, 0.95)" }}
      >
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center [&_span]:!text-white">
              <LogoDisplay theme={theme} href="/" className="text-xl" />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <FeaturesMenu />
              <Link
                href="/#how-it-works"
                className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
              >
                How It Works
              </Link>
              <Link
                href="/#pricing"
                className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
              >
                Pricing
              </Link>
              <ResourcesMenu />
            </nav>

            {/* Mobile Navigation */}
            <MobileNav>
              <nav className="flex flex-col p-4 space-y-4 bg-background-primary h-full">
                <Link
                  href="/#features"
                  className="text-text-secondary hover:text-text-primary transition-colors text-base font-medium py-2"
                >
                  Features
                </Link>
                <Link
                  href="/#how-it-works"
                  className="text-text-secondary hover:text-text-primary transition-colors text-base font-medium py-2"
                >
                  How It Works
                </Link>
                <Link
                  href="/#pricing"
                  className="text-text-secondary hover:text-text-primary transition-colors text-base font-medium py-2"
                >
                  Pricing
                </Link>
                <Link
                  href="/learn"
                  className="text-text-secondary hover:text-text-primary transition-colors text-base font-medium py-2"
                >
                  Learn
                </Link>
                <Link
                  href="/blog"
                  className="text-text-secondary hover:text-text-primary transition-colors text-base font-medium py-2"
                >
                  Blog
                </Link>
                <Link
                  href="/signin"
                  className="text-brand-primary hover:text-brand-primary/80 transition-colors text-base font-medium py-2"
                >
                  Sign In
                </Link>
              </nav>
            </MobileNav>

            <div className="flex items-center gap-3">
              <HeaderAuthButtons session={session} />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div className="h-20" />

      <main>{children}</main>

      <FooterSection />
    </div>
  );
}
