"use client";

import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Anchor, Text, Title } from "@mantine/core";

export function ReleaseBody({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src, alt }) =>
          typeof src === "string" ? (
            <Image
              src={src}
              alt={alt ?? ""}
              width={1200}
              height={675}
              unoptimized
              style={{
                width: "100%",
                height: "auto",
                borderRadius: 8,
                margin: "12px 0",
              }}
            />
          ) : null,
        a: ({ href, children }) => (
          <Anchor
            href={typeof href === "string" ? href : "#"}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </Anchor>
        ),
        p: ({ children }) => (
          <Text size="sm" my={6}>
            {children}
          </Text>
        ),
        h1: ({ children }) => (
          <Title order={3} mt="md" mb="xs">
            {children}
          </Title>
        ),
        h2: ({ children }) => (
          <Title order={4} mt="md" mb="xs">
            {children}
          </Title>
        ),
        h3: ({ children }) => (
          <Title order={5} mt="md" mb="xs">
            {children}
          </Title>
        ),
        ul: ({ children }) => (
          <ul style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ul>
        ),
        li: ({ children }) => (
          <li>
            <Text size="sm" component="span">
              {children}
            </Text>
          </li>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
