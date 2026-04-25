import {
  IconCircleCheckFilled,
  IconAlertTriangleFilled,
  IconAlertCircleFilled,
  IconClockFilled,
} from "@tabler/icons-react";

export type HealthStatus = "on-track" | "at-risk" | "off-track" | "no-update";

export const healthConfig: Record<
  HealthStatus,
  { color: string; mantineColor: string; icon: typeof IconCircleCheckFilled; label: string }
> = {
  "on-track": {
    color: "var(--mantine-color-green-6)",
    mantineColor: "green",
    icon: IconCircleCheckFilled,
    label: "On track",
  },
  "at-risk": {
    color: "var(--mantine-color-yellow-6)",
    mantineColor: "yellow",
    icon: IconAlertTriangleFilled,
    label: "At risk",
  },
  "off-track": {
    color: "var(--mantine-color-red-6)",
    mantineColor: "red",
    icon: IconAlertCircleFilled,
    label: "Off track",
  },
  "no-update": {
    color: "var(--mantine-color-gray-6)",
    mantineColor: "gray",
    icon: IconClockFilled,
    label: "No update",
  },
};
