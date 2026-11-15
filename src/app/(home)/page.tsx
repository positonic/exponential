import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
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
  MarketingHeader,
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

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <MarketingHeader onHomePage />

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
