"use client";

import { IconPlus } from "@tabler/icons-react";
import { useAiCapabilities } from "~/providers/AiCapabilitiesProvider";
import { CreateActionModal } from "../CreateActionModal";
import styles from "./MobileToday.module.css";

export function MobileFAB() {
  // Same condition ZoeFab renders on: with the assistant launcher in the
  // bottom-right corner, this button stacks above it rather than under it.
  const { assistant: hasAssistantLauncher } = useAiCapabilities();

  return (
    <CreateActionModal viewName="today">
      <button
        type="button"
        className={styles.fab}
        aria-label="Create action"
        data-above-launcher={hasAssistantLauncher ? "" : undefined}
      >
        <IconPlus size={28} stroke={2.5} />
      </button>
    </CreateActionModal>
  );
}
