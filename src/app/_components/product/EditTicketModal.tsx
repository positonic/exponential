"use client";

import { useEffect, useState } from "react";
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
  IconFlame,
  IconLink,
  IconUser,
  IconX,
  IconCategory,
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
import { TagSelector } from "~/app/_components/TagSelector";
import "@mantine/tiptap/styles.css";

type TicketType = "BUG" | "FEATURE" | "CHORE" | "IMPROVEMENT" | "SPIKE" | "RESEARCH";

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

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "a",
  "h1", "h2", "h3", "h4",
  "ul", "ol", "li", "blockquote", "code", "pre", "hr",
];

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

interface EditTicketModalProps {
  opened: boolean;
  onClose: () => void;
  ticketId: string;
  productName: string;
  workspaceId?: string;
  assignableMembers?: { id: string; name: string | null }[];
}

export function EditTicketModal({
  opened,
  onClose,
  ticketId,
  productName,
  workspaceId,
  assignableMembers,
}: EditTicketModalProps) {
  const utils = api.useUtils();

  const ticketQuery = api.product.ticket.getById.useQuery(
    { id: ticketId },
    { enabled: opened },
  );

  const tagsQuery = api.tag.listForEntity.useQuery(
    { entityType: "ticket", entityId: ticketId },
    { enabled: opened },
  );

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TicketStatus>("BACKLOG");
  const [type, setType] = useState<TicketType>("FEATURE");
  const [priority, setPriority] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [points, setPoints] = useState<string>("");
  const [branchName, setBranchName] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
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

  // Hydrate form fields when the ticket loads.
  useEffect(() => {
    if (!opened) return;
    const ticket = ticketQuery.data;
    if (!ticket) return;
    setTitle(ticket.title);
    setStatus(ticket.status as TicketStatus);
    setType(ticket.type as TicketType);
    setPriority(ticket.priority != null ? String(ticket.priority) : null);
    setAssigneeId(ticket.assigneeId ?? null);
    setPoints(ticket.points != null ? String(ticket.points) : "");
    setBranchName(ticket.branchName ?? "");
    setPrUrl(ticket.prUrl ?? "");
    setShowLinks(Boolean(ticket.branchName ?? ticket.prUrl));
    editor?.commands.setContent(ticket.body ?? "");
  }, [opened, ticketQuery.data, editor]);

  useEffect(() => {
    if (!opened) return;
    const loaded = tagsQuery.data;
    if (loaded) setTagIds(loaded.map((t) => t.id));
  }, [opened, tagsQuery.data]);

  const updateTicket = api.product.ticket.update.useMutation();
  const setEntityTags = api.tag.setEntityTags.useMutation();

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setError(null);

    const rawHtml = editor?.getHTML() ?? "";
    const body = DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS });

    try {
      await updateTicket.mutateAsync({
        id: ticketId,
        title: title.trim(),
        body: body === "<p></p>" ? "" : body,
        type,
        status,
        priority: priority != null ? Number(priority) : null,
        points: points ? Number(points) : null,
        assigneeId: assigneeId ?? null,
        branchName: branchName.trim() || null,
        prUrl: prUrl.trim() || null,
      });

      await setEntityTags.mutateAsync({
        entityType: "ticket",
        entityId: ticketId,
        tagIds,
      });

      await utils.product.ticket.list.invalidate();
      await utils.product.ticket.getById.invalidate({ id: ticketId });
      await utils.tag.listForEntity.invalidate({
        entityType: "ticket",
        entityId: ticketId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ticket");
    }
  };

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Status";
  const priorityLabel = priority != null
    ? PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? "Priority"
    : "Priority";
  const typeLabel = TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "Type";
  const assigneeLabel = assigneeId
    ? assignableMembers?.find((m) => m.id === assigneeId)?.name ?? "Assignee"
    : "Assignee";

  const isLoading = ticketQuery.isLoading || tagsQuery.isLoading;
  const isSaving = updateTicket.isPending || setEntityTags.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
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
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="light" size="sm" radius="sm" className="uppercase">
            {productName}
          </Badge>
          <Text span size="sm" className="text-text-muted">
            Edit ticket
          </Text>
        </div>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary"
        >
          <IconX size={16} />
        </ActionIcon>
      </div>

      <div className="px-5 pt-5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Issue title"
          className="w-full bg-transparent text-base font-medium text-text-primary placeholder-text-muted outline-none"
          disabled={isLoading}
        />
      </div>

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

      <div className="border-t border-border-primary px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill icon={<IconCircleDot size={14} />} label={statusLabel}>
            {STATUS_OPTIONS.map((o) => (
              <Menu.Item key={o.value} onClick={() => setStatus(o.value)}>
                {o.label}
              </Menu.Item>
            ))}
          </Pill>

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

          <Pill icon={<IconUser size={14} />} label={assigneeLabel}>
            {assignableMembers && assignableMembers.length > 0 ? (
              assignableMembers.map((m) => (
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

          <Pill icon={<IconCategory size={14} />} label={typeLabel}>
            {TYPE_OPTIONS.map((o) => (
              <Menu.Item key={o.value} onClick={() => setType(o.value as TicketType)}>
                {o.label}
              </Menu.Item>
            ))}
          </Pill>

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

          <TagSelector
            selectedTagIds={tagIds}
            onChange={setTagIds}
            workspaceId={workspaceId}
            categoryFilter={null}
          />

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

        {showLinks && (
          <div className="mt-3 flex gap-2">
            <TextInput size="xs" placeholder="Branch" value={branchName} onChange={(e) => setBranchName(e.currentTarget.value)} className="flex-1" />
            <TextInput size="xs" placeholder="PR URL" value={prUrl} onChange={(e) => setPrUrl(e.currentTarget.value)} className="flex-1" />
          </div>
        )}
      </div>

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
          onClick={() => {
            void handleSubmit();
          }}
          loading={isSaving}
          disabled={!title.trim() || isLoading}
        >
          Save changes
        </Button>
      </div>
    </Modal>
  );
}
