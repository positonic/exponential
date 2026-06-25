'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import {
  Title,
  Text,
  Button,
  Group,
  Stack,
  Loader,
  Box,
  Badge,
  Card,
  TextInput,
  Textarea,
  Input,
  Select,
  Switch,
  ActionIcon,
  Anchor,
  TagsInput,
  Divider,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { slugify } from '~/utils/slugify';
import { CRM_CUSTOMER_TYPE_OPTIONS } from '~/lib/crm/automationCatalog';
import { MarkdownInput } from '~/app/_components/shared/MarkdownInput';

type FieldType = 'text' | 'email' | 'textarea' | 'select' | 'checkbox' | 'url';

interface EditorField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
}

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL / link' },
];

const CONTACT_SLOTS = [
  { key: 'email', label: 'Email', required: true },
  { key: 'firstName', label: 'First name', required: false },
  { key: 'lastName', label: 'Last name', required: false },
  { key: 'company', label: 'Company', required: false },
] as const;

type ContactSlot = (typeof CONTACT_SLOTS)[number]['key'];

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export default function FormEditorPage() {
  const params = useParams<{ formId: string }>();
  const id = params.formId;
  const router = useRouter();
  const pathname = usePathname();
  const overviewHref = pathname.split('/').slice(0, -1).join('/');
  const utils = api.useUtils();

  const query = api.form.get.useQuery({ id }, { enabled: !!id });

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [fields, setFields] = useState<EditorField[]>([]);
  const [crmEnabled, setCrmEnabled] = useState(false);
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [fieldMap, setFieldMap] = useState<Record<ContactSlot, string | null>>({
    email: null,
    firstName: null,
    lastName: null,
    company: null,
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setName(data.name);
    setSlug(data.slug);
    setDescription(data.description ?? '');
    setIsActive(data.isActive);
    setConfirmationMessage(data.confirmationMessage ?? '');
    setFields(
      asArray(data.fields).map((f) => {
        const field = f as Partial<EditorField>;
        return {
          key: field.key ?? '',
          label: field.label ?? '',
          type: field.type ?? 'text',
          required: field.required ?? false,
          options: Array.isArray(field.options) ? field.options : [],
        };
      }),
    );
    const crm = asArray(data.destinations).find(
      (d) => (d as { type?: string }).type === 'create_crm_contact',
    ) as { config?: Record<string, unknown> } | undefined;
    if (crm?.config) {
      setCrmEnabled(true);
      setCustomerType(
        typeof crm.config.customerType === 'string'
          ? crm.config.customerType
          : null,
      );
      const map = (crm.config.fieldMap ?? {}) as Record<string, unknown>;
      setFieldMap({
        email: typeof map.email === 'string' ? map.email : null,
        firstName: typeof map.firstName === 'string' ? map.firstName : null,
        lastName: typeof map.lastName === 'string' ? map.lastName : null,
        company: typeof map.company === 'string' ? map.company : null,
      });
    } else {
      setCrmEnabled(false);
    }
    setDirty(false);
  }, [query.data]);

  const save = api.form.update.useMutation({
    onSuccess: () => {
      setDirty(false);
      notifications.show({ title: 'Saved', message: 'Form saved.', color: 'green' });
      void utils.form.get.invalidate({ id });
      void utils.form.list.invalidate();
    },
    onError: (error) =>
      notifications.show({ title: 'Save failed', message: error.message, color: 'red' }),
  });

  const remove = api.form.remove.useMutation({
    onSuccess: () => {
      void utils.form.list.invalidate();
      router.push(overviewHref);
    },
    onError: (error) =>
      notifications.show({ title: 'Could not delete', message: error.message, color: 'red' }),
  });

  const touch = () => setDirty(true);

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { key: '', label: '', type: 'text', required: false, options: [] },
    ]);
    touch();
  };

  const updateField = (index: number, patch: Partial<EditorField>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
    touch();
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
    touch();
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
    touch();
  };

  if (query.isLoading || !query.data) return <Loader />;

  const fieldKeyOptions = fields
    .filter((f) => f.key.trim())
    .map((f) => ({ value: f.key, label: `${f.label || f.key} (${f.key})` }));

  const handleSave = () => {
    const cleanedFields = fields.map((f) => ({
      key: f.key.trim() || slugify(f.label) || 'field',
      label: f.label.trim() || f.key,
      type: f.type,
      required: f.required,
      ...(f.type === 'select' ? { options: f.options } : {}),
    }));
    const destinations = crmEnabled
      ? [
          {
            type: 'create_crm_contact',
            config: {
              customerType: customerType ?? '',
              fieldMap: Object.fromEntries(
                CONTACT_SLOTS.map((s) => [s.key, fieldMap[s.key]]).filter(
                  ([, v]) => v,
                ),
              ),
            },
          },
        ]
      : [];
    save.mutate({
      id,
      name: name.trim() || 'Untitled form',
      description: description.trim() || null,
      fields: cleanedFields,
      destinations,
      isActive,
      confirmationMessage: confirmationMessage.trim() || null,
    });
  };

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Anchor href={overviewHref} c="dimmed" size="sm">
            <Group gap={4}>
              <IconArrowLeft size={14} />
              All forms
            </Group>
          </Anchor>
          <Group gap="xs" mt={4} align="center">
            <Title order={3}>{name || 'Untitled form'}</Title>
            <Badge color={isActive ? 'green' : 'gray'} variant="light">
              {isActive ? 'active' : 'inactive'}
            </Badge>
            <Text c="dimmed" size="sm">
              /f/{slug}
            </Text>
          </Group>
        </Box>
        <Group gap="sm">
          <Switch
            label="Active"
            checked={isActive}
            onChange={(e) => {
              setIsActive(e.currentTarget.checked);
              touch();
            }}
          />
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={16} />}
            loading={remove.isPending}
            onClick={() => remove.mutate({ id })}
          >
            Delete
          </Button>
          <Button loading={save.isPending} disabled={!dirty} onClick={handleSave}>
            Save
          </Button>
        </Group>
      </Group>

      <Group align="flex-end" gap="sm">
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.currentTarget.value);
            touch();
          }}
          w={300}
        />
      </Group>

      <Input.Wrapper
        label="Description"
        description="The job-description body shown above the fields on the public page. Supports Markdown (headings, lists, links, bold)."
      >
        <Box mt={4}>
          <MarkdownInput
            value={description}
            onChange={(value) => {
              setDescription(value);
              touch();
            }}
            placeholder="Describe the role, responsibilities, and how to apply…"
            minRows={4}
            maxRows={16}
          />
        </Box>
      </Input.Wrapper>

      <Card withBorder padding="md">
        <Group justify="space-between" mb="sm">
          <Text fw={600}>Fields</Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={addField}
          >
            Add field
          </Button>
        </Group>
        <Stack gap="sm">
          {fields.length === 0 && (
            <Text c="dimmed" size="sm">
              No fields yet. Add at least one (e.g. an Email field).
            </Text>
          )}
          {fields.map((field, index) => (
            <Card key={index} withBorder padding="sm" bg="surface-secondary">
              <Group align="flex-end" gap="sm" wrap="wrap">
                <TextInput
                  label="Label"
                  value={field.label}
                  onChange={(e) =>
                    updateField(index, {
                      label: e.currentTarget.value,
                      key:
                        field.key.trim() === '' ||
                        field.key === slugify(field.label)
                          ? slugify(e.currentTarget.value)
                          : field.key,
                    })
                  }
                  w={200}
                />
                <TextInput
                  label="Key"
                  value={field.key}
                  onChange={(e) =>
                    updateField(index, { key: e.currentTarget.value })
                  }
                  w={160}
                />
                <Select
                  label="Type"
                  data={FIELD_TYPE_OPTIONS}
                  value={field.type}
                  onChange={(value) =>
                    updateField(index, { type: (value as FieldType) ?? 'text' })
                  }
                  w={150}
                  allowDeselect={false}
                />
                <Switch
                  label="Required"
                  checked={field.required}
                  onChange={(e) =>
                    updateField(index, { required: e.currentTarget.checked })
                  }
                />
                {field.type === 'select' && (
                  <TagsInput
                    label="Options"
                    value={field.options}
                    onChange={(value) => updateField(index, { options: value })}
                    w={220}
                  />
                )}
                <Group gap={2}>
                  <ActionIcon
                    variant="subtle"
                    disabled={index === 0}
                    onClick={() => moveField(index, -1)}
                    aria-label="Move up"
                  >
                    <IconArrowUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    disabled={index === fields.length - 1}
                    onClick={() => moveField(index, 1)}
                    aria-label="Move down"
                  >
                    <IconArrowDown size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => removeField(index)}
                    aria-label="Remove field"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Group justify="space-between" mb="sm">
          <Box>
            <Text fw={600}>When submitted → Create CRM contact</Text>
            <Text c="dimmed" size="xs">
              Creates a contact tagged with the Customer type, firing matching
              automations.
            </Text>
          </Box>
          <Switch
            checked={crmEnabled}
            onChange={(e) => {
              setCrmEnabled(e.currentTarget.checked);
              touch();
            }}
          />
        </Group>
        {crmEnabled && (
          <Stack gap="sm">
            <Select
              label="Customer type"
              placeholder="Select a Customer type"
              data={CRM_CUSTOMER_TYPE_OPTIONS}
              value={customerType}
              onChange={(value) => {
                setCustomerType(value);
                touch();
              }}
              searchable
              w={260}
            />
            <Divider label="Map form fields → contact" labelPosition="left" />
            <Group gap="sm" wrap="wrap">
              {CONTACT_SLOTS.map((slot) => (
                <Select
                  key={slot.key}
                  label={`${slot.label}${slot.required ? ' *' : ''}`}
                  placeholder="Select a field"
                  data={fieldKeyOptions}
                  value={fieldMap[slot.key]}
                  onChange={(value) => {
                    setFieldMap((prev) => ({ ...prev, [slot.key]: value }));
                    touch();
                  }}
                  clearable
                  w={200}
                />
              ))}
            </Group>
          </Stack>
        )}
      </Card>

      <Textarea
        label="Confirmation message"
        description="Shown after a successful submission."
        placeholder="Thanks — we’ve received your application and will be in touch."
        value={confirmationMessage}
        onChange={(e) => {
          setConfirmationMessage(e.currentTarget.value);
          touch();
        }}
        autosize
        minRows={2}
      />
    </Stack>
  );
}
