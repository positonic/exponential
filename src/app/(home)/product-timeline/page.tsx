import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { ProductTimelineClient } from "./ProductTimelineClient";
import { PRODUCT_NAME } from "~/lib/brand";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Product Timeline | ${PRODUCT_NAME}`,
  description: `See every change made to ${PRODUCT_NAME}. A transparent changelog powered by our git history.`,
  alternates: { canonical: `${getPublicBaseUrlFromEnv()}/product-timeline` },
};

export default async function ProductTimelinePage() {
  void api.github.listCommits.prefetch({
    page: 1,
    perPage: 100,
    owner: "positonic",
    repo: "exponential",
    branch: "main",
  });

  return (
    <HydrateClient>
      <ProductTimelineClient />
    </HydrateClient>
  );
}
