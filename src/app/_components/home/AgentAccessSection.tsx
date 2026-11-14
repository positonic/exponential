import { Panel } from "~/app/_components/ui";
import { CTAButton } from "./shared/CTAButton";

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

/** Developers: the CLI, SDK and MCP server, in one terminal. */
export function AgentAccessSection({ id }: AgentAccessSectionProps) {
  return (
    <section id={id} className="mkt-section border-t border-border-primary">
      <div className="mkt-container mkt-reveal">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mkt-eyebrow mb-4">Developers</p>
            <h2 className="mkt-h2 mb-4">Works with the agents you already use</h2>
            <p className="mkt-body mb-8 max-w-lg">
              A command-line tool, a TypeScript SDK and an MCP server give
              coding agents and chat clients the same goals, projects and
              actions your team sees. Each agent signs in with its own key,
              so its work is attributed to it and you can switch it off.
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <CTAButton href="/docs" variant="text">
                Read the docs
              </CTAButton>
              <CTAButton href="/features/integrations/claude" variant="text">
                Set up with Claude
              </CTAButton>
            </div>
          </div>

          <Panel radius="xl" padding="none" className="overflow-hidden">
            <div className="border-b border-border-primary px-4 py-2.5 text-xs font-medium text-text-muted">
              Terminal
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-sm leading-7">
              {terminalLines.map((line, index) => (
                <div key={index}>
                  {line.kind === "command" ? (
                    <>
                      <span className="select-none text-text-muted">$ </span>
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
      </div>
    </section>
  );
}
