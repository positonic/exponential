"use client";

import { usePathname } from "next/navigation";
import { IconMessageChatbot } from "@tabler/icons-react";
import { useAgentModal } from "~/providers/AgentModalProvider";

export function FloatingChatButton() {
  const pathname = usePathname();
  const { isOpen, openModal, closeModal, pendingNotification, openModalWithNotification } =
    useAgentModal();

  if (pathname?.includes("/agent")) {
    return null;
  }

  const handleClick = () => {
    if (isOpen) {
      closeModal();
    } else if (pendingNotification) {
      openModalWithNotification();
    } else {
      openModal();
    }
  };

  return (
    <div className="fixed bottom-20 right-6 z-50 sm:bottom-6">
      {/* Speech bubble notification */}
      {pendingNotification && !isOpen && (
        <div className="absolute bottom-full right-0 mb-3 w-48 animate-fade-in">
          <div className="rounded-lg border border-border-primary bg-surface-secondary px-3 py-2 text-xs font-medium text-text-primary shadow-lg">
            {pendingNotification.preview}
          </div>
          {/* Bubble tail */}
          <div className="absolute -bottom-1 right-6 h-2 w-2 rotate-45 border-b border-r border-border-primary bg-surface-secondary" />
        </div>
      )}

      {/* Main button */}
      <button
        onClick={handleClick}
        className={`relative rounded-full border p-4 shadow-lg transition-all duration-200 ${
          isOpen
            ? 'border-brand-primary bg-brand-primary text-white'
            : 'border-brand-primary/30 bg-brand-primary/10 text-brand-primary hover:border-brand-primary/50 hover:bg-brand-primary/20 hover:text-white'
        }`}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        <IconMessageChatbot size={24} />
        {/* Notification dot */}
        {pendingNotification && !isOpen && (
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background-primary bg-brand-primary" />
        )}
      </button>
    </div>
  );
}
