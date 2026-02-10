"use client";

import { usePathname } from "next/navigation";
import { IconSparkles } from "@tabler/icons-react";
import { useAgentModal } from "~/providers/AgentModalProvider";

export function FloatingChatButton() {
  const pathname = usePathname();
  const { openModal } = useAgentModal();

  if (pathname?.includes("/agent")) {
    return null;
  }

  return (
    <button
      onClick={() => openModal()}
      className="fixed bottom-20 right-6 z-50 rounded-full border border-brand-primary/30 bg-brand-primary/10 p-4 text-brand-primary transition-all duration-200 hover:border-brand-primary/50 hover:bg-brand-primary/20 hover:text-white sm:bottom-6"
      aria-label="Open AI Assistant"
    >
      <IconSparkles size={24} />
    </button>
  );
}
