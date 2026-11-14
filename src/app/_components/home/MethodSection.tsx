import { Container } from "@mantine/core";
import { PRODUCT_NAME, SOCIAL_PROFILES } from "~/lib/brand";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

interface MethodSectionProps {
  id?: string;
}

/**
 * The method in brief, then who the product is for and how we use it
 * ourselves. Method language only: no claim here that a feature automates
 * the loop (see the claims register in the home page PRD).
 */
export function MethodSection({ id }: MethodSectionProps) {
  return (
    <section id={id} className="bg-surface-secondary py-20 md:py-28 scroll-mt-20">
      <Container size="lg">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
          <div>
            <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
              The method
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-4 font-inter leading-tight">
              Keep the record. Close the loop.
            </h2>
            <p className="text-text-secondary leading-relaxed">
              An organization makes promises: what matters, who owns it, why a
              decision was made. Keep them in one explicit record, review it
              on a rhythm, and bring the results back. The next person or
              agent can then carry on without rebuilding the story from old
              messages.
            </p>
          </div>

          <div>
            <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
              Who it is for
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-4 font-inter leading-tight">
              Teams of 5 to 40 putting agents to work
            </h2>
            <p className="text-text-secondary leading-relaxed">
              A founder, operations lead or product lead who carries the
              coordination in their head today, in any kind of organization.
              You want one place for people and agents, on software you can
              read and run yourself.
            </p>
          </div>

          <div>
            <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
              We run on it
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-4 font-inter leading-tight">
              {PRODUCT_NAME} is built in {PRODUCT_NAME}
            </h2>
            <p className="text-text-secondary leading-relaxed mb-4">
              The product&apos;s own tickets, decisions and releases live in a
              workspace shared by the people and the coding agents who work
              on it. The code and the release history are public.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link
                href="/product-timeline"
                className="inline-flex items-center gap-1.5 text-accent-indigo font-semibold hover:underline"
              >
                What shipped
                <IconArrowRight size={18} stroke={2} />
              </Link>
              <Link
                href={SOCIAL_PROFILES.github}
                className="inline-flex items-center gap-1.5 text-accent-indigo font-semibold hover:underline"
              >
                Source on GitHub
                <IconArrowRight size={18} stroke={2} />
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
