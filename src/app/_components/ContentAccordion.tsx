'use client';

import { Accordion, Paper, Title, Text } from '@mantine/core';
import ReactMarkdown, { Components } from 'react-markdown';
import { type ReactNode } from 'react';

interface ContentAccordionProps {
  title: string;
  content: string;
  subtitle?: ReactNode;
  useMarkdown?: boolean;
}

interface MarkdownProps {
  children: ReactNode;
}

const markdownComponents: Partial<Components> = {
  h2: ({ children, ...props }) => (
    <Title order={2} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  h3: ({ children, ...props }) => (
    <Title order={3} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  h4: ({ children, ...props }) => (
    <Title order={4} mt="md" mb="xs" {...props}>
      {children}
    </Title>
  ),
  ul: ({ children, ...props }) => (
    <ul className="mb-4 list-disc pl-6" {...props}>{children}</ul>
  ),
  li: ({ children, ...props }) => <li className="mb-2" {...props}>{children}</li>,
  p: ({ children, ...props }: React.HTMLProps<HTMLParagraphElement>) => (
    <Text size="sm" mb="md">
      {children}
    </Text>
  )
};

export function ContentAccordion({ 
  title, 
  content,
  subtitle,
  useMarkdown = true 
}: ContentAccordionProps) {
  return (
    <Accordion>
      <Accordion.Item value={title.toLowerCase()}>
        <Accordion.Control>
          <h2 className="text-xl font-semibold">{title}</h2>
          {subtitle}
        </Accordion.Control>
        <Accordion.Panel>
          <Paper shadow="sm" p="md" radius="md" withBorder>
            {useMarkdown ? (
              <ReactMarkdown components={markdownComponents}>
                {content}
              </ReactMarkdown>
            ) : (
              <div className="space-y-4">{content}</div>
            )}
          </Paper>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
} 