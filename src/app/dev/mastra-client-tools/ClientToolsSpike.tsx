"use client";

import { MastraClient } from "@mastra/client-js";
import { useRef, useState } from "react";

/**
 * V2 transport spike: can a browser stream a turn to the Mastra server and
 * execute a tool *locally* mid-turn?
 *
 * The whole local-wiki design rests on yes. The librarian's file tools have to
 * run on the user's machine, which means the model asks for a tool, the browser
 * runs it, and the model carries on with the result — with the Exponential
 * backend nowhere in the turn's data path.
 *
 * This page proves that end to end with the cheapest possible tool: an echo that
 * runs here, in the page, and stamps the result so its output is unmistakably
 * local. Everything it does with `clientTools` is what `streamLocalWikiChat`
 * will do with the real wiki commands.
 */

/** One line of the transcript — the evidence the spike is actually about. */
interface Event {
  at: number;
  kind: "info" | "tool-call" | "local-exec" | "text" | "error" | "done";
  detail: string;
}

interface TokenResponse {
  token: string;
  userId: string;
  synthetic: boolean;
  mastraUrl: string;
}

/** Agent to drive. The weather demo agent touches no user data. */
const SPIKE_AGENT_ID = "weatherAgent";

/**
 * A city the model cannot know without asking the local tool, and would never
 * guess from the prompt. Seeing it in the final answer is the proof that the
 * locally-produced result actually reached the model.
 */
const SECRET_LOCATION = "Reykjavik";

/**
 * Deliberately makes the turn need *both* kinds of tool: a local one to learn
 * where the device is, then the agent's own server-side weather tool for that
 * place. That is the exact shape V2 needs — local file tools composing with
 * whatever the agent already has, inside one turn.
 */
const PROMPT =
  "What is the weather where I am right now? " +
  "You do not know my location — call `getDeviceLocation` first to find out, " +
  "then look up the weather for whatever city it returns. " +
  "Name the city in your answer.";

export function ClientToolsSpike() {
  const [events, setEvents] = useState<Event[]>([]);
  const [running, setRunning] = useState(false);
  const executed = useRef(0);
  // Mirrors the streamed answer outside React state, so the verdict below can
  // read it without waiting for a re-render.
  const answerRef = useRef("");

  const log = (kind: Event["kind"], detail: string) =>
    setEvents((prev) => [...prev, { at: Date.now(), kind, detail }]);

  const run = async () => {
    setEvents([]);
    executed.current = 0;
    answerRef.current = "";
    setRunning(true);

    try {
      const res = await fetch("/api/dev/mastra-agent-token");
      if (!res.ok) throw new Error(`token mint failed: ${res.status}`);
      const { token, userId, synthetic, mastraUrl } = (await res.json()) as TokenResponse;
      log("info", `minted agent JWT for ${userId}${synthetic ? " (synthetic)" : ""}`);
      log("info", `streaming to ${mastraUrl} as ${SPIKE_AGENT_ID}`);

      // Straight from the browser to Mastra — no Next.js route in between. If
      // the server's CORS did not allow this origin plus the Authorization
      // header, the request would never leave the page.
      const client = new MastraClient({
        baseUrl: mastraUrl,
        headers: { Authorization: `Bearer ${token}` },
      });

      const response = await client.getAgent(SPIKE_AGENT_ID).stream(PROMPT, {
        clientTools: {
          getDeviceLocation: {
            id: "getDeviceLocation",
            description:
              "Returns the city this device is in. Runs on the user's device, not on the server.",
            // Raw JSON Schema, deliberately not zod. `processClientTools` runs
            // every zod-shaped `inputSchema` through a converter that mangles the
            // app's zod build into `{"anyOf":[{},{"type":"null"}]}`, which OpenAI
            // then rejects outright ("schema must be of type object"). Objects
            // that don't look like zod are forwarded untouched, so handing over
            // the JSON Schema directly sidesteps the converter entirely.
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            execute: async () => {
              // The load-bearing line: this runs *here*, in the page.
              executed.current += 1;
              log("local-exec", `getDeviceLocation ran in the browser → ${SECRET_LOCATION}`);
              return { city: SECRET_LOCATION };
            },
          },
        },
      });

      await response.processDataStream({
        onChunk: async (chunk: { type?: string; payload?: unknown }) => {
          if (chunk.type === "tool-call") {
            const payload = chunk.payload as { toolName?: string; args?: unknown };
            log("tool-call", `model asked for ${payload?.toolName ?? "?"}`);
          } else if (chunk.type === "text-delta") {
            const payload = chunk.payload as { text?: string };
            if (payload?.text) {
              answerRef.current += payload.text;
              log("text", payload.text);
            }
          } else if (chunk.type === "error") {
            log("error", JSON.stringify(chunk.payload));
          }
        },
      });

      // Executing locally is only half of it. The result has to get *back* into
      // the model's context, and the only honest evidence of that is the model
      // repeating something it could not have known otherwise.
      const answerSoFar = answerRef.current;
      if (executed.current === 0) {
        log("done", "NO LOCAL EXECUTION — the model never called the client tool");
      } else if (answerSoFar.includes(SECRET_LOCATION)) {
        log(
          "done",
          `ROUND-TRIP PROVEN — tool ran locally ${executed.current}×, and the model's answer ` +
            `names ${SECRET_LOCATION}, which it could only have learned from the local result`,
        );
      } else {
        log(
          "done",
          `PARTIAL — the tool ran locally ${executed.current}× and the turn continued, but the ` +
            `answer never mentions ${SECRET_LOCATION}, so the result reaching the model is unproven`,
        );
      }
    } catch (error) {
      log("error", error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const answer = events
    .filter((e) => e.kind === "text")
    .map((e) => e.detail)
    .join("");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8 text-text-primary">
      <div>
        <h1 className="text-xl font-semibold">Mastra clientTools round-trip</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Streams one turn from this page straight to the Mastra server, passing a
          tool whose <code>execute()</code> runs in the browser. Proves the V2
          local-wiki transport before any of it is built.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="w-fit rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {running ? "Running…" : "Run the round-trip"}
      </button>

      {events.length > 0 && (
        <ol className="flex flex-col gap-1 rounded-md border border-border-primary bg-surface-secondary p-4 font-mono text-xs">
          {events
            .filter((e) => e.kind !== "text")
            .map((event, i) => (
              <li key={i} className={event.kind === "error" ? "text-red-500" : undefined}>
                <span className="text-text-muted">{event.kind}</span> {event.detail}
              </li>
            ))}
        </ol>
      )}

      {answer && (
        <div className="rounded-md border border-border-primary p-4">
          <p className="text-xs uppercase text-text-muted">Model&apos;s answer</p>
          <p className="mt-1 text-sm">{answer}</p>
        </div>
      )}
    </div>
  );
}
