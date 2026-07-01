'use client';

import { useEffect, useRef, useState } from 'react';
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
  IconExternalLink,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { slugify } from '~/utils/slugify';
import { CRM_CUSTOMER_TYPE_OPTIONS } from '~/lib/crm/automationCatalog';
import { MarkdownInput } from '~/app/_components/shared/MarkdownInput';
import { useWorkspace } from '~/providers/WorkspaceProvider';

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

// create_insight (ADR-0037): a form lands a raw Insight in INBOX. A form must
// NEVER produce a `PROBLEM` — that is a triaged state reached only by a human —
// so PROBLEM is intentionally absent from the picker (the destination also
// coerces it to FEEDBACK defensively).
const INSIGHT_TYPE_OPTIONS = [
  { value: 'FEEDBACK', label: 'Feedback' },
  { value: 'PAIN_POINT', label: 'Pain point' },
  { value: 'OPPORTUNITY', label: 'Opportunity' },
  { value: 'PERSONA', label: 'Persona' },
  { value: 'JOURNEY', label: 'Journey' },
  { value: 'OBSERVATION', label: 'Observation' },
  { value: 'COMPETITIVE', label: 'Competitive' },
] as const;

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

  // Don't refetch this editor query on window focus: a focus refetch while the
  // user is mid-edit was wiping unsaved changes (see hydration effect below).
  const query = api.form.get.useQuery(
    { id },
    { enabled: !!id, refetchOnWindowFocus: false },
  );

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
  // create_deal destination (ADR-0033): upsert applicant + drop a card on a pipeline.
  const [dealEnabled, setDealEnabled] = useState(false);
  const [dealPipelineId, setDealPipelineId] = useState<string | null>(null);
  const [dealStageId, setDealStageId] = useState<string | null>(null);
  const [dealCustomerType, setDealCustomerType] = useState<string | null>(null);
  const [dealTitleTemplate, setDealTitleTemplate] = useState('');
  const [dealFieldMap, setDealFieldMap] = useState<
    Record<ContactSlot, string | null>
  >({ email: null, firstName: null, lastName: null, company: null });
  // create_insight destination (ADR-0037): land a raw product Insight in INBOX.
  const [insightEnabled, setInsightEnabled] = useState(false);
  const [insightProductId, setInsightProductId] = useState<string | null>(null);
  const [insightType, setInsightType] = useState<string | null>('FEEDBACK');
  const [insightTitleField, setInsightTitleField] = useState<string | null>(
    null,
  );
  const [insightBodyField, setInsightBodyField] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Mirror `dirty` in a ref so the hydration effect can read it without
  // re-subscribing to it. We only re-hydrate from the server when there are
  // no unsaved local edits.
  const dirtyRef = useRef(false);
  const markDirty = (value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  };

  const { workspaceId } = useWorkspace();
  const { data: pipelines } = api.pipeline.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId },
  );
  const dealStages =
    pipelines?.find((p) => p.id === dealPipelineId)?.pipelineStages ?? [];
  // Products for the create_insight target picker — scoped to this form's
  // workspace (the destination re-checks the product belongs to it at submit).
  const { data: products } = api.product.product.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId },
  );

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    // A background refetch (e.g. switching tabs and back) produces a new
    // `query.data` reference and re-runs this effect. If the user has unsaved
    // edits, re-hydrating here would silently wipe them, so skip while dirty.
    // First load and post-save refetches run with dirty=false.
    if (dirtyRef.current) return;
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
    const deal = asArray(data.destinations).find(
      (d) => (d as { type?: string }).type === 'create_deal',
    ) as { config?: Record<string, unknown> } | undefined;
    if (deal?.config) {
      setDealEnabled(true);
      setDealPipelineId(
        typeof deal.config.pipelineId === 'string'
          ? deal.config.pipelineId
          : null,
      );
      setDealStageId(
        typeof deal.config.stageId === 'string' ? deal.config.stageId : null,
      );
      setDealCustomerType(
        typeof deal.config.customerType === 'string'
          ? deal.config.customerType
          : null,
      );
      setDealTitleTemplate(
        typeof deal.config.dealTitleTemplate === 'string'
          ? deal.config.dealTitleTemplate
          : '',
      );
      const dmap = (deal.config.contactFieldMap ?? {}) as Record<
        string,
        unknown
      >;
      setDealFieldMap({
        email: typeof dmap.email === 'string' ? dmap.email : null,
        firstName: typeof dmap.firstName === 'string' ? dmap.firstName : null,
        lastName: typeof dmap.lastName === 'string' ? dmap.lastName : null,
        company: typeof dmap.company === 'string' ? dmap.company : null,
      });
    } else {
      setDealEnabled(false);
    }
    const insight = asArray(data.destinations).find(
      (d) => (d as { type?: string }).type === 'create_insight',
    ) as { config?: Record<string, unknown> } | undefined;
    if (insight?.config) {
      setInsightEnabled(true);
      setInsightProductId(
        typeof insight.config.productId === 'string'
          ? insight.config.productId
          : null,
      );
      setInsightType(
        typeof insight.config.insightType === 'string'
          ? insight.config.insightType
          : 'FEEDBACK',
      );
      const imap = (insight.config.fieldMap ?? {}) as Record<string, unknown>;
      setInsightTitleField(
        typeof imap.title === 'string' ? imap.title : null,
      );
      setInsightBodyField(typeof imap.body === 'string' ? imap.body : null);
    } else {
      setInsightEnabled(false);
    }
    markDirty(false);
  }, [query.data]);

  const save = api.form.update.useMutation({
    onSuccess: () => {
      markDirty(false);
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

  const touch = () => markDirty(true);

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
    const destinations: { type: string; config: Record<string, unknown> }[] =
      [];
    if (crmEnabled) {
      destinations.push({
        type: 'create_crm_contact',
        config: {
          customerType: customerType ?? '',
          fieldMap: Object.fromEntries(
            CONTACT_SLOTS.map((s) => [s.key, fieldMap[s.key]]).filter(
              ([, v]) => v,
            ),
          ),
        },
      });
    }
    if (dealEnabled) {
      destinations.push({
        type: 'create_deal',
        config: {
          pipelineId: dealPipelineId ?? '',
          stageId: dealStageId ?? '',
          customerType: dealCustomerType ?? '',
          contactFieldMap: Object.fromEntries(
            CONTACT_SLOTS.map((s) => [s.key, dealFieldMap[s.key]]).filter(
              ([, v]) => v,
            ),
          ),
          ...(dealTitleTemplate.trim()
            ? { dealTitleTemplate: dealTitleTemplate.trim() }
            : {}),
        },
      });
    }
    if (insightEnabled) {
      // Surface the same requirements the server enforces (form.update) as
      // immediate client-side feedback, rather than letting the save round-trip
      // and fail with a BAD_REQUEST.
      if (!insightProductId) {
        notifications.show({
          title: 'Missing product',
          message: 'Create insight requires a target product.',
          color: 'red',
        });
        return;
      }
      if (!insightTitleField) {
        notifications.show({
          title: 'Missing title mapping',
          message: 'Create insight requires a field mapped to the insight title.',
          color: 'red',
        });
        return;
      }
      destinations.push({
        type: 'create_insight',
        config: {
          productId: insightProductId,
          insightType: insightType ?? 'FEEDBACK',
          fieldMap: {
            title: insightTitleField,
            ...(insightBodyField ? { body: insightBodyField } : {}),
          },
        },
      });
    }
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
            {isActive ? (
              <Anchor
                href={`/f/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
              >
                <Group gap={4} align="center">
                  /f/{slug}
                  <IconExternalLink size={14} />
                </Group>
              </Anchor>
            ) : (
              <Text c="dimmed" size="sm">
                /f/{slug} (activate to view live)
              </Text>
            )}
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

      <Card withBorder padding="md">
        <Group justify="space-between" mb="sm">
          <Box>
            <Text fw={600}>When submitted → Add to pipeline (create deal)</Text>
            <Text c="dimmed" size="xs">
              Upserts the applicant as a contact (firing matching automations)
              and drops a card on the chosen pipeline stage.
            </Text>
          </Box>
          <Switch
            checked={dealEnabled}
            onChange={(e) => {
              setDealEnabled(e.currentTarget.checked);
              touch();
            }}
          />
        </Group>
        {dealEnabled && (
          <Stack gap="sm">
            <Group gap="sm" wrap="wrap" align="flex-end">
              <Select
                label="Pipeline"
                placeholder="Select a pipeline"
                data={(pipelines ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
                value={dealPipelineId}
                onChange={(value) => {
                  setDealPipelineId(value);
                  // Stage belongs to a pipeline — reset it when the pipeline changes.
                  setDealStageId(null);
                  touch();
                }}
                w={220}
              />
              <Select
                label="Stage"
                placeholder={
                  dealPipelineId ? 'Select a stage' : 'Pick a pipeline first'
                }
                data={dealStages.map((s) => ({ value: s.id, label: s.name }))}
                value={dealStageId}
                onChange={(value) => {
                  setDealStageId(value);
                  touch();
                }}
                disabled={!dealPipelineId}
                w={220}
              />
              <Select
                label="Customer type"
                placeholder="e.g. Applicant"
                data={CRM_CUSTOMER_TYPE_OPTIONS}
                value={dealCustomerType}
                onChange={(value) => {
                  setDealCustomerType(value);
                  touch();
                }}
                searchable
                w={220}
              />
            </Group>
            <TextInput
              label="Deal title template"
              description="Optional. Use {fieldKey} tokens; defaults to the applicant's name, then email."
              placeholder="e.g. {firstName} {lastName} — Frontend role"
              value={dealTitleTemplate}
              onChange={(e) => {
                setDealTitleTemplate(e.currentTarget.value);
                touch();
              }}
              w={420}
            />
            <Divider label="Map form fields → applicant" labelPosition="left" />
            <Group gap="sm" wrap="wrap">
              {CONTACT_SLOTS.map((slot) => (
                <Select
                  key={slot.key}
                  label={`${slot.label}${slot.required ? ' *' : ''}`}
                  placeholder="Select a field"
                  data={fieldKeyOptions}
                  value={dealFieldMap[slot.key]}
                  onChange={(value) => {
                    setDealFieldMap((prev) => ({ ...prev, [slot.key]: value }));
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

      <Card withBorder padding="md">
        <Group justify="space-between" mb="sm">
          <Box>
            <Text fw={600}>When submitted → Create product insight</Text>
            <Text c="dimmed" size="xs">
              Lands one raw Insight in a product&rsquo;s Inbox for the team to
              triage. No contact or deal is created.
            </Text>
          </Box>
          <Switch
            checked={insightEnabled}
            onChange={(e) => {
              setInsightEnabled(e.currentTarget.checked);
              touch();
            }}
          />
        </Group>
        {insightEnabled && (
          <Stack gap="sm">
            <Group gap="sm" wrap="wrap" align="flex-end">
              <Select
                label="Product *"
                placeholder="Select a product"
                data={(products ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
                value={insightProductId}
                onChange={(value) => {
                  setInsightProductId(value);
                  touch();
                }}
                searchable
                w={260}
              />
              <Select
                label="Insight type"
                data={INSIGHT_TYPE_OPTIONS.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
                value={insightType}
                onChange={(value) => {
                  setInsightType(value);
                  touch();
                }}
                allowDeselect={false}
                w={200}
              />
            </Group>
            <Divider label="Map form fields → insight" labelPosition="left" />
            <Group gap="sm" wrap="wrap">
              <Select
                label="Title *"
                placeholder="Select a field"
                data={fieldKeyOptions}
                value={insightTitleField}
                onChange={(value) => {
                  setInsightTitleField(value);
                  touch();
                }}
                clearable
                w={220}
              />
              <Select
                label="Body"
                placeholder="Select a field"
                data={fieldKeyOptions}
                value={insightBodyField}
                onChange={(value) => {
                  setInsightBodyField(value);
                  touch();
                }}
                clearable
                w={220}
              />
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
