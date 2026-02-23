"use client";

import { type ReactNode, useState } from "react";
import { Badge, Image, Modal } from "@mantine/core";

/** Combined regex: images first, then mentions — processed in document order */
const COMBINED_REGEX =
  /!\[([^\]]*)\]\(([^)]+)\)|@\[([^\]]+)\](?:\([^)]+\))?/g;

interface InlineImageRendererProps {
  content: string;
  mentionNames?: string[];
}

export function InlineImageRenderer({
  content,
  mentionNames = [],
}: InlineImageRendererProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const mentionSet = new Set(mentionNames.map((n) => n.toLowerCase()));
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  COMBINED_REGEX.lastIndex = 0;

  while ((match = COMBINED_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }

    if (match[0].startsWith("!")) {
      // Image match: match[1] = alt, match[2] = url
      const alt = match[1] ?? "image";
      const url = match[2]!;
      parts.push(
        <span
          key={`img-${match.index}`}
          className="inline-block my-1 cursor-pointer"
          onClick={() => setLightboxUrl(url)}
        >
          <Image
            src={url}
            alt={alt}
            h={120}
            w="auto"
            fit="cover"
            radius="sm"
            className="border border-border-primary hover:border-brand-primary transition-colors"
          />
        </span>,
      );
    } else {
      // Mention match: match[3] = name
      const name = match[3]!;
      if (mentionSet.has(name.toLowerCase())) {
        parts.push(
          <Badge
            key={`mention-${match.index}`}
            size="xs"
            variant="light"
            color="blue"
            className="mx-0.5 align-middle"
          >
            @{name}
          </Badge>,
        );
      } else {
        parts.push(match[0]);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return (
    <>
      <div className="whitespace-pre-wrap">
        {parts.length > 0 ? parts : content}
      </div>
      <Modal
        opened={lightboxUrl !== null}
        onClose={() => setLightboxUrl(null)}
        size="xl"
        centered
        withCloseButton={false}
        classNames={{
          body: "p-0",
          content: "bg-transparent shadow-none",
        }}
        overlayProps={{ backgroundOpacity: 0.8 }}
      >
        {lightboxUrl && (
          <Image
            src={lightboxUrl}
            alt="Full size"
            fit="contain"
            radius="md"
          />
        )}
      </Modal>
    </>
  );
}
