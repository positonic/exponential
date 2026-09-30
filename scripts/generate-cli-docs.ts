/**
 * Generates content/docs/developers/cli.md from the exponential-cli command
 * tree, so the reference can never drift from the CLI it documents.
 *
 * Usage:
 *   EXPONENTIAL_CLI_DIR=/path/to/exponential-cli npx tsx scripts/generate-cli-docs.ts
 *
 * The CLI checkout must have its dependencies installed (`npm ci`); the
 * script imports `src/program.ts` and walks the commander tree it builds.
 * Everything between the AUTO-GENERATED markers in the output file is
 * replaced; the hand-written intro above the first marker is kept.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface CmdLike {
  name(): string;
  description(): string;
  usage(): string;
  aliases(): string[];
  commands: CmdLike[];
  options: { flags: string; description: string; defaultValue?: unknown; required?: boolean }[];
  registeredArguments?: { name(): string; required: boolean; description: string }[];
}

const cliDir = process.env.EXPONENTIAL_CLI_DIR ?? path.resolve(process.cwd(), "../exponential-cli");
const outFile = path.resolve(process.cwd(), "content/docs/developers/cli.md");
const START = "<!-- AUTO-GENERATED: everything below is written by scripts/generate-cli-docs.ts — do not edit by hand -->";
const END = "<!-- END AUTO-GENERATED -->";

/** Table-safe text: no pipes or newlines, and no `](` so a CLI description cannot read as a Markdown link. */
function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").replace(/\]\(/g, "] (").trim();
}

function firstSentence(s: string): string {
  return s.split("\n")[0]!.trim();
}

function renderCommand(cmd: CmdLike, parents: string[], out: string[]) {
  const full = [...parents, cmd.name()].join(" ");
  const depth = parents.length;
  const heading = depth === 0 ? "##" : "###";
  out.push(`${heading} \`${full}\``, "");
  if (cmd.aliases().length) out.push(`Alias: ${cmd.aliases().map((a) => `\`${a}\``).join(", ")}`, "");
  const desc = cmd.description().trim().replace(/\]\(/g, "] (");
  if (desc) out.push(desc, "");
  if (cmd.commands.length === 0 || cmd.options.length > 0) {
    out.push("```bash", `exponential ${full} ${cmd.usage()}`.replace(/\s+/g, " ").trim(), "```", "");
  }
  const args = cmd.registeredArguments ?? [];
  if (args.length) {
    out.push("| Argument | Required | Description |", "|---|---|---|");
    for (const a of args) out.push(`| \`${a.name()}\` | ${a.required ? "yes" : "no"} | ${esc(a.description || "")} |`);
    out.push("");
  }
  const opts = cmd.options.filter((o) => !/^-h, --help$/.test(o.flags));
  if (opts.length) {
    out.push("| Option | Description |", "|---|---|");
    for (const o of opts) {
      const def = o.defaultValue !== undefined && o.defaultValue !== false && !(Array.isArray(o.defaultValue) && o.defaultValue.length === 0)
        ? ` (default: \`${JSON.stringify(o.defaultValue)}\`)` : "";
      out.push(`| \`${esc(o.flags)}\` | ${esc(o.description)}${def} |`);
    }
    out.push("");
  }
  for (const sub of cmd.commands) renderCommand(sub, [...parents, cmd.name()], out);
}

async function main() {
  const programPath = path.join(cliDir, "src", "program.ts");
  if (!fs.existsSync(programPath)) {
    console.error(`generate-cli-docs: ${programPath} not found. Set EXPONENTIAL_CLI_DIR to an exponential-cli checkout.`);
    process.exit(1);
  }
  const mod = (await import(pathToFileURL(programPath).href)) as { buildProgram: () => CmdLike; PKG_VERSION: string };
  const program = mod.buildProgram();
  const version = mod.PKG_VERSION;

  const out: string[] = [];
  out.push(START, "", `_Generated from exponential-cli ${version}._`, "");
  out.push("| Command | What it does |", "|---|---|");
  for (const c of program.commands) out.push(`| [\`${c.name()}\`](#${c.name()}) | ${esc(firstSentence(c.description()))} |`);
  out.push("");
  for (const c of program.commands) renderCommand(c, [], out);
  out.push(END);

  const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf-8") : "";
  const startIdx = existing.indexOf(START);
  const endIdx = existing.indexOf(END);
  const head = startIdx >= 0 ? existing.slice(0, startIdx) : existing;
  const tail = endIdx >= 0 ? existing.slice(endIdx + END.length) : "";
  fs.writeFileSync(outFile, head + out.join("\n") + tail);
  console.log(`generate-cli-docs: wrote ${program.commands.length} command groups from exponential-cli ${version} to ${path.relative(process.cwd(), outFile)}`);
}

void main();
