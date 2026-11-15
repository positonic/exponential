import { type Metadata } from "next";
import { ProductTimelineClient } from "./ProductTimelineClient";
import { FooterSection, MarketingHeader } from "~/app/_components/home";
import { auth } from "~/server/auth";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Product Timeline | ${PRODUCT_NAME}`,
  description: `See every change made to ${PRODUCT_NAME}. A transparent changelog powered by our git history.`,
  alternates: { canonical: `${getPublicBaseUrlFromEnv()}/product-timeline` },
};

export default async function ProductTimelinePage() {
  // A signed-in visitor gets "Open app" in the header, as on learn and blog.
  const session = await auth();

  // Deliberately no `prefetch` here. Prefetching dehydrates the query as
  // *pending*; when the GitHub call fails server-side (an expired GITHUB_TOKEN
  // is the one that bit us), the hydrated client query is stranded in
  // `status: "pending" / fetchStatus: "paused"` — never `error`, and never
  // retried. That renders as a silent empty timeline that no error state can
  // catch, because from the client's point of view nothing failed. Letting the
  // client own the fetch costs one round trip and makes failure observable.
  return (
    <div className="mkt min-h-screen bg-background-primary text-text-primary">
      <MarketingHeader session={session} mobileNav />

      <main className="py-8 md:py-12">
        <ProductTimelineClient />
      </main>

      <FooterSection />
    </div>
  );
}
