// @vitest-environment node
/**
 * The Docker Compose stack (`docker-compose.yml`, `docker/compose/*.sh`).
 *
 * The two shell scripts are the stack's only logic: `secrets-init.sh`
 * generates the install's secrets once and must never overwrite them, and
 * `with-secrets.sh` loads them (and points the app at Mastra only when the
 * assistant profile is on) before each service starts. These run the real
 * scripts with `sh` against a temp directory and assert what a service sees.
 *
 * Booting the stack needs Docker and a 10 GB image build, so that is the
 * self-host smoke workflow's job (`.github/workflows/selfhost-smoke.yml`);
 * the compose-file guards below pin what would otherwise only fail there.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SECRETS_INIT = path.join(ROOT, "docker/compose/secrets-init.sh");
const WITH_SECRETS = path.join(ROOT, "docker/compose/with-secrets.sh");

let dir: string;
let secretsFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "selfhost-compose-"));
  secretsFile = path.join(dir, "secrets", "selfhost.env");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runSecretsInit(): string {
  return execFileSync("sh", [SECRETS_INIT], {
    env: { PATH: process.env.PATH, SECRETS_FILE: secretsFile },
    encoding: "utf8",
  });
}

/** The KEY -> value pairs a sourced secrets file exports. */
function parseSecrets(contents: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const match of contents.matchAll(/^export ([A-Z_]+)='([^']*)'$/gm)) {
    pairs[match[1]!] = match[2]!;
  }
  return pairs;
}

/** Run `with-secrets.sh` with `env` as the command, returning its exports. */
function runWithSecrets(extraEnv: Record<string, string> = {}) {
  const result = spawnSync("sh", [WITH_SECRETS, "env"], {
    env: { PATH: process.env.PATH, SECRETS_FILE: secretsFile, ...extraEnv },
    encoding: "utf8",
  });
  const env: Record<string, string> = {};
  for (const line of result.stdout.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, env };
}

describe("secrets-init.sh", () => {
  it("generates AUTH_SECRET, DATABASE_ENCRYPTION_KEY and CRON_SECRET on first run", () => {
    const output = runSecretsInit();

    const secrets = parseSecrets(readFileSync(secretsFile, "utf8"));
    expect(Object.keys(secrets).sort()).toEqual(["AUTH_SECRET", "CRON_SECRET", "DATABASE_ENCRYPTION_KEY"]);
    // The app accepts a 32-byte key as base64 (isValidDatabaseEncryptionKey).
    expect(Buffer.from(secrets.DATABASE_ENCRYPTION_KEY!, "base64")).toHaveLength(32);
    expect(secrets.AUTH_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(secrets.CRON_SECRET!.length).toBeGreaterThanOrEqual(32);
    expect(new Set(Object.values(secrets)).size).toBe(3);
    expect(output).toContain("Generated AUTH_SECRET DATABASE_ENCRYPTION_KEY CRON_SECRET");
  });

  it("makes the file readable by its owner only", () => {
    runSecretsInit();
    expect(statSync(secretsFile).mode & 0o777).toBe(0o400);
  });

  it("leaves no temp file behind", () => {
    runSecretsInit();
    const leftovers = execFileSync("ls", ["-A", path.dirname(secretsFile)], { encoding: "utf8" }).trim();
    expect(leftovers).toBe("selfhost.env");
  });
});

describe("with-secrets.sh", () => {
  it("exports the generated secrets to the service's command", () => {
    runSecretsInit();
    const secrets = parseSecrets(readFileSync(secretsFile, "utf8"));

    const { status, env } = runWithSecrets();

    expect(status).toBe(0);
    expect(env.AUTH_SECRET).toBe(secrets.AUTH_SECRET);
    expect(env.DATABASE_ENCRYPTION_KEY).toBe(secrets.DATABASE_ENCRYPTION_KEY);
    expect(env.CRON_SECRET).toBe(secrets.CRON_SECRET);
  });

  it("refuses to start, saying why, when secrets-init has not run", () => {
    const { status, stderr } = runWithSecrets();

    expect(status).toBe(1);
    expect(stderr).toContain("secrets-init must run first");
  });

  it("leaves MASTRA_API_URL alone on services that do not ask for Mastra", () => {
    runSecretsInit();
    const { env } = runWithSecrets();
    expect(env.MASTRA_API_URL).toBeUndefined();
  });

  // `getent` is how the container checks whether the mastra service is part
  // of the stack. The images are Debian; macOS has no getent.
  const hasGetent = spawnSync("sh", ["-c", "command -v getent"]).status === 0;

  describe.skipIf(!hasGetent)("the assistant profile", () => {
    it("points the app at Mastra when the mastra service resolves", () => {
      runSecretsInit();
      const { env, stdout } = runWithSecrets({ SELFHOST_MASTRA_HOST: "localhost" });
      expect(env.MASTRA_API_URL).toBe("http://localhost:4111");
      expect(stdout).toContain("The assistant profile is on");
    });

    it("leaves the Assistant off when there is no mastra service", () => {
      runSecretsInit();
      const { env, stdout } = runWithSecrets({ SELFHOST_MASTRA_HOST: "no-such-service.invalid" });
      expect(env.MASTRA_API_URL).toBeUndefined();
      expect(stdout).toContain("The assistant profile is off");
    });

    it("never replaces an explicit MASTRA_API_URL", () => {
      runSecretsInit();
      const { env } = runWithSecrets({
        SELFHOST_MASTRA_HOST: "localhost",
        MASTRA_API_URL: "http://mastra.example.internal:4111",
      });
      expect(env.MASTRA_API_URL).toBe("http://mastra.example.internal:4111");
    });
  });
});

describe("docker-compose.yml", () => {
  const compose = readFileSync(path.join(ROOT, "docker-compose.yml"), "utf8");
  const lines = compose.split("\n").filter((line) => !line.trimStart().startsWith("#"));
  const body = lines.join("\n");

  /** The YAML block of one top-level service, comments stripped. */
  function service(name: string): string {
    const start = lines.findIndex((line) => line === `  ${name}:`);
    expect(start, `service ${name}`).toBeGreaterThan(-1);
    const end = lines.findIndex((line, i) => i > start && /^ {2}\S/.test(line));
    const stop = lines.findIndex((line, i) => i > start && /^\S/.test(line));
    const until = [end, stop].filter((i) => i > -1);
    return lines.slice(start, until.length ? Math.min(...until) : undefined).join("\n");
  }

  it("requires no variable at all: no ${VAR:?...} anywhere", () => {
    // LLM keys are optional (smoky.anvil); a required interpolation would also
    // break `docker compose up` for services outside the active profile.
    expect(body).not.toMatch(/\$\{[A-Z_]+:?\?/);
  });

  it("passes LLM keys through only when set, never with a default", () => {
    expect(body).not.toMatch(/(OPENAI|ANTHROPIC)_API_KEY:[ \t]*\S/);
    expect(body).toMatch(/^ {6}OPENAI_API_KEY:$/m);
    expect(body).toMatch(/^ {6}ANTHROPIC_API_KEY:$/m);
  });

  it("puts Mastra behind the assistant profile, and nothing else", () => {
    expect(service("mastra")).toMatch(/profiles: \["assistant"\]/);
    expect(body.match(/profiles:/g)).toHaveLength(1);
  });

  it("only lets the app wait for Mastra when the profile brings it", () => {
    expect(service("app")).toMatch(/mastra:\n\s+condition: service_started\n\s+required: false/);
  });

  it("starts the app, scheduler and Mastra after secrets-init and a healthy Postgres", () => {
    expect(compose).toMatch(
      /&after-secrets-and-db\n\s+secrets-init:\n\s+condition: service_completed_successfully\n\s+postgres:\n\s+condition: service_healthy/,
    );
    for (const name of ["app", "scheduler", "mastra"]) {
      expect(service(name), name).toContain("<<: *after-secrets-and-db");
      expect(service(name), name).toContain("<<: *with-secrets");
    }
  });

  it("builds the app and scheduler from this repo's Dockerfiles", () => {
    expect(service("app")).toMatch(/context: \.\n\s+dockerfile: Dockerfile\n/);
    expect(service("scheduler")).toMatch(/context: \.\n\s+dockerfile: docker\/scheduler\.Dockerfile\n/);
  });

  it("keeps the documented default port 3000, configurable", () => {
    expect(service("app")).toContain('"${APP_PORT:-3000}:3000"');
  });

  it("never publishes Postgres on the host", () => {
    expect(service("postgres")).not.toMatch(/ports:/);
  });
});
