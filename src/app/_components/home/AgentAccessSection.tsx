import { Container } from "@mantine/core";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { Panel } from "~/app/_components/ui";

interface AgentAccessSectionProps {
  id?: string;
}

// Commands are the ones in the published docs (content/docs). Keep them in
// step with the CLI and MCP packages.
const terminalLines = [
  { kind: "comment", text: "# The CLI your agents and scripts can drive" },
  { kind: "command", text: "npm install -g exponential-cli" },
  { kind: "command", text: "exponential auth login" },
  { kind: "command", text: "exponential actions list --json" },
  { kind: "comment", text: "" },
  { kind: "comment", text: "# Or expose your workspace to any MCP client" },
  { kind: "command", text: "npx exponential-mcp init" },
] as const;

export function AgentAccessSection({ id }: AgentAccessSectionProps) {
  return (
    <section id={id} className="bg-surface-secondary py-20 md:py-28 scroll-mt-20">
      <Container size="lg">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <p className="text-accent-indigo uppercase tracking-wider text-sm font-semibold mb-4">
              Bring your own agent
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4 font-inter leading-tight">
              Works with the agents you already use
            </h2>
            <p className="text-lg text-text-secondary leading-relaxed mb-6">
              A command-line tool, a TypeScript SDK and an MCP server give
              coding agents and chat clients the same goals, projects and
              actions your team sees. Each agent signs in with its own key,
              so its work is attributed to it and you can switch it off.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-1.5 text-accent-indigo font-semibold hover:underline"
              >
                Read the docs
                <IconArrowRight size={18} stroke={2} />
              </Link>
              <Link
                href="/features/integrations/claude"
                className="inline-flex items-center gap-1.5 text-accent-indigo font-semibold hover:underline"
              >
                Set up with Claude
                <IconArrowRight size={18} stroke={2} />
              </Link>
            </div>
          </div>

          <Panel variant="elevated" radius="xl" padding="none" className="overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border-primary text-xs text-text-muted font-medium">
              Terminal
            </div>
            <pre className="p-5 text-sm leading-7 overflow-x-auto font-mono">
              {terminalLines.map((line, index) => (
                <div key={index}>
                  {line.kind === "command" ? (
                    <>
                      <span className="text-text-muted select-none">$ </span>
                      <span className="text-text-primary">{line.text}</span>
                    </>
                  ) : (
                    <span className="text-text-muted">{line.text || " "}</span>
                  )}
                </div>
              ))}
            </pre>
          </Panel>
        </div>
      </Container>
    </section>
  );
}
