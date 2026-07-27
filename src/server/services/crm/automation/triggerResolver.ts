/**
 * CRM Automation trigger resolver — the pure decision at the heart of the
 * "Contact customer type set" trigger (see CONTEXT.md → CRM & Automations,
 * ADR-0025).
 *
 * Given a contact's Customer-type change and the workspace's active CRM
 * automations, decide which automations should fire. This function is pure —
 * no DB, no side effects — so the firing rule (transition-only, idempotent,
 * import-suppressed) is unit-tested in isolation. The impure dispatcher
 * (`dispatchContactTypeAutomations`) gathers the inputs and runs the engine.
 */

/** `WorkflowDefinition.triggerType` value that marks a CRM contact-type automation. */
export const CRM_CONTACT_TYPE_TRIGGER = "crm_contact_type";

export interface ContactTypeChange {
  /** The contact's Customer type before the write (null if it had none). */
  oldProfileType: string | null;
  /** The contact's Customer type after the write (null if cleared/absent). */
  newProfileType: string | null;
  /**
   * Present when this contact write is part of a Gmail/Calendar bulk import.
   * Bulk imports must never fire onboarding automations, so any truthy value
   * here suppresses all firing. (In practice the import path bypasses the
   * contact router entirely, so this is a defensive second line of defence.)
   */
  importBatchId?: string | null;
}

export interface CrmAutomationDefinition {
  id: string;
  /** The Customer type this automation onboards — from `config.targetCustomerType`. */
  targetCustomerType: string;
}

export interface ResolveTriggerInput {
  change: ContactTypeChange;
  /** Active CRM contact-type automations in the contact's workspace. */
  definitions: CrmAutomationDefinition[];
  /**
   * Definition ids that have already produced a run for this contact.
   * Used to keep firing idempotent — an automation never fires twice for the
   * same contact.
   */
  alreadyFiredDefinitionIds: readonly string[];
}

/**
 * Pure: which automations should fire for this contact Customer-type change.
 *
 * Fires a definition when ALL of:
 *  - the write is not part of a bulk import,
 *  - `newProfileType` is a real value AND differs from `oldProfileType`
 *    (a genuine transition, not a no-op re-save),
 *  - the definition targets that Customer type,
 *  - the definition has not already fired for this contact.
 */
export function resolveAutomationsToFire(
  input: ResolveTriggerInput,
): CrmAutomationDefinition[] {
  const { change, definitions, alreadyFiredDefinitionIds } = input;

  // Bulk import never triggers onboarding automations.
  if (change.importBatchId) return [];

  const next = change.newProfileType?.trim();
  // Must be a real type, and an actual transition (not unchanged/cleared).
  if (!next) return [];
  if (next === change.oldProfileType?.trim()) return [];

  const fired = new Set(alreadyFiredDefinitionIds);
  return definitions.filter(
    (def) => def.targetCustomerType === next && !fired.has(def.id),
  );
}
