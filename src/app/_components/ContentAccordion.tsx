'use client';

import { Accordion, Paper, Title, Text } from '@mantine/core';
import ReactMarkdown, { type Components } from 'react-markdown';
import { type ReactNode } from 'react';

interface ContentAccordionProps {
  title: string;
  content: string;
  subtitle?: ReactNode;
  useMarkdown?: boolean;
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

export function ContentAccordion(_props: ContentAccordionProps) {
  return (
    <Accordion>
      <Accordion.Item value={_props.title.toLowerCase()}>
        <Accordion.Control>
          <h2 className="text-xl font-semibold">{_props.title}</h2>
          {_props.subtitle}
        </Accordion.Control>
        <Accordion.Panel>
          <Paper shadow="sm" p="md" radius="md" withBorder>
            {_props.useMarkdown ? (
              <ReactMarkdown components={markdownComponents}>
                {_props.content}
              </ReactMarkdown>
            ) : (
              <div className="space-y-4">{_props.content}</div>
            )}
          </Paper>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
} 