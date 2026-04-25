/**
 * Period utility functions for OKR pairing
 */

/**
 * Period type for the OKR dashboard period selector.
 * - Q1-Q4: Individual quarters
 * - Year: Annual view only
 * - Q1-Annual through Q4-Annual: Combined quarter + annual view
 */
export type PeriodType =
  | "Q1"
  | "Q2"
  | "Q3"
  | "Q4"
  | "Year"
  | "Q1-Annual"
  | "Q2-Annual"
  | "Q3-Annual"
  | "Q4-Annual";

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

/**
 * Get the current year as a string.
 */
export function getCurrentYear(): string {
  return new Date().getFullYear().toString();
}

/**
 * Get the current quarter as a PeriodType (Q1, Q2, Q3, or Q4).
 */
export function getCurrentQuarterType(): PeriodType {
  const quarter = Math.ceil((new Date().getMonth() + 1) / 3);
  return `Q${quarter}` as PeriodType;
}

/**
 * Build a period string (e.g., "Q1-2026") from year and period type.
 * For combined types like "Q1-Annual", returns the quarter period.
 */
export function buildPeriodString(year: string, periodType: PeriodType): string {
  if (periodType === "Year") {
    return `Annual-${year}`;
  }
  if (periodType.includes("-Annual")) {
    const base = periodType.split("-")[0];
    return `${base}-${year}`;
  }
  return `${periodType}-${year}`;
}

/**
 * Check if a period type represents a combined (quarterly + annual) view.
 */
export function isCombinedPeriodType(periodType: PeriodType): boolean {
  return periodType.includes("-Annual");
}

/**
 * Extract unique years from a list of periods.
 * @example extractYearsFromPeriods([{value: "Q1-2026"}, {value: "Q2-2025"}]) => ["2026", "2025"]
 */
export function extractYearsFromPeriods(
  periods: { value: string }[]
): string[] {
  const years = new Set<string>();
  periods.forEach((p) => {
    const match = p.value.match(/-(\d{4})$/);
    if (match?.[1]) years.add(match[1]);
  });
  return Array.from(years).sort((a, b) => Number(b) - Number(a));
}
