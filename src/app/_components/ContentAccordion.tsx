'use client';

import { Accordion, Paper, Title, Text, Group } from '@mantine/core';
import ReactMarkdown, { type Components } from 'react-markdown';
import { type ReactNode } from 'react';
import { CopyButton } from './CopyButton';

interface ContentAccordionProps {
  title: string;
  content: string;
  subtitle?: ReactNode;
  useMarkdown?: boolean;
  showCopyButton?: boolean;
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
  p: ({ children, ..._props }: React.HTMLProps<HTMLParagraphElement>) => (
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
          <Group justify="space-between" align="center" w="100%">
            <div>
              <h2 className="text-xl font-semibold">{_props.title}</h2>
              {_props.subtitle}
            </div>
            {_props.showCopyButton && (
              <CopyButton 
                text={_props.content} 
                variant="icon" 
                size="sm"
                tooltipLabel={`Copy ${_props.title.toLowerCase()}`}
              />
            )}
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Paper shadow="sm" p="md" radius="md" withBorder>
            {_props.showCopyButton && (
              <Group justify="flex-end" mb="md">
                <CopyButton 
                  text={_props.content}
                  label="Copy Content"
                  size="xs"
                />
              </Group>
            )}
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