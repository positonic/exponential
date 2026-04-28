"use client";

import { IconPlus } from "@tabler/icons-react";
import { CreateActionModal } from "../CreateActionModal";
import styles from "./MobileToday.module.css";

export function MobileFAB() {
  return (
    <CreateActionModal viewName="today">
      <button type="button" className={styles.fab} aria-label="Create action">
        <IconPlus size={28} stroke={2.5} />
      </button>
    </CreateActionModal>
  );
}
