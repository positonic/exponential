/**
 * Period utility functions for OKR pairing
 */

/**
 * Get the parent annual period for a given quarter or half-year period.
 * @example getParentPeriod("Q1-2026") => "Annual-2026"
 * @example getParentPeriod("H1-2026") => "Annual-2026"
 */
export function getParentPeriod(period: string): string | null {
  const match = period.match(/^(Q[1-4]|H[12])-(\d{4})$/);
  if (!match) return null;
  return `Annual-${match[2]}`;
}

/**
 * Get the quarters for an annual or half-year period.
 * @example getQuartersForPeriod("Annual-2026") => ["Q1-2026", "Q2-2026", "Q3-2026", "Q4-2026"]
 * @example getQuartersForPeriod("H1-2026") => ["Q1-2026", "Q2-2026"]
 */
export function getQuartersForPeriod(period: string): string[] {
  const match = period.match(/^(Annual|H[12])-(\d{4})$/);
  if (!match) return [];
  const [, type, year] = match;
  if (type === "Annual")
    return [`Q1-${year}`, `Q2-${year}`, `Q3-${year}`, `Q4-${year}`];
  if (type === "H1") return [`Q1-${year}`, `Q2-${year}`];
  if (type === "H2") return [`Q3-${year}`, `Q4-${year}`];
  return [];
}

/**
 * Check if a period is a quarterly period (Q1, Q2, Q3, Q4).
 */
export function isQuarterlyPeriod(period: string): boolean {
  return /^Q[1-4]-\d{4}$/.test(period);
}

/**
 * Check if a period is an annual period.
 */
export function isAnnualPeriod(period: string): boolean {
  return /^Annual-\d{4}$/.test(period);
}

/**
 * Check if a period is a half-year period (H1, H2).
 */
export function isHalfYearPeriod(period: string): boolean {
  return /^H[12]-\d{4}$/.test(period);
}

/**
 * Get a friendly display name for a period.
 * @example getPeriodDisplayName("Q1-2026") => "Q1 2026"
 * @example getPeriodDisplayName("Annual-2026") => "Annual 2026"
 */
export function getPeriodDisplayName(period: string): string {
  return period.replace("-", " ");
}
