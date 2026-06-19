/**
 * Shared catalog for the CRM **Automation builder** (CONTEXT.md → Automation
 * builder, ADR-0028). Plain constants, importable from both client (builder UI)
 * and server (validation), with no server-only dependencies.
 *
 * The palette deliberately offers ONLY blocks the Workflow engine can actually
 * run — no faked nodes. Keep these `type` values in sync with the executors
 * registered in `StepRegistry` (`send_email`, `generate_document`,
 * `send_for_signature` once Adobe lands).
 */

export interface CrmAutomationStepDef {
  type: string;
  label: string;
  description: string;
}

export const CRM_AUTOMATION_STEP_CATALOG: CrmAutomationStepDef[] = [
  {
    type: "send_email",
    label: "Send welcome email",
    description: "Branded “you’re signed up” email to the contact.",
  },
  {
    type: "generate_document",
    label: "Generate agreement",
    description: "Fill the per-Customer-type agreement template.",
  },
];

export function stepLabelForType(type: string): string {
  return (
    CRM_AUTOMATION_STEP_CATALOG.find((s) => s.type === type)?.label ?? type
  );
}

export const CRM_AUTOMATION_TRIGGER_LABEL =
  "When a contact’s Customer type is set";

/**
 * Customer-type values a trigger can target. Mirrors the contact form's Profile
 * Type options (Channel Partner / Advisor lead because they drive automations).
 * Customer type is overloaded onto `CrmContact.profileType` for the PoC.
 */
export const CRM_CUSTOMER_TYPE_OPTIONS: string[] = [
  "Channel Partner",
  "Advisor",
  "Developer",
  "Designer",
  "Founder",
  "Product Manager",
  "Investor",
  "Marketing",
  "Sales",
  "Other",
];
