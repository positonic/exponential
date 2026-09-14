"use client";

import { DateTimePicker, type DateTimePickerProps } from "@mantine/dates";

export type DateTimeFieldProps = Omit<
  DateTimePickerProps,
  "value" | "defaultValue" | "onChange" | "popoverProps"
> & {
  value: Date | null;
  onChange: (value: Date | null) => void;
};

/**
 * The app's date+time field. Every place that needs one goes through here so
 * the calendar looks the same everywhere; the paint itself lives in the
 * shared `@mantine/dates` layer (`calendarStyles` / `datePopoverProps` in
 * mantineTheme.ts, state rules in the "@mantine/dates" section of
 * globals.css), never at a call site.
 *
 * Two things this wrapper exists to stop:
 *
 * 1. `popoverProps` is deliberately not forwardable. Mantine merges theme
 *    `defaultProps` SHALLOWLY (`{...defaults, ...props}`), so a call site
 *    passing even `popoverProps={{ withinPortal: true }}` replaced
 *    `datePopoverProps` wholesale and the calendar lost the edge and shadow
 *    that separate it from the surface behind it - inside a Modal, whose
 *    content is the same `bg-elevated` as the dropdown, that left the month
 *    grid floating on nothing. (`withinPortal` is Mantine's default anyway.)
 *    Popover behaviour belongs in the theme; change it there, for everyone.
 *
 * 2. The `Date | null` contract. Mantine's `onChange` value type is not
 *    stable across versions, so every call site was re-wrapping it with the
 *    same `v ? new Date(v) : null`. It is wrapped once, here.
 */
export function DateTimeField({ value, onChange, ...props }: DateTimeFieldProps) {
  return (
    <DateTimePicker
      withSeconds={false}
      {...props}
      value={value}
      onChange={(next) => onChange(next ? new Date(next) : null)}
    />
  );
}
