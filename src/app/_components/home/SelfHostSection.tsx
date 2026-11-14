import { Container } from "@mantine/core";
import Link from "next/link";
import {
  IconArrowRight,
  IconBrandDocker,
  IconDatabase,
  IconKey,
} from "@tabler/icons-react";
import { SOCIAL_PROFILES } from "~/lib/brand";
import { Panel } from "~/app/_components/ui";

interface SelfHostSectionProps {
  id?: string;
}

// Mirrors the "Self-hosting" section of the README. Says plainly what an
// install depends on, so "self-host" is not read as more than it is.
const points = [
  {
    icon: IconBrandDocker,
    title: "One command with Docker Compose",
    description:
      "Postgres, the app and the scheduler start together on any Docker host, from a checkout of the repository.",
  },
  {
    icon: IconDatabase,
    title: "Your database, your data",
    description:
      "Everything lives in a Postgres you run. No account with us is needed, and nothing has to be configured before the first start.",
  },
  {
    icon: IconKey,
    title: "AI is optional, with your own key",
    description:
      "The workspace runs without a model provider. Add an OpenAI or Anthropic key for the AI features, and start the optional assistant service for chat. Those requests go to the provider you choose.",
  },
];

export function SelfHostSection({ id }: SelfHostSectionProps) {
  return (
    <section id={id} className="bg-background-primary py-20 md:py-28 scroll-mt-20">
      <Container size="lg">
        <div className="text-center mb-12 md:mb-16">
          <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
            Run it yourself
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4 font-inter">
            Self-host the whole thing
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            The code is AGPL-3.0, and it runs on a server you control.
          </p>
        </div>

        <Panel radius="xl" padding="none" className="overflow-hidden max-w-3xl mx-auto mb-12">
          <pre className="p-5 text-sm leading-7 overflow-x-auto font-mono">
            <div>
              <span className="text-text-muted select-none">$ </span>
              <span className="text-text-primary">
                git clone {SOCIAL_PROFILES.github}.git
              </span>
            </div>
            <div>
              <span className="text-text-muted select-none">$ </span>
              <span className="text-text-primary">cd exponential</span>
            </div>
            <div>
              <span className="text-text-muted select-none">$ </span>
              <span className="text-text-primary">
                docker compose up -d --build
              </span>
            </div>
          </pre>
        </Panel>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {points.map((point) => {
            const Icon = point.icon;
            return (
              <div
                key={point.title}
                className="border border-border-primary rounded-xl p-6"
              >
                <Icon
                  size={28}
                  stroke={1.5}
                  className="text-accent-indigo mb-4"
                />
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  {point.title}
                </h3>
                <p className="text-text-secondary leading-relaxed">
                  {point.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <Link
            href={`${SOCIAL_PROFILES.github}#self-hosting`}
            className="inline-flex items-center gap-1.5 text-accent-indigo font-semibold hover:underline"
          >
            Read the self-hosting guide
            <IconArrowRight size={18} stroke={2} />
          </Link>
        </div>
      </Container>
    </section>
  );
}
