import { type Metadata } from "next";
import { api, HydrateClient } from "~/trpc/server";
import { BountyDetailClient } from "./BountyDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ projectSlug: string; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bounty = await api.bounty.getPublic({ id });

  if (!bounty) {
    return { title: "Bounty Not Found | Exponential" };
  }

  return {
    title: `${bounty.name} — Bounty | Exponential`,
    description:
      bounty.description ?? `View bounty details for ${bounty.name}`,
  };
}

export default async function BountyDetailPage({ params }: Props) {
  const { projectSlug, id } = await params;
  const bounty = await api.bounty.getPublic({ id });

  // Build JSON-LD structured data for search engines and AI search tools
  const jsonLd = bounty
    ? {
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: bounty.name,
        description: bounty.description ?? `Bounty: ${bounty.name}`,
        employmentType: "CONTRACT",
        ...(bounty.bountyAmount
          ? {
              baseSalary: {
                "@type": "MonetaryAmount",
                currency: bounty.bountyToken ?? "USD",
                value: {
                  "@type": "QuantitativeValue",
                  value: Number(bounty.bountyAmount),
                },
              },
            }
          : {}),
        ...(bounty.bountySkills.length > 0
          ? { skills: bounty.bountySkills.join(", ") }
          : {}),
        ...(bounty.bountyDeadline
          ? { validThrough: new Date(bounty.bountyDeadline).toISOString() }
          : {}),
        hiringOrganization: {
          "@type": "Organization",
          name: bounty.project?.name ?? "Exponential",
          sameAs: `https://www.exponential.im/explore/${projectSlug}`,
        },
        jobLocation: {
          "@type": "Place",
          address: { "@type": "PostalAddress", addressCountry: "Remote" },
        },
        url: `https://www.exponential.im/explore/${projectSlug}/bounties/${id}`,
      }
    : null;

  return (
    <HydrateClient>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <BountyDetailClient bountyId={id} projectSlug={projectSlug} />
    </HydrateClient>
  );
}
