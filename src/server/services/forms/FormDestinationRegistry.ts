import { type PrismaClient } from "@prisma/client";

import { type IFormDestination } from "./destinations/IFormDestination";
import { CreateCrmContactDestination } from "./destinations/CreateCrmContactDestination";
import { CreateDealDestination } from "./destinations/CreateDealDestination";
import { CreateInsightDestination } from "./destinations/CreateInsightDestination";

/**
 * Registry of **Form destinations**, mirroring the automation `StepRegistry`.
 * Forms stay generic — the core runs whatever destinations are configured; new
 * destination types (notify, webhook, create deal) register here with no core
 * change.
 */
export class FormDestinationRegistry {
  private handlers = new Map<string, IFormDestination>();

  register(handler: IFormDestination): void {
    this.handlers.set(handler.type, handler);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  get(type: string): IFormDestination {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`No form destination registered for type: ${type}`);
    }
    return handler;
  }

  listTypes(): string[] {
    return [...this.handlers.keys()];
  }
}

export function createFormDestinationRegistry(
  db: PrismaClient,
): FormDestinationRegistry {
  const registry = new FormDestinationRegistry();
  registry.register(new CreateCrmContactDestination(db));
  registry.register(new CreateDealDestination(db));
  registry.register(new CreateInsightDestination(db));
  return registry;
}