"use client";

import { ActionIcon, Button, Tooltip } from "@mantine/core";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { useState } from "react";

interface CopyButtonProps {
  text: string;
  variant?: "button" | "icon";
  size?: "xs" | "sm" | "md" | "lg";
  color?: string;
  label?: string;
  tooltipLabel?: string;
  className?: string;
}

export function CopyButton({ 
  text, 
  variant = "button",
  size = "sm",
  color = "gray",
  label = "Copy",
  tooltipLabel = "Copy to clipboard",
  className
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  if (variant === "icon") {
    return (
      <Tooltip label={copied ? "Copied!" : tooltipLabel}>
        <ActionIcon
          variant="subtle"
          size={size}
          color={copied ? "green" : color}
          onClick={copyToClipboard}
          className={className}
        >
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="subtle"
      size={size}
      color={copied ? "green" : color}
      leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      onClick={copyToClipboard}
      className={className}
    >
      {copied ? 'Copied!' : label}
    </Button>
  );
}