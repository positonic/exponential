import { type PrismaClient } from "@prisma/client";

import { createFormDestinationRegistry } from "./FormDestinationRegistry";
import { parseFormDestinations } from "./formSchema";
import { type FormDestinationContext } from "./destinations/IFormDestination";

export interface DestinationOutcome {
  type: string;
  ok: boolean;
  detail?: Record<string, unknown>;
  error?: string;
}

/**
 * Run a form's destinations synchronously against a validated submission
 * (ADR-0029/0030). Each destination is isolated — one failure is recorded and
 * the rest still run; the intake never 500s on a destination error.
 */
export async function runFormDestinations(
  db: PrismaClient,
  destinationsJson: unknown,
  data: Record<string, unknown>,
  context: FormDestinationContext,
): Promise<{ outcomes: DestinationOutcome[]; createdContactId: string | null }> {
  const registry = createFormDestinationRegistry(db);
  const destinations = parseFormDestinations(destinationsJson);
  const outcomes: DestinationOutcome[] = [];
  let createdContactId: string | null = null;

  for (const dest of destinations) {
    if (!registry.has(dest.type)) {
      outcomes.push({
        type: dest.type,
        ok: false,
        error: "Unknown destination type",
      });
      continue;
    }
    try {
      const detail = await registry.get(dest.type).run(data, dest.config, context);
      if (typeof detail.contactId === "string") {
        createdContactId = detail.contactId;
      }
      outcomes.push({ type: dest.type, ok: true, detail });
    } catch (e) {
      outcomes.push({
        type: dest.type,
        ok: false,
        error: e instanceof Error ? e.message : "destination failed",
      });
    }
  }

  return { outcomes, createdContactId };
}