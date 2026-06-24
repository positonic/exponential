import { CRM_CONTACT_TYPE_TRIGGER } from "../crm/automation/triggerResolver";
import { LIST_MEMBER_ADDED_TRIGGER } from "../crm/automation/listMemberTrigger";

/**
 * Registry of **Automation trigger** types — the trigger-side sibling of
 * `StepRegistry` ([ADR-0029](../../../../docs/adr/0029-automation-platform-primitive.md)).
 *
 * Automations are no longer CRM-owned: a trigger type is *registered* here
 * rather than hardcoded into the engine, so adding one (a new event source, a
 * webhook) is a registration, not an engine edit. This is the in-process
 * extension seam a future third-party paid plugin would target.
 *
 * Two `kind`s:
 * - `event`    — dispatched imperatively by a domain hook (e.g. the CRM
 *                contact-type dispatcher runs on `crmContact.create/update`).
 * - `schedule` — polled by the `run-scheduled-automations` cron runner, which
 *                asks the registry which trigger types are schedule-driven.
 */
export type TriggerKind = "event" | "schedule";

export interface TriggerDefinition {
  type: string;
  kind: TriggerKind;
}

export class TriggerRegistry {
  private triggers = new Map<string, TriggerDefinition>();

  register(trigger: TriggerDefinition): void {
    this.triggers.set(trigger.type, trigger);
  }

  get(type: string): TriggerDefinition {
    const trigger = this.triggers.get(type);
    if (!trigger) {
      throw new Error(`No trigger registered for type: ${type}`);
    }
    return trigger;
  }

  has(type: string): boolean {
    return this.triggers.has(type);
  }

  listTypes(): string[] {
    return [...this.triggers.keys()];
  }

  listByKind(kind: TriggerKind): TriggerDefinition[] {
    return [...this.triggers.values()].filter((t) => t.kind === kind);
  }
}

/** Core, domain-neutral scheduled trigger ([ADR-0029](../../../../docs/adr/0029-automation-platform-primitive.md)). */
export const SCHEDULED_TRIGGER = "scheduled";

export function createTriggerRegistry(): TriggerRegistry {
  const registry = new TriggerRegistry();
  // Core trigger
  registry.register({ type: SCHEDULED_TRIGGER, kind: "schedule" });
  // CRM-contributed triggers (registered, not baked into the engine)
  registry.register({ type: CRM_CONTACT_TYPE_TRIGGER, kind: "event" });
  registry.register({ type: LIST_MEMBER_ADDED_TRIGGER, kind: "event" });
  return registry;
}
