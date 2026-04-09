"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCircle,
  IconDots,
  IconGitBranch,
  IconLink,
  IconPaint,
  IconUser,
} from "@tabler/icons-react";
import { RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { api } from "~/trpc/react";
import "@mantine/tiptap/styles.css";

// -- constants ---------------------------------------------------------------

const TYPE_OPTIONS = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "CHORE", label: "Chore" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "SPIKE", label: "Spike" },
  { value: "RESEARCH", label: "Research" },
];

const STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "TODO", label: "Todo" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "DONE", label: "Done" },
];

const PRIORITY_OPTIONS = [
  { value: "0", label: "Urgent" },
  { value: "1", label: "High" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Low" },
  { value: "4", label: "No priority" },
];

type TicketType =
  | "BUG"
  | "FEATURE"
  | "CHORE"
  | "IMPROVEMENT"
  | "SPIKE"
  | "RESEARCH";
type TicketStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "DONE"
  | "CANCELLED";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "a",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li", "blockquote", "code", "pre", "hr",
];

// -- component ---------------------------------------------------------------

interface CreateTicketModalProps {
  opened: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  basePath: string;
  features?: { id: string; name: string }[];
  cycles?: { id: string; name: string }[];
  members?: { id: string; name: string | null }[];
}

export function CreateTicketModal({
  opened,
  onClose,
  productId,
  productName,
  basePath,
  features,
  cycles,
  members,
}: CreateTicketModalProps) {
  const router = useRouter();
  const utils = api.useUtils();

  // core fields
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TicketStatus>("TODO");
  const [type, setType] = useState<TicketType>("FEATURE");
  const [priority, setPriority] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [points, setPoints] = useState<number | "">("");

  // extra fields (hidden behind dots menu)
  const [branchName, setBranchName] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [designUrl, setDesignUrl] = useState("");
  const [showExtras, setShowExtras] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // rich text editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Add description..." }),
    ],
    content: "",
  });

  const createTicket = api.product.ticket.create.useMutation({
    onSuccess: async (ticket) => {
      await utils.product.ticket.list.invalidate({ productId });
      resetForm();
      onClose();
      router.push(`${basePath}/${ticket.id}`);
    },
    onError: (err) => setError(err.message),
  });

  const resetForm = () => {
    setTitle("");
    setStatus("TODO");
    setType("FEATURE");
    setPriority(null);
    setAssigneeId(null);
    setFeatureId(null);
    setCycleId(null);
    setPoints("");
    setBranchName("");
    setPrUrl("");
    setDesignUrl("");
    setShowExtras(false);
    setError(null);
    editor?.commands.clearContent();
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    const rawHtml = editor?.getHTML() ?? "";
    const body = DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS });

    createTicket.mutate({
      productId,
      title: title.trim(),
      body: body === "<p></p>" ? undefined : body,
      type,
      status,
      priority: priority != null ? Number(priority) : undefined,
      points: typeof points === "number" ? points : undefined,
      assigneeId: assigneeId ?? undefined,
      featureId: featureId ?? undefined,
      cycleId: cycleId ?? undefined,
      branchName: branchName.trim() || undefined,
      prUrl: prUrl.trim() || undefined,
      designUrl: designUrl.trim() || undefined,
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="lg"
      radius="md"
      padding={0}
      withCloseButton={false}
      styles={{
        content: {
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          display: "flex",
          flexDirection: "column",
        },
        body: {
          padding: 0,
          display: "flex",
          flexDirection: "column",
          flex: 1,
        },
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-primary px-4 py-2.5">
        <Group gap="xs">
          <Badge
            variant="light"
            color="brand"
            size="sm"
            radius="sm"
          >
            {productName}
          </Badge>
          <Text size="sm" className="text-text-muted">
            New ticket
          </Text>
        </Group>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleClose}
          className="text-text-muted hover:text-text-primary"
        >
          x
        </ActionIcon>
      </div>

      {/* Title input - borderless, large */}
      <div className="px-4 pt-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ticket title"
          className="w-full bg-transparent text-lg font-semibold text-text-primary placeholder-text-muted outline-none"
          autoFocus
        />
      </div>

      {/* Rich text body */}
      <div className="flex-1 px-4 py-2" style={{ minHeight: 200 }}>
        <RichTextEditor
          editor={editor}
          styles={{
            root: {
              border: "none",
              backgroundColor: "transparent",
            },
            content: {
              backgroundColor: "transparent",
              color: "var(--color-text-primary)",
              minHeight: 160,
              padding: 0,
              fontSize: "0.875rem",
            },
          }}
        >
          <RichTextEditor.Content />
        </RichTextEditor>
      </div>

      {/* Properties row */}
      <div className="border-t border-border-primary px-4 py-3">
        <Group gap="xs" wrap="wrap">
          {/* Status */}
          <Select
            data={STATUS_OPTIONS}
            value={status}
            onChange={(v) => v && setStatus(v as TicketStatus)}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            leftSection={<IconCircle size={14} />}
            styles={{
              input: {
                color: "var(--color-text-secondary)",
                fontWeight: 500,
                fontSize: "0.8rem",
                minWidth: 80,
              },
            }}
          />

          {/* Priority */}
          <Select
            data={PRIORITY_OPTIONS}
            value={priority}
            onChange={setPriority}
            placeholder="Priority"
            size="xs"
            variant="unstyled"
            clearable
            comboboxProps={{ withinPortal: true }}
            styles={{
              input: {
                color: "var(--color-text-secondary)",
                fontWeight: 500,
                fontSize: "0.8rem",
                minWidth: 80,
              },
            }}
          />

          {/* Assignee */}
          {members && members.length > 0 && (
            <Select
              data={members.map((m) => ({
                value: m.id,
                label: m.name ?? "Unknown",
              }))}
              value={assigneeId}
              onChange={setAssigneeId}
              placeholder="Assignee"
              size="xs"
              variant="unstyled"
              clearable
              comboboxProps={{ withinPortal: true }}
              leftSection={<IconUser size={14} />}
              styles={{
                input: {
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                  fontSize: "0.8rem",
                  minWidth: 90,
                },
              }}
            />
          )}

          {/* Feature */}
          {features && features.length > 0 && (
            <Select
              data={features.map((f) => ({
                value: f.id,
                label: f.name,
              }))}
              value={featureId}
              onChange={setFeatureId}
              placeholder="Feature"
              size="xs"
              variant="unstyled"
              clearable
              comboboxProps={{ withinPortal: true }}
              styles={{
                input: {
                  color: "var(--color-text-secondary)",
                  fontWeight: 500,
                  fontSize: "0.8rem",
                  minWidth: 80,
                },
              }}
            />
          )}

          {/* Type */}
          <Select
            data={TYPE_OPTIONS}
            value={type}
            onChange={(v) => v && setType(v as TicketType)}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            styles={{
              input: {
                color: "var(--color-text-secondary)",
                fontWeight: 500,
                fontSize: "0.8rem",
                minWidth: 80,
              },
            }}
          />

          {/* 3 dot menu for extras */}
          <Menu position="top-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="sm"
                className="text-text-muted hover:text-text-primary"
              >
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconGitBranch size={14} />}
                onClick={() => setShowExtras(true)}
              >
                Branch / PR / Design URL
              </Menu.Item>
              {cycles && cycles.length > 0 && (
                <Menu.Item onClick={() => setShowExtras(true)}>
                  Cycle
                </Menu.Item>
              )}
              <Menu.Item onClick={() => setShowExtras(true)}>
                Story points
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {/* Extra fields (expanded) */}
        {showExtras && (
          <div className="mt-3 space-y-2">
            <Group grow gap="xs">
              <TextInput
                size="xs"
                placeholder="Branch name"
                value={branchName}
                onChange={(e) => setBranchName(e.currentTarget.value)}
                leftSection={<IconGitBranch size={14} />}
              />
              <TextInput
                size="xs"
                placeholder="PR URL"
                value={prUrl}
                onChange={(e) => setPrUrl(e.currentTarget.value)}
                leftSection={<IconLink size={14} />}
              />
              <TextInput
                size="xs"
                placeholder="Design URL"
                value={designUrl}
                onChange={(e) => setDesignUrl(e.currentTarget.value)}
                leftSection={<IconPaint size={14} />}
              />
            </Group>
            <Group gap="xs">
              {cycles && cycles.length > 0 && (
                <Select
                  size="xs"
                  placeholder="Cycle"
                  clearable
                  data={cycles.map((c) => ({
                    value: c.id,
                    label: c.name,
                  }))}
                  value={cycleId}
                  onChange={setCycleId}
                  comboboxProps={{ withinPortal: true }}
                />
              )}
              <NumberInput
                size="xs"
                placeholder="Points"
                value={points}
                onChange={(v) =>
                  setPoints(typeof v === "number" ? v : "")
                }
                min={0}
                allowDecimal={false}
                w={80}
              />
            </Group>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-primary px-4 py-3">
        <div>
          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
        </div>
        <Button
          size="sm"
          color="brand"
          onClick={handleSubmit}
          loading={createTicket.isPending}
          disabled={!title.trim()}
        >
          Create ticket
        </Button>
      </div>
    </Modal>
  );
}
