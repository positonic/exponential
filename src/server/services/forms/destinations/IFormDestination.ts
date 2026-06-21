/**
 * A **Form destination** — what a form submission does, run synchronously on
 * intake (CONTEXT.md → Forms, ADR-0029). Mirrors the automation `IStepExecutor`
 * pattern. v1 ships one: `create_crm_contact`.
 */
export interface FormDestinationContext {
  formId: string;
  workspaceId: string;
  submissionId: string;
  /** The form owner — used to attribute the created contact + automation run. */
  ownerId: string | null;
}

export interface IFormDestination {
  type: string;
  label: string;
  /**
   * Run the destination against the validated submission data + this
   * destination's config. Returns a PII-free result detail for logging.
   */
  run(
    data: Record<string, unknown>,
    config: Record<string, unknown>,
    context: FormDestinationContext,
  ): Promise<Record<string, unknown>>;
}