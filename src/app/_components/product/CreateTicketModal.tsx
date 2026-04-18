"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Button,
  Menu,
  Modal,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCircleDot,
  IconDots,
  IconFlag3,
  IconLink,
  IconUser,
  IconX,
  IconCategory,
  IconClock,
  IconFlame,
} from "@tabler/icons-react";
import { RichTextEditor } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TipTapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { api } from "~/trpc/react";
import { STATUS_OPTIONS, type TicketStatus } from "~/lib/ticket-statuses";
import "@mantine/tiptap/styles.css";

// ---------------------------------------------------------------------------
// Option data
// ---------------------------------------------------------------------------

const TYPE_OPTIONS = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "CHORE", label: "Chore" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "SPIKE", label: "Spike" },
  { value: "RESEARCH", label: "Research" },
];


const PRIORITY_OPTIONS = [
  { value: "0", label: "Urgent" },
  { value: "1", label: "High" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Low" },
  { value: "4", label: "No priority" },
];

type TicketType = "BUG" | "FEATURE" | "CHORE" | "IMPROVEMENT" | "SPIKE" | "RESEARCH";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "a",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li", "blockquote", "code", "pre", "hr",
];

// ---------------------------------------------------------------------------
// Pill button - a Menu trigger that looks like a compact chip
// ---------------------------------------------------------------------------

function Pill({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border-primary px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-border-focus hover:text-text-primary transition-colors cursor-pointer bg-transparent whitespace-nowrap"
        >
          {icon}
          <span>{label}</span>
        </button>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  );
}

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

  // core
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TicketStatus>("BACKLOG");
  const [type, setType] = useState<TicketType>("FEATURE");
  const [priority, setPriority] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [points, setPoints] = useState<string>("");

  // overflow
  const [epicId, setEpicId] = useState<string | null>(null);
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [designUrl, setDesignUrl] = useState("");
  const [showEpic, setShowEpic] = useState(false);
  const [showFeature, setShowFeature] = useState(false);
  const [showLinks, setShowLinks] = useState(false);

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
    setStatus("BACKLOG");
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
      points: points ? Number(points) : undefined,
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

  // Lookup helpers
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Status";
  const priorityLabel = priority != null
    ? PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? "Priority"
    : "Priority";
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "Type";
  const assigneeLabel = assigneeId
    ? members?.find((m) => m.id === assigneeId)?.name ?? "Assignee"
    : "Assignee";
  const cycleLabel = cycleId
    ? cycles?.find((c) => c.id === cycleId)?.name ?? "Cycle"
    : "Cycle";
  const epicLabel = epicId
    ? epics?.find((e) => e.id === epicId)?.name ?? "Epic"
    : "Epic";
  const featureLabel = featureId
    ? features?.find((f) => f.id === featureId)?.name ?? "Feature"
    : "Feature";

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
      {/* Header */}
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

      {/* Title */}
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

      {/* Body */}
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
              paddingLeft: 0,
              fontSize: "0.875rem",
            },
          }}
        >
          <RichTextEditor.Content />
        </RichTextEditor>
      </div>

      {/* Property pills */}
      <div className="border-t border-border-primary px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Status */}
          <Pill icon={<IconCircleDot size={14} />} label={statusLabel}>
            {STATUS_OPTIONS.map((o) => (
              <Menu.Item key={o.value} onClick={() => setStatus(o.value)}>
                {o.label}
              </Menu.Item>
            ))}
          </Pill>

          {/* Priority */}
          <Pill icon={<IconFlag3 size={14} />} label={priorityLabel}>
            {PRIORITY_OPTIONS.map((o) => (
              <Menu.Item key={o.value} onClick={() => setPriority(o.value)}>
                {o.label}
              </Menu.Item>
            ))}
            {priority != null && (
              <>
                <Menu.Divider />
                <Menu.Item onClick={() => setPriority(null)}>Clear</Menu.Item>
              </>
            )}
          </Pill>

          {/* Assignee */}
          <Pill icon={<IconUser size={14} />} label={assigneeLabel}>
            {members && members.length > 0 ? (
              members.map((m) => (
                <Menu.Item key={m.id} onClick={() => setAssigneeId(m.id)}>
                  {m.name ?? "Unknown"}
                </Menu.Item>
              ))
            ) : (
              <Menu.Item disabled>No members</Menu.Item>
            )}
            {assigneeId && (
              <>
                <Menu.Divider />
                <Menu.Item onClick={() => setAssigneeId(null)}>Clear</Menu.Item>
              </>
            )}
          </Pill>

          {/* Type */}
          <Pill icon={<IconCategory size={14} />} label={typeLabel}>
            {TYPE_OPTIONS.map((o) => (
              <Menu.Item key={o.value} onClick={() => setType(o.value as TicketType)}>
                {o.label}
              </Menu.Item>
            ))}
          </Pill>

          {/* Cycle */}
          <Pill icon={<IconClock size={14} />} label={cycleLabel}>
            {cycles && cycles.length > 0 ? (
              cycles.map((c) => (
                <Menu.Item key={c.id} onClick={() => setCycleId(c.id)}>
                  {c.name}
                </Menu.Item>
              ))
            ) : (
              <Menu.Item disabled>No cycles</Menu.Item>
            )}
            {cycleId && (
              <>
                <Menu.Divider />
                <Menu.Item onClick={() => setCycleId(null)}>Clear</Menu.Item>
              </>
            )}
          </Pill>

          {/* Effort */}
          <Pill icon={<IconFlame size={14} />} label={points || "Effort"}>
            {[1, 2, 3, 5, 8, 13].map((n) => (
              <Menu.Item key={n} onClick={() => setPoints(String(n))}>
                {n}
              </Menu.Item>
            ))}
            {points && (
              <>
                <Menu.Divider />
                <Menu.Item onClick={() => setPoints("")}>Clear</Menu.Item>
              </>
            )}
          </Pill>

          {/* Conditionally shown extras */}
          {showEpic && (
            <Pill label={epicLabel}>
              {epics && epics.length > 0 ? (
                epics.map((e) => (
                  <Menu.Item key={e.id} onClick={() => setEpicId(e.id)}>
                    {e.name}
                  </Menu.Item>
                ))
              ) : (
                <Menu.Item disabled>No epics</Menu.Item>
              )}
              {epicId && (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setEpicId(null)}>Clear</Menu.Item>
                </>
              )}
            </Pill>
          )}

          {showFeature && (
            <Pill label={featureLabel}>
              {features && features.length > 0 ? (
                features.map((f) => (
                  <Menu.Item key={f.id} onClick={() => setFeatureId(f.id)}>
                    {f.name}
                  </Menu.Item>
                ))
              ) : (
                <Menu.Item disabled>No features</Menu.Item>
              )}
              {featureId && (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={() => setFeatureId(null)}>Clear</Menu.Item>
                </>
              )}
            </Pill>
          )}

          {/* 3-dot overflow menu */}
          <Menu position="top-end" withinPortal>
            <Menu.Target>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-border-primary w-7 h-7 text-text-muted hover:border-border-focus hover:text-text-primary transition-colors cursor-pointer bg-transparent"
              >
                <IconDots size={14} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              {!showEpic && (
                <Menu.Item onClick={() => setShowEpic(true)}>Epic</Menu.Item>
              )}
              {!showFeature && (
                <Menu.Item onClick={() => setShowFeature(true)}>Feature</Menu.Item>
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

        {/* Link fields */}
        {showLinks && (
          <div className="mt-3 flex gap-2">
            <TextInput size="xs" placeholder="Branch" value={branchName} onChange={(e) => setBranchName(e.currentTarget.value)} className="flex-1" />
            <TextInput size="xs" placeholder="PR URL" value={prUrl} onChange={(e) => setPrUrl(e.currentTarget.value)} className="flex-1" />
            <TextInput size="xs" placeholder="Design URL" value={designUrl} onChange={(e) => setDesignUrl(e.currentTarget.value)} className="flex-1" />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-primary px-5 py-3">
        <div>
          {error && (
            <Text size="xs" c="red">{error}</Text>
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
