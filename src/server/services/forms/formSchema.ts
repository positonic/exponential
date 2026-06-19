import { z } from "zod";

/**
 * Generic Forms field + destination schema and the pure submission validator
 * (CONTEXT.md → Forms, ADR-0029). A Form's fields and destinations are stored as
 * JSON; these types/schemas parse that JSON, and `validateSubmission` validates a
 * public submission against the field definitions. Pure — no I/O — so it is
 * unit-tested in isolation.
 */

export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "textarea",
  "select",
  "checkbox",
  "url",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface FormDestinationConfig {
  type: string;
  config: Record<string, unknown>;
}

export const formFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_]+$/, "Key may only contain letters, numbers, _"),
  label: z.string().min(1).max(200),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string()).optional(),
  placeholder: z.string().max(200).optional(),
});

export const formDestinationSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.unknown()),
});

const MAX_TEXT_LENGTH = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidateSubmissionResult =
  | { ok: true; clean: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

/**
 * Validate a raw submission against a form's fields. Unknown keys are dropped;
 * the returned `clean` is keyed by `field.key`. On any error, returns all field
 * errors at once.
 */
export function validateSubmission(
  fields: FormField[],
  data: Record<string, unknown>,
): ValidateSubmissionResult {
  const errors: Record<string, string> = {};
  const clean: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = data[field.key];

    if (field.type === "checkbox") {
      const value = raw === true || raw === "true" || raw === "on";
      if (field.required && !value) {
        errors[field.key] = `${field.label} is required`;
      } else {
        clean[field.key] = value;
      }
      continue;
    }

    const str = typeof raw === "string" ? raw.trim() : "";
    if (!str) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      else clean[field.key] = "";
      continue;
    }
    if (str.length > MAX_TEXT_LENGTH) {
      errors[field.key] = `${field.label} is too long`;
      continue;
    }

    switch (field.type) {
      case "email": {
        const lower = str.toLowerCase();
        if (!EMAIL_RE.test(lower)) {
          errors[field.key] = `${field.label} must be a valid email`;
        } else {
          clean[field.key] = lower;
        }
        break;
      }
      case "url": {
        let valid = false;
        try {
          const url = new URL(str);
          valid = url.protocol === "http:" || url.protocol === "https:";
        } catch {
          valid = false;
        }
        if (!valid) errors[field.key] = `${field.label} must be a valid URL`;
        else clean[field.key] = str;
        break;
      }
      case "select": {
        if (!field.options?.includes(str)) {
          errors[field.key] = `${field.label} is not a valid option`;
        } else {
          clean[field.key] = str;
        }
        break;
      }
      default:
        clean[field.key] = str;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, clean };
}

/** Parse a Form's stored `fields` JSON into typed FormFields (lenient on read). */
export function parseFormFields(value: unknown): FormField[] {
  const result = z.array(formFieldSchema).safeParse(value);
  return result.success ? result.data : [];
}

/** Parse a Form's stored `destinations` JSON. */
export function parseFormDestinations(value: unknown): FormDestinationConfig[] {
  const result = z.array(formDestinationSchema).safeParse(value);
  return result.success ? result.data : [];
}