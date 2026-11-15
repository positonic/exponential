import type { Metadata } from "next";
import Link from "next/link";
import { integrations, type IntegrationKind } from "./_data/integrations";
import { CTAButton } from "~/app/_components/home/shared/CTAButton";
import { FooterSection, MarketingHeader } from "~/app/_components/home";
import { Panel } from "~/app/_components/ui";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

const title = `Integrations: Claude, Cursor, Codex, CLI and SDK | ${PRODUCT_NAME}`;
const description =
  "Connect Exponential to Claude, Cursor and Codex through the open-source MCP server, or build on it with the CLI and the TypeScript SDK.";

export function generateMetadata(): Metadata {
  const url = `${getPublicBaseUrlFromEnv()}/features/integrations`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: PRODUCT_NAME,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

const groups: { kind: IntegrationKind; heading: string; intro: string }[] = [
  {
    kind: "assistant",
    heading: "AI assistants",
    intro:
      "Through the open-source MCP server, each signing in with its own agent key.",
  },
  {
    kind: "developer",
    heading: "Developer tools",
    intro: "For your terminal, your scripts and the agents you build.",
  },
];

export default function IntegrationsIndexPage() {
  const baseUrl = getPublicBaseUrlFromEnv();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: integrations.map((integration, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `${integration.name} integration`,
      url: `${baseUrl}/features/integrations/${integration.slug}`,
    })),
  };

  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <MarketingHeader />

      <main>
        <section className="pb-12 md:pb-16">
          <div className="mkt-container pt-16 md:pt-24">
            <div className="max-w-3xl">
              <p className="mkt-eyebrow mkt-rise mb-6">Integrations</p>
              <h1 className="mkt-h1 mkt-rise mb-6">
                Your workspace, wherever you and your agents work.
              </h1>
              <p className="mkt-lead mkt-rise">
                Bring actions, tickets, decisions and OKRs into the AI tools you
                already use, or build on them yourself. Everything here is open
                source.
              </p>
            </div>
          </div>
        </section>

        {groups.map((group) => (
          <section
            key={group.kind}
            className="mkt-section border-t border-border-primary"
          >
            <div className="mkt-container mkt-reveal">
              <div className="mb-10 max-w-3xl">
                <h2 className="mkt-h2 mb-4">{group.heading}</h2>
                <p className="mkt-body">{group.intro}</p>
              </div>
              <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {integrations
                  .filter((integration) => integration.kind === group.kind)
                  .map((integration) => (
                    <li key={integration.slug}>
                      <Link
                        href={`/features/integrations/${integration.slug}`}
                        className="group block h-full"
                      >
                        <Panel
                          radius="xl"
                          padding="none"
                          className="h-full p-7 transition-colors group-hover:border-border-strong"
                        >
                          <h3 className="mkt-h3 mb-2">
                            <span aria-hidden="true" className="mr-2">
                              {integration.icon}
                            </span>
                            {integration.kind === "developer"
                              ? `${PRODUCT_NAME} ${integration.name}`
                              : integration.name}
                          </h3>
                          <p className="text-[0.9375rem] leading-relaxed text-text-muted">
                            {integration.summary}
                          </p>
                        </Panel>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          </section>
        ))}

        <section className="mkt-section border-t border-border-primary">
          <div className="mkt-container mkt-reveal text-center">
            <h2 className="mkt-h2 mb-5">Using another MCP client?</h2>
            <p className="mkt-body mx-auto mb-10 max-w-xl">
              Any client that can run a local command works with the same{" "}
              <code className="font-mono">npx -y exponential-mcp serve</code>{" "}
              setup.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5">
              <CTAButton href="/signin" variant="pill" size="large">
                Get started free
              </CTAButton>
              <CTAButton href="/docs/developers/mcp-and-sdk" variant="text">
                Read the MCP docs
              </CTAButton>
            </div>
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  );
}
