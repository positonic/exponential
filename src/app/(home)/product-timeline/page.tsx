import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { ProductTimelineClient } from "./ProductTimelineClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Product Timeline | Exponential",
  description:
    "See every change made to Exponential. A transparent changelog powered by our git history.",
  alternates: { canonical: "https://www.exponential.im/product-timeline" },
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
