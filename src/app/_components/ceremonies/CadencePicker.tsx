"use client";

import { Group, Select, Stack, Text, TextInput } from "@mantine/core";
import {
  DEFAULT_CADENCE,
  ORDINALS,
  PRESETS,
  WEEKDAYS,
  buildCadenceRule,
  describeCadence,
  parseCadenceRule,
  type CadenceConfig,
  type CadencePreset,
  type MonthOrdinal,
  type Weekday,
} from "~/lib/ceremonies/cadence";

interface CadencePickerProps {
  /** The stored RRULE body. */
  value: string;
  onChange: (rule: string) => void;
  disabled?: boolean;
}

/**
 * Structured cadence picker (ADR-0059): preset + weekday + time, emitting an
 * RRULE body. A rule the picker cannot express (imported or hand-written) is
 * shown as-is with a plain text field so it is never silently rewritten.
 */
export function CadencePicker({ value, onChange, disabled }: CadencePickerProps) {
  const parsed = parseCadenceRule(value);
  const isCustom = value.trim() !== "" && parsed === null;
  const cfg: CadenceConfig = parsed ?? DEFAULT_CADENCE;

  const set = (patch: Partial<CadenceConfig>) => onChange(buildCadenceRule({ ...cfg, ...patch }));

  if (isCustom) {
    return (
      <Stack gap={4}>
        <TextInput
          label="Cadence (RRULE)"
          description="This rule was written by hand or imported; edit it directly, or clear it to use the picker."
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          size="sm"
        />
      </Stack>
    );
  }

  const needsWeekday = cfg.preset === "weekly" || cfg.preset === "fortnightly" || cfg.preset === "monthly";
  return (
    <Stack gap={4}>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Select
          label="Cadence"
          data={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          value={cfg.preset}
          onChange={(v) => v && set({ preset: v as CadencePreset })}
          allowDeselect={false}
          disabled={disabled}
          size="sm"
          w={170}
        />
        {cfg.preset === "monthly" && (
          <Select
            label="Which"
            data={ORDINALS.map((o) => ({ value: String(o.value), label: o.label }))}
            value={String(cfg.ordinal)}
            onChange={(v) => v && set({ ordinal: Number(v) as MonthOrdinal })}
            allowDeselect={false}
            disabled={disabled}
            size="sm"
            w={110}
          />
        )}
        {needsWeekday && (
          <Select
            label="Day"
            data={WEEKDAYS.map((d) => ({ value: d.value, label: d.label }))}
            value={cfg.weekday}
            onChange={(v) => v && set({ weekday: v as Weekday })}
            allowDeselect={false}
            disabled={disabled}
            size="sm"
            w={140}
          />
        )}
        <TextInput
          label="Time"
          type="time"
          value={cfg.time}
          onChange={(e) => set({ time: e.currentTarget.value })}
          disabled={disabled}
          size="sm"
          w={110}
        />
      </Group>
      <Text size="xs" className="text-text-muted">
        {describeCadence(buildCadenceRule(cfg))}
      </Text>
    </Stack>
  );
}
