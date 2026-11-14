import Link from "next/link";
import {
  IconArrowUpRight,
  IconBrandGithub,
  IconGitMerge,
  IconLicense,
} from "@tabler/icons-react";
import { PRODUCT_NAME, SOCIAL_PROFILES } from "~/lib/brand";

/**
 * Proof, directly under the hero. Only things a visitor can check for
 * themselves: the source, the licence, and the public record of what we
 * ship from our own workspace. No usage numbers or outcome claims without a
 * source behind them.
 *
 * Design partners: add `{ name, logo }` entries to `partners` once there are
 * logos we have permission to show. The row renders only when it has entries,
 * so the page never ships a placeholder.
 */
const partners: { name: string; logo: React.ReactNode }[] = [];

const proofs = [
  {
    icon: IconBrandGithub,
    label: "Open source on GitHub",
    href: SOCIAL_PROFILES.github,
    external: true,
  },
  {
    icon: IconLicense,
    label: "AGPL-3.0 licensed",
    href: `${SOCIAL_PROFILES.github}/blob/main/LICENSE`,
    external: true,
  },
  {
    icon: IconGitMerge,
    label: `Built in ${PRODUCT_NAME}: see what shipped`,
    href: "/product-timeline",
    external: false,
  },
];

export function ProofStrip() {
  return (
    <section aria-label="Proof" className="border-y border-border-primary">
      <div className="mkt-container py-8">
        <ul className="flex flex-col items-center justify-center gap-x-12 gap-y-4 text-sm md:flex-row">
          {proofs.map((proof) => {
            const Icon = proof.icon;
            const content = (
              <>
                <Icon size={18} stroke={1.5} className="text-text-muted" />
                {proof.label}
                {proof.external && (
                  <IconArrowUpRight size={14} stroke={1.75} className="text-text-muted" />
                )}
              </>
            );
            return (
              <li key={proof.label}>
                {proof.external ? (
                  <a
                    href={proof.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mkt-link text-sm"
                  >
                    {content}
                  </a>
                ) : (
                  <Link href={proof.href} className="mkt-link text-sm">
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {partners.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {partners.map((partner) => (
              <span key={partner.name} title={partner.name} className="text-text-muted">
                {partner.logo}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
