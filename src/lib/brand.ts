/**
 * Brand-level copy helpers.
 *
 * Centralizes the product name and tagline so they can be swapped via env vars
 * (useful for white-label builds or staging deploys that need a different name).
 * Safe to import from both server and client code — values resolve at build
 * time from `NEXT_PUBLIC_*` vars.
 */

const DEFAULT_PRODUCT_NAME = 'Exponential';
const DEFAULT_PRODUCT_SHORT_NAME = 'Exponential';
const DEFAULT_PRODUCT_TAGLINE =
  'The coordination layer for AI-first organizations. Goals cascade into outcomes. AI handles execution. Your team stays aligned.';

export const PRODUCT_NAME: string =
  process.env.NEXT_PUBLIC_PRODUCT_NAME ?? DEFAULT_PRODUCT_NAME;

export const PRODUCT_SHORT_NAME: string =
  process.env.NEXT_PUBLIC_PRODUCT_SHORT_NAME ?? DEFAULT_PRODUCT_SHORT_NAME;

export const PRODUCT_TAGLINE: string =
  process.env.NEXT_PUBLIC_PRODUCT_TAGLINE ?? DEFAULT_PRODUCT_TAGLINE;
