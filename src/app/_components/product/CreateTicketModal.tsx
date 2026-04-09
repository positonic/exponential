"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Button,
  Menu,
  Modal,
  NumberInput,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCircleDot,
  IconDots,
  IconFlag3,
  IconFlame,
  IconLink,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TipTapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { api } from "~/trpc/react";
import "@mantine/tiptap/styles.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// Shared styles for the pill-shaped selects
const pillStyles = {
  root: { flex: "0 0 auto", maxWidth: "fit-content" },
  wrapper: { maxWidth: "fit-content" },
  input: {
    color: "var(--color-text-secondary)",
    fontWeight: 500,
    fontSize: "0.75rem",
    height: 26,
    minHeight: 26,
    lineHeight: "26px",
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: 13,
    border: "1px solid var(--color-border-primary)",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  section: { marginRight: 0, marginLeft: 2, width: 16 },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateTicketModalProps {
  opened: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  basePath: string;
  features?: { id: string; name: string }[];
  cycles?: { id: string; name: string }[];
  epics?: { id: string; name: string }[];
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
  epics,
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
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [points, setPoints] = useState<number | "">("");

  // extra fields (3-dot menu)
  const [epicId, setEpicId] = useState<string | null>(null);
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [designUrl, setDesignUrl] = useState("");
  const [showLinks, setShowLinks] = useState(false);
  const [showEpic, setShowEpic] = useState(false);
  const [showFeature, setShowFeature] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TipTapLink.configure({ openOnClick: false }),
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
    setCycleId(null);
    setPoints("");
    setEpicId(null);
    setFeatureId(null);
    setBranchName("");
    setPrUrl("");
    setDesignUrl("");
    setShowLinks(false);
    setShowEpic(false);
    setShowFeature(false);
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
      epicId: epicId ?? undefined,
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
      radius="lg"
      padding={0}
      withCloseButton={false}
      styles={{
        content: {
          backgroundColor: "var(--color-bg-elevated)",
          color: "var(--color-text-primary)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
        body: {
          padding: 0,
          display: "flex",
          flexDirection: "column",
          flex: 1,
        },
      }}
    >
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="light" size="sm" radius="sm" className="uppercase">
            {productName}
          </Badge>
          <Text span size="sm" className="text-text-muted">
            New ticket
          </Text>
        </div>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleClose}
          className="text-text-muted hover:text-text-primary"
        >
          <IconX size={16} />
        </ActionIcon>
      </div>

      {/* ---- Title ---- */}
      <div className="px-5 pt-5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          className="w-full bg-transparent text-base font-medium text-text-primary placeholder-text-muted outline-none"
          autoFocus
        />
      </div>

      {/* ---- Body (rich text) ---- */}
      <div className="flex-1 px-5 py-1" style={{ minHeight: 180 }}>
        <RichTextEditor
          editor={editor}
          styles={{
            root: { border: "none", backgroundColor: "transparent" },
            content: {
              backgroundColor: "transparent",
              color: "var(--color-text-primary)",
              minHeight: 140,
              padding: 0,
              fontSize: "0.875rem",
            },
          }}
        >
          <RichTextEditor.Content />
        </RichTextEditor>
      </div>

      {/* ---- Property pills ---- */}
      <div className="border-t border-border-primary px-5 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {/* Status */}
          <Select
            data={STATUS_OPTIONS}
            value={status}
            onChange={(v) => v && setStatus(v as TicketStatus)}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            leftSection={<IconCircleDot size={13} />}
            rightSection={null}
            styles={pillStyles}
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
            leftSection={<IconFlag3 size={13} />}
            rightSection={null}
            styles={pillStyles}
          />

          {/* Assignee */}
          <Select
            data={
              members?.map((m) => ({
                value: m.id,
                label: m.name ?? "Unknown",
              })) ?? []
            }
            value={assigneeId}
            onChange={setAssigneeId}
            placeholder="Assignee"
            size="xs"
            variant="unstyled"
            clearable
            comboboxProps={{ withinPortal: true }}
            leftSection={<IconUser size={13} />}
            rightSection={null}
            styles={pillStyles}
          />

          {/* Type */}
          <Select
            data={TYPE_OPTIONS}
            value={type}
            onChange={(v) => v && setType(v as TicketType)}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            rightSection={null}
            styles={pillStyles}
          />

          {/* Cycle */}
          <Select
            data={cycles?.map((c) => ({ value: c.id, label: c.name })) ?? []}
            value={cycleId}
            onChange={setCycleId}
            placeholder="Cycle"
            size="xs"
            variant="unstyled"
            clearable
            comboboxProps={{ withinPortal: true }}
            rightSection={null}
            styles={pillStyles}
          />

          {/* Effort */}
          <NumberInput
            value={points}
            onChange={(v) => setPoints(typeof v === "number" ? v : "")}
            placeholder="Effort"
            size="xs"
            variant="unstyled"
            min={0}
            allowDecimal={false}
            hideControls
            styles={{
              root: { flex: "0 0 auto", maxWidth: "fit-content" },
              input: {
                color: "var(--color-text-secondary)",
                fontWeight: 500,
                fontSize: "0.75rem",
                height: 26,
                minHeight: 26,
                lineHeight: "26px",
                paddingLeft: 8,
                paddingRight: 8,
                borderRadius: 13,
                border: "1px solid var(--color-border-primary)",
                backgroundColor: "transparent",
                cursor: "pointer",
                width: 56,
                textAlign: "center",
              },
            }}
          />

          {/* Conditionally shown extras */}
          {showEpic && (
            <Select
              data={epics?.map((e) => ({ value: e.id, label: e.name })) ?? []}
              value={epicId}
              onChange={setEpicId}
              placeholder="Epic"
              size="xs"
              variant="unstyled"
              clearable
              comboboxProps={{ withinPortal: true }}
              styles={pillStyles}
            />
          )}

          {showFeature && (
            <Select
              data={features?.map((f) => ({ value: f.id, label: f.name })) ?? []}
              value={featureId}
              onChange={setFeatureId}
              placeholder="Feature"
              size="xs"
              variant="unstyled"
              clearable
              comboboxProps={{ withinPortal: true }}
              styles={pillStyles}
            />
          )}

          {/* 3-dot menu */}
          <Menu position="top-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size={26}
                radius="xl"
                className="text-text-muted hover:text-text-primary border border-border-primary"
              >
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {!showEpic && (
                <Menu.Item onClick={() => setShowEpic(true)}>
                  Epic
                </Menu.Item>
              )}
              {!showFeature && (
                <Menu.Item onClick={() => setShowFeature(true)}>
                  Feature
                </Menu.Item>
              )}
              <Menu.Item disabled>Goal</Menu.Item>
              {!showLinks && (
                <Menu.Item
                  leftSection={<IconLink size={14} />}
                  onClick={() => setShowLinks(true)}
                >
                  Links
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>

        {/* Link fields (expanded from menu) */}
        {showLinks && (
          <div className="mt-3 flex gap-2">
            <TextInput
              size="xs"
              placeholder="Branch"
              value={branchName}
              onChange={(e) => setBranchName(e.currentTarget.value)}
              className="flex-1"
            />
            <TextInput
              size="xs"
              placeholder="PR URL"
              value={prUrl}
              onChange={(e) => setPrUrl(e.currentTarget.value)}
              className="flex-1"
            />
            <TextInput
              size="xs"
              placeholder="Design URL"
              value={designUrl}
              onChange={(e) => setDesignUrl(e.currentTarget.value)}
              className="flex-1"
            />
          </div>
        )}
      </div>

      {/* ---- Footer ---- */}
      <div className="flex items-center justify-between border-t border-border-primary px-5 py-3">
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
          radius="md"
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
