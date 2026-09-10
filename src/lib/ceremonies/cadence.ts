/**
 * Structured cadence ⇄ RRULE (ADR-0059). The Settings → Ceremonies editor
 * offers a small picker (daily / weekdays / weekly / fortnightly / monthly,
 * weekday and time) and stores the result as a bare RRULE body; anything the
 * picker cannot express is kept verbatim as a "custom" rule. Pure and shared
 * by client and server.
 */

export type CadencePreset = "daily" | "weekdays" | "weekly" | "fortnightly" | "monthly";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
/** Which weekday of the month a monthly ceremony falls on; -1 = last. */
export type MonthOrdinal = 1 | 2 | 3 | 4 | -1;

export interface CadenceConfig {
  preset: CadencePreset;
  /** Used by weekly / fortnightly / monthly. */
  weekday: Weekday;
  /** Used by monthly. */
  ordinal: MonthOrdinal;
  /** Local wall-clock time in the ceremony's zone, `HH:MM`. */
  time: string;
}

export const WEEKDAYS: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: "MO", label: "Monday" },
  { value: "TU", label: "Tuesday" },
  { value: "WE", label: "Wednesday" },
  { value: "TH", label: "Thursday" },
  { value: "FR", label: "Friday" },
  { value: "SA", label: "Saturday" },
  { value: "SU", label: "Sunday" },
];

export const PRESETS: ReadonlyArray<{ value: CadencePreset; label: string }> = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
];

export const ORDINALS: ReadonlyArray<{ value: MonthOrdinal; label: string }> = [
  { value: 1, label: "first" },
  { value: 2, label: "second" },
  { value: 3, label: "third" },
  { value: 4, label: "fourth" },
  { value: -1, label: "last" },
];

export const DEFAULT_CADENCE: CadenceConfig = {
  preset: "weekly",
  weekday: "MO",
  ordinal: 1,
  time: "09:00",
};

function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const hour = m ? Number(m[1]) : 9;
  const minute = m ? Number(m[2]) : 0;
  return {
    hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 9,
    minute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? minute : 0,
  };
}

/** Build the RRULE body for a structured cadence. */
export function buildCadenceRule(cfg: CadenceConfig): string {
  const { hour, minute } = parseTime(cfg.time);
  const time = `BYHOUR=${hour};BYMINUTE=${minute}`;
  switch (cfg.preset) {
    case "daily":
      return `FREQ=DAILY;${time}`;
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;${time}`;
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${cfg.weekday};${time}`;
    case "fortnightly":
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${cfg.weekday};${time}`;
    case "monthly":
      return `FREQ=MONTHLY;BYDAY=${cfg.ordinal}${cfg.weekday};${time}`;
  }
}

function parts(rule: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of rule.trim().replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = part.split("=");
    if (k && v !== undefined) map.set(k.toUpperCase(), v.toUpperCase());
  }
  return map;
}

const WEEKDAY_SET = new Set<string>(WEEKDAYS.map((w) => w.value));

/**
 * Recover the structured config from a rule the picker produced. Returns
 * null for anything else (a hand-written or imported rule), which the editor
 * shows as "custom" and leaves untouched.
 */
export function parseCadenceRule(rule: string): CadenceConfig | null {
  const p = parts(rule);
  const freq = p.get("FREQ");
  if (!freq) return null;
  const hour = Number(p.get("BYHOUR") ?? "0");
  const minute = Number(p.get("BYMINUTE") ?? "0");
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const interval = Number(p.get("INTERVAL") ?? "1");
  const byday = p.get("BYDAY");
  const allowed = new Set(["FREQ", "INTERVAL", "BYDAY", "BYHOUR", "BYMINUTE"]);
  for (const key of p.keys()) if (!allowed.has(key)) return null;

  if (freq === "DAILY" && interval === 1 && !byday) {
    return { ...DEFAULT_CADENCE, preset: "daily", time };
  }
  if (freq === "WEEKLY" && byday) {
    if (interval === 1 && byday === "MO,TU,WE,TH,FR") {
      return { ...DEFAULT_CADENCE, preset: "weekdays", time };
    }
    if (WEEKDAY_SET.has(byday) && (interval === 1 || interval === 2)) {
      return {
        ...DEFAULT_CADENCE,
        preset: interval === 2 ? "fortnightly" : "weekly",
        weekday: byday as Weekday,
        time,
      };
    }
  }
  if (freq === "MONTHLY" && byday && interval === 1) {
    const m = /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/.exec(byday);
    if (m) {
      return {
        preset: "monthly",
        ordinal: Number(m[1]) as MonthOrdinal,
        weekday: m[2] as Weekday,
        time,
      };
    }
  }
  return null;
}

function weekdayLabel(w: Weekday): string {
  return WEEKDAYS.find((d) => d.value === w)?.label ?? w;
}

/** Human description of a rule: "Every weekday at 09:00", or the raw rule when custom. */
export function describeCadence(rule: string): string {
  const cfg = parseCadenceRule(rule);
  if (!cfg) return rule.replace(/^RRULE:/i, "");
  switch (cfg.preset) {
    case "daily":
      return `Every day at ${cfg.time}`;
    case "weekdays":
      return `Every weekday at ${cfg.time}`;
    case "weekly":
      return `Weekly on ${weekdayLabel(cfg.weekday)} at ${cfg.time}`;
    case "fortnightly":
      return `Every two weeks on ${weekdayLabel(cfg.weekday)} at ${cfg.time}`;
    case "monthly": {
      const ord = ORDINALS.find((o) => o.value === cfg.ordinal)?.label ?? String(cfg.ordinal);
      return `Monthly on the ${ord} ${weekdayLabel(cfg.weekday)} at ${cfg.time}`;
    }
  }
}
