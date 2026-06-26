'use client';

import { useEffect, useState } from 'react';
import {
  Container,
  Card,
  Title,
  Text,
  Stack,
  TextInput,
  Textarea,
  Select,
  Checkbox,
  Button,
  ThemeIcon,
  Alert,
  Group,
  Anchor,
} from '@mantine/core';
import { IconCircleCheck } from '@tabler/icons-react';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { loadDraft, saveDraft, clearDraft } from './formDraft';

interface PublicField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'textarea' | 'select' | 'checkbox' | 'url';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface PublicFormProps {
  slug: string;
  name: string;
  description: string | null;
  fields: PublicField[];
  confirmationMessage: string | null;
}

export function PublicForm({
  slug,
  name,
  description,
  fields,
  confirmationMessage,
}: PublicFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // Form draft (CONTEXT.md ### Forms): restore in-progress answers from
  // localStorage on load, then persist them debounced as the applicant types.
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const setValue = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Restore once on mount (client-only — runs after hydration to avoid a
  // server/client mismatch). `hydrated` gates the save effect so its first
  // pass — which still sees the initial empty values — never overwrites the
  // draft we're about to load.
  useEffect(() => {
    const draft = loadDraft(slug);
    if (draft) {
      setValues(draft);
      setRestored(true);
    }
    setHydrated(true);
  }, [slug]);

  // Persist answers debounced; honeypot lives in its own state and is never
  // included in `values`, so it's never written to the draft.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => saveDraft(slug, values), 500);
    return () => clearTimeout(timer);
  }, [values, slug, hydrated]);

  const handleClearDraft = () => {
    clearDraft(slug);
    setValues({});
    setErrors({});
    setRestored(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setGeneralError(null);
    setErrors({});
    try {
      const res = await fetch(`/api/forms/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values, honeypot }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        errors?: Record<string, string>;
        error?: string;
        confirmationMessage?: string | null;
      };
      if (res.ok && body.ok) {
        clearDraft(slug);
        setRestored(false);
        setDone(
          body.confirmationMessage ??
            confirmationMessage ??
            'Thanks — we’ve received your submission.',
        );
      } else if (res.status === 422 && body.errors) {
        setErrors(body.errors);
      } else {
        setGeneralError(body.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setGeneralError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Container size="sm" py={64}>
        <Card withBorder padding="xl">
          <Stack align="center" gap="md">
            <ThemeIcon size="xl" radius="xl" color="green" variant="light">
              <IconCircleCheck />
            </ThemeIcon>
            <Title order={3}>Submitted</Title>
            <Text c="dimmed" ta="center">
              {done}
            </Text>
          </Stack>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="sm" py={64}>
      <Card withBorder padding="xl">
        <Stack gap="xs" mb="md">
          <Title order={2}>{name}</Title>
          {description && (
            <MarkdownRenderer content={description} variant="prose" />
          )}
        </Stack>
        {restored && (
          <Alert
            variant="light"
            color="blue"
            withCloseButton
            onClose={() => setRestored(false)}
            mb="md"
          >
            <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
              <Text size="sm">Restored your saved answers on this device.</Text>
              <Anchor
                component="button"
                type="button"
                size="sm"
                onClick={handleClearDraft}
              >
                Clear
              </Anchor>
            </Group>
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            {fields.map((field) => {
              const common = {
                key: field.key,
                label: field.label,
                required: field.required,
                error: errors[field.key],
                placeholder: field.placeholder,
              };
              const value =
                typeof values[field.key] === 'string'
                  ? (values[field.key] as string)
                  : '';

              if (field.type === 'textarea') {
                return (
                  <Textarea
                    {...common}
                    key={field.key}
                    autosize
                    minRows={3}
                    value={value}
                    onChange={(e) => setValue(field.key, e.currentTarget.value)}
                  />
                );
              }
              if (field.type === 'select') {
                return (
                  <Select
                    {...common}
                    key={field.key}
                    data={field.options ?? []}
                    value={(values[field.key] as string) ?? null}
                    onChange={(v) => setValue(field.key, v ?? '')}
                  />
                );
              }
              if (field.type === 'checkbox') {
                return (
                  <Checkbox
                    key={field.key}
                    label={field.label}
                    required={field.required}
                    error={errors[field.key]}
                    checked={values[field.key] === true}
                    onChange={(e) =>
                      setValue(field.key, e.currentTarget.checked)
                    }
                  />
                );
              }
              return (
                <TextInput
                  {...common}
                  key={field.key}
                  type={field.type === 'email' ? 'email' : 'text'}
                  value={value}
                  onChange={(e) => setValue(field.key, e.currentTarget.value)}
                />
              );
            })}

            {/* Honeypot — hidden from humans, bots fill it. */}
            <input
              type="text"
              name="_company_url"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.currentTarget.value)}
              style={{
                position: 'absolute',
                left: '-9999px',
                width: 1,
                height: 1,
                opacity: 0,
              }}
              aria-hidden="true"
            />

            {generalError && (
              <Text c="red" size="sm">
                {generalError}
              </Text>
            )}

            <Button type="submit" loading={submitting}>
              Submit
            </Button>
          </Stack>
        </form>
      </Card>
    </Container>
  );
}