"use client";

import { useEffect, useRef } from "react";
import { Stack, Text, ThemeIcon } from "@mantine/core";
import { IconInbox, IconCheck } from "@tabler/icons-react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";

// Helper to resolve CSS variables at runtime for canvas-confetti
const getConfettiColors = (): string[] => {
  if (typeof window === "undefined") return [];

  const computedStyle = getComputedStyle(document.documentElement);
  return [
    computedStyle.getPropertyValue("--color-brand-primary").trim(),
    computedStyle.getPropertyValue("--color-brand-success").trim(),
    computedStyle.getPropertyValue("--color-brand-warning").trim(),
    computedStyle.getPropertyValue("--color-brand-error").trim(),
  ].filter(Boolean);
};

export function InboxZeroCelebration() {
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      const colors = getConfettiColors();
      void confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        ...(colors.length > 0 && { colors }),
      });
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center py-16"
    >
      <Stack align="center" gap="lg">
        {/* Icon with checkmark badge */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            delay: 0.2,
            type: "spring",
            stiffness: 200,
            damping: 15,
          }}
          className="relative"
        >
          <ThemeIcon size={80} radius="xl" variant="light" color="green">
            <IconInbox size={40} />
          </ThemeIcon>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            className="absolute -bottom-1 -right-1"
          >
            <ThemeIcon size={32} radius="xl" variant="filled" color="green">
              <IconCheck size={18} />
            </ThemeIcon>
          </motion.div>
        </motion.div>

        {/* Celebration text */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <Text size="xl" fw={700} className="mb-2 text-text-primary">
            Inbox Zero!
          </Text>
          <Text size="sm" className="text-text-secondary">
            All caught up. Great job staying organized!
          </Text>
        </motion.div>
      </Stack>
    </motion.div>
  );
}
