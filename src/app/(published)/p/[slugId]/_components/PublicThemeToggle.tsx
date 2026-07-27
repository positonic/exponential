"use client";

import {
  ActionIcon,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";

/**
 * The very-visible light/dark switch on Published pages (ADR-0038). The page
 * defaults to the visitor's system scheme; a click pins the opposite scheme
 * (persisted by Mantine in localStorage).
 */
export function PublicThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  // Resolve in an effect so SSR (which can't know the visitor's scheme) and
  // the first client render agree — avoids a hydration mismatch on the icon.
  const computed = useComputedColorScheme("dark", {
    getInitialValueInEffect: true,
  });

  return (
    <ActionIcon
      variant="default"
      size="lg"
      radius="xl"
      aria-label="Toggle light/dark mode"
      onClick={() => setColorScheme(computed === "dark" ? "light" : "dark")}
    >
      {computed === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}
