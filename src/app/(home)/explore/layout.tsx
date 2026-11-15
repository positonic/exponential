import type { Metadata } from "next";

// The bounty board is no longer a direction, and these pages are near empty,
// so every /explore page stays out of search results. Links still resolve.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
