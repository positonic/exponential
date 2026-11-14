import { IconBrandDocker, IconDatabase, IconKey } from "@tabler/icons-react";
import { SOCIAL_PROFILES } from "~/lib/brand";
import { Panel } from "~/app/_components/ui";
import { CTAButton } from "./shared/CTAButton";

// The published Railway template: Postgres, the app and the scheduler in
// the visitor's own Railway account.
const RAILWAY_DEPLOY_URL = "https://railway.com/deploy/exponential";

interface SelfHostSectionProps {
  id?: string;
}

// Mirrors the "Self-hosting" section of the README. Says plainly what an
// install depends on, so "self-host" is not read as more than it is.
const facts = [
  { icon: IconBrandDocker, label: "One command with Docker Compose" },
  { icon: IconDatabase, label: "Your Postgres, your data" },
  { icon: IconKey, label: "AI is optional, with your own key" },
];

export function SelfHostSection({ id }: SelfHostSectionProps) {
  return (
    <section id={id} className="mkt-section border-t border-border-primary">
      <div className="mkt-container mkt-reveal">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mkt-eyebrow mb-4">Self-host</p>
            <h2 className="mkt-h2 mb-4">Run the whole thing yourself</h2>
            <p className="mkt-body mb-8 max-w-lg">
              The code is AGPL-3.0. Deploy it to your own Railway account in
              one click, or start it on any server with Docker.
            </p>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
              <CTAButton href={RAILWAY_DEPLOY_URL} variant="ghost" size="large">
                Deploy on Railway
              </CTAButton>
              <CTAButton href={`${SOCIAL_PROFILES.github}#self-hosting`} variant="text">
                Self-hosting guide
              </CTAButton>
            </div>
          </div>

          <div>
            <Panel radius="xl" padding="none" className="mb-5 overflow-hidden">
              <div className="border-b border-border-primary px-4 py-2.5 text-xs font-medium text-text-muted">
                From a checkout of the repository
              </div>
              <pre className="overflow-x-auto p-5 font-mono text-sm leading-7">
                <span className="select-none text-text-muted">$ </span>
                <span className="text-text-primary">docker compose up -d --build</span>
              </pre>
            </Panel>
            <ul className="flex flex-wrap gap-2.5">
              {facts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <li key={fact.label} className="mkt-chip">
                    <Icon size={15} stroke={1.5} />
                    {fact.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
