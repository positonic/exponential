"use client";

import { useState } from "react";
import { ActionIcon, Image, Modal } from "@mantine/core";
import { IconX } from "@tabler/icons-react";

interface MarkdownImageProps {
  src?: string;
  alt?: string;
  /** When provided, an owner can remove this image (used in comments). */
  onDelete?: (url: string) => void;
}

/**
 * Inline image for the compact Markdown variant: a thumbnail that opens a
 * lightbox, with an optional owner-only delete affordance. Mirrors the
 * behaviour of the legacy InlineImageRenderer so switching comments to the
 * canonical Markdown renderer is not a regression (ADR-0017).
 */
export function MarkdownImage({ src, alt, onDelete }: MarkdownImageProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  if (!src) return null;

  return (
    <span className="group/img relative my-1 inline-block">
      <span className="cursor-pointer" onClick={() => setLightboxOpen(true)}>
        <Image
          src={src}
          alt={alt ?? "image"}
          h={120}
          w="auto"
          fit="cover"
          radius="sm"
          className="border border-border-primary transition-colors hover:border-brand-primary"
        />
      </span>
      {onDelete && (
        <ActionIcon
          size="xs"
          variant="filled"
          color="red"
          radius="xl"
          className="absolute right-1 top-1 opacity-0 transition-opacity group-hover/img:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(src);
          }}
          aria-label="Delete image"
        >
          <IconX size={12} />
        </ActionIcon>
      )}
      <Modal
        opened={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        size="xl"
        centered
        withCloseButton={false}
        classNames={{
          body: "p-0",
          content: "bg-transparent shadow-none",
        }}
        overlayProps={{ backgroundOpacity: 0.8 }}
      >
        <Image src={src} alt="Full size" fit="contain" radius="md" />
      </Modal>
    </span>
  );
}
