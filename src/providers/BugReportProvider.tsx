"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useConsoleCapture, type ConsoleEntry } from "~/hooks/useConsoleCapture";
import { BugReportModal } from "~/app/_components/BugReportModal";

interface BugReportContextValue {
  openBugReport: () => void;
  closeBugReport: () => void;
  bugReportOpened: boolean;
  getConsoleLogs: () => ConsoleEntry[];
}

const BugReportContext = createContext<BugReportContextValue | null>(null);

export function useBugReport() {
  const ctx = useContext(BugReportContext);
  if (!ctx) {
    throw new Error("useBugReport must be used within BugReportProvider");
  }
  return ctx;
}

export function BugReportProvider({ children }: { children: ReactNode }) {
  const [bugReportOpened, setBugReportOpened] = useState(false);
  const { getEntries } = useConsoleCapture();

  const openBugReport = useCallback(() => setBugReportOpened(true), []);
  const closeBugReport = useCallback(() => setBugReportOpened(false), []);
  const getConsoleLogs = useCallback(() => getEntries(), [getEntries]);

  return (
    <BugReportContext.Provider
      value={{ openBugReport, closeBugReport, bugReportOpened, getConsoleLogs }}
    >
      {children}
      <BugReportModal />
    </BugReportContext.Provider>
  );
}
