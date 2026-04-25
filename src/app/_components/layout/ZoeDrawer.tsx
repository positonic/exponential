"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { Avatar, Menu, Tooltip } from "@mantine/core";
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconBuilding,
  IconCalendar,
  IconChevronDown,
  IconFolder,
  IconHistory,
  IconHome,
  IconMessageChatbot,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import {
  useAgentModal,
  type ChatMessage,
  type DrawerSize,
} from "~/providers/AgentModalProvider";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import classes from "./ZoeDrawer.module.css";

const ManyChat = dynamic(() => import("../ManyChat"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="animate-pulse text-text-muted">Loading chat…</div>
    </div>
  ),
});

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

export function ZoeDrawer() {
  const {
    isOpen,
    closeModal,
    clearChat,
    drawerSize,
    setDrawerSize,
    maximised,
    setMaximised,
    workspaceId: overrideWorkspaceId,
    setWorkspaceId,
    projectId,
    setProjectId,
    pageContext,
    messages,
    conversationId,
    loadConversation,
  } = useAgentModal();
  const { workspace, workspaceId: urlWorkspaceId } = useWorkspace();

  const effectiveWorkspaceId = overrideWorkspaceId ?? urlWorkspaceId;

  const [defaultAgent, setDefaultAgent] = useState<{ id: string; name: string } | null>(null);
  const [loadingConversationId, setLoadingConversationId] = useState<string | null>(null);

  // Cmd+J toggle + Esc close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (isOpen) closeModal();
      }
      if (e.key === "Escape" && isOpen) closeModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, closeModal]);

  const { data: workspaces } = api.workspace.list.useQuery(undefined, {
    enabled: isOpen,
  });
  const { data: projects } = api.project.getAll.useQuery(
    { workspaceId: effectiveWorkspaceId ?? undefined },
    { enabled: !!effectiveWorkspaceId && isOpen },
  );
  const { data: customAssistant } = api.assistant.getDefault.useQuery(
    { workspaceId: effectiveWorkspaceId ?? "" },
    { enabled: !!effectiveWorkspaceId && isOpen },
  );
  const { data: agents } = api.mastra.getMastraAgents.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 10 * 60 * 1000,
  });
  const { data: conversations } = api.aiInteraction.getConversationList.useQuery(
    { limit: 15 },
    { enabled: isOpen },
  );

  // Determine active agent name (dropdown > last AI message > custom > Zoe)
  const activeAgentName = useMemo(() => {
    if (defaultAgent) return defaultAgent.name;
    const lastAi = [...messages]
      .reverse()
      .find((m) => m.type === "ai" && m.agentName && m.agentName !== "System Error");
    return lastAi?.agentName ?? customAssistant?.name ?? "Zoe";
  }, [defaultAgent, messages, customAssistant?.name]);

  // Load selected conversation when fetched
  const { data: conversationHistory } = api.aiInteraction.getConversationHistory.useQuery(
    { conversationId: loadingConversationId! },
    { enabled: !!loadingConversationId, refetchOnWindowFocus: false },
  );
  useEffect(() => {
    if (conversationHistory && loadingConversationId) {
      const msgs: ChatMessage[] = conversationHistory.flatMap((h) => [
        { type: "human" as const, content: h.userMessage },
        { type: "ai" as const, content: h.aiResponse, agentName: h.agentName ?? undefined },
      ]);
      loadConversation(loadingConversationId, msgs);
      setLoadingConversationId(null);
    }
  }, [conversationHistory, loadingConversationId, loadConversation]);

  const handleWorkspaceChange = useCallback(
    (wsId: string) => {
      setWorkspaceId(wsId);
      setProjectId(null);
    },
    [setWorkspaceId, setProjectId],
  );

  const handleSelectAgent = useCallback(
    (agentName: string) => {
      const agent = agents?.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
      if (agent) setDefaultAgent({ id: agent.id, name: agent.name });
    },
    [agents],
  );

  const handleSelectDefault = useCallback(() => setDefaultAgent(null), []);

  const handleSelectConversation = useCallback(
    (convId: string) => {
      if (convId === conversationId) return;
      setLoadingConversationId(convId);
    },
    [conversationId],
  );

  const selectedWorkspaceName =
    workspaces?.find((w) => w.id === effectiveWorkspaceId)?.name ??
    workspace?.name ??
    "Workspace";
  const selectedProjectName = projectId
    ? projects?.find((p) => p.id === projectId)?.name ?? "Project"
    : null;

  const pageLabel = pageContext?.pageTitle;

  const setSize = useCallback((s: DrawerSize) => setDrawerSize(s), [setDrawerSize]);

  return (
    <div
      className={clsx(
        classes.zoeRoot,
        isOpen && classes.isOpen,
        maximised && classes.isMax,
      )}
      data-size={drawerSize}
      role="dialog"
      aria-label="Zoe assistant"
      aria-hidden={!isOpen}
    >
      <div
        className={classes.zoeBackdrop}
        onClick={() => setMaximised(false)}
      />
      <div className={classes.zoeDrawer}>
        {/* Header */}
        <div className={classes.zoeHead}>
          <Menu shadow="md" width={220} position="bottom-start">
            <Menu.Target>
              <button className={classes.zoeHeadIdentity} aria-label="Change agent">
                <span className={classes.zoeHeadAvatar}>
                  <IconSparkles size={13} />
                </span>
                <span>
                  <div className={classes.zoeHeadTitle}>{activeAgentName}</div>
                  <div className={classes.zoeHeadThread}>
                    {conversationId ? "Resumed thread" : "New thread"}
                    {customAssistant && activeAgentName === customAssistant.name
                      ? " · your assistant"
                      : " · specialist"}
                  </div>
                </span>
                <IconChevronDown size={11} style={{ color: "var(--color-text-muted)" }} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              {customAssistant && (
                <>
                  <Menu.Label>Your Assistant</Menu.Label>
                  <Menu.Item
                    onClick={handleSelectDefault}
                    leftSection={
                      <Avatar size="xs" radius="xl">
                        {customAssistant.emoji ?? getInitials(customAssistant.name)}
                      </Avatar>
                    }
                    className={
                      activeAgentName === customAssistant.name ? "bg-surface-secondary" : ""
                    }
                  >
                    {customAssistant.name}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Label>Specialist Agents</Menu.Label>
              {agents?.map((agent) => (
                <Menu.Item
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent.name)}
                  leftSection={
                    <Avatar size="xs" radius="xl">
                      {getInitials(agent.name)}
                    </Avatar>
                  }
                  className={
                    activeAgentName.toLowerCase() === agent.name.toLowerCase()
                      ? "bg-surface-secondary"
                      : ""
                  }
                >
                  @{agent.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <div className={classes.zoeHeadSpacer} />

          <div className={classes.zoeSizeToggle} role="group" aria-label="Drawer width">
            {(["s", "m", "l"] as DrawerSize[]).map((s) => (
              <button
                key={s}
                className={drawerSize === s ? "on" : ""}
                onClick={() => setSize(s)}
                aria-pressed={drawerSize === s}
                aria-label={`Size ${s.toUpperCase()}`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <Menu shadow="md" width={280} position="bottom-end">
            <Menu.Target>
              <Tooltip label="Conversation history" position="bottom" withArrow>
                <button className={classes.zoeIconBtn} aria-label="History">
                  <IconHistory size={14} />
                </button>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Recent Conversations</Menu.Label>
              {(!conversations || conversations.length === 0) && (
                <Menu.Item disabled>No conversations yet</Menu.Item>
              )}
              {conversations?.map((conv) => (
                <Menu.Item
                  key={conv.conversationId}
                  onClick={() => handleSelectConversation(conv.conversationId)}
                  className={
                    conversationId === conv.conversationId ? "bg-surface-secondary" : ""
                  }
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate text-sm">{conv.title}</span>
                    <span className="text-xs text-text-muted">
                      {conv.agentName ? `${conv.agentName} · ` : ""}
                      {formatRelativeTime(conv.lastActivity)}
                    </span>
                  </div>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <Tooltip label="New thread" position="bottom" withArrow>
            <button
              className={classes.zoeIconBtn}
              onClick={clearChat}
              aria-label="New thread"
            >
              <IconPlus size={14} />
            </button>
          </Tooltip>

          <Tooltip
            label={maximised ? "Restore to side panel" : "Maximise to modal"}
            position="bottom"
            withArrow
          >
            <button
              className={clsx(classes.zoeIconBtn, maximised && classes.zoeIconBtnActive)}
              onClick={() => setMaximised((v) => !v)}
              aria-pressed={maximised}
              aria-label={maximised ? "Restore" : "Maximise"}
            >
              {maximised ? <IconArrowsMinimize size={13} /> : <IconArrowsMaximize size={13} />}
            </button>
          </Tooltip>

          <Tooltip label="Close (Esc)" position="bottom" withArrow>
            <button
              className={classes.zoeIconBtn}
              onClick={closeModal}
              aria-label="Close"
            >
              <IconX size={14} />
            </button>
          </Tooltip>
        </div>

        {/* Context chips */}
        <div className={classes.zoeContext}>
          <span className={classes.zoeContextLabel}>Context</span>

          <Menu shadow="md" width={220} position="bottom-start">
            <Menu.Target>
              <button className={clsx(classes.zoeChip, classes.zoeChipBtn)}>
                <IconBuilding size={11} />
                {selectedWorkspaceName}
                <IconChevronDown size={10} style={{ color: "var(--color-text-faint)" }} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Workspace</Menu.Label>
              {workspaces?.map((ws) => (
                <Menu.Item
                  key={ws.id}
                  onClick={() => handleWorkspaceChange(ws.id)}
                  className={effectiveWorkspaceId === ws.id ? "bg-surface-secondary" : ""}
                >
                  {ws.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <Menu shadow="md" width={220} position="bottom-start">
            <Menu.Target>
              <button className={clsx(classes.zoeChip, classes.zoeChipBtn)}>
                <IconFolder size={11} />
                {selectedProjectName ?? "No project"}
                <IconChevronDown size={10} style={{ color: "var(--color-text-faint)" }} />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Project Context</Menu.Label>
              <Menu.Item
                onClick={() => setProjectId(null)}
                className={!projectId ? "bg-surface-secondary" : ""}
              >
                General (no project)
              </Menu.Item>
              <Menu.Divider />
              {projects?.map((project) => (
                <Menu.Item
                  key={project.id}
                  onClick={() => setProjectId(project.id)}
                  className={projectId === project.id ? "bg-surface-secondary" : ""}
                >
                  {project.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          {pageLabel && (
            <span className={classes.zoeChip}>
              <IconHome size={11} />
              {pageLabel}
            </span>
          )}

          <span className={classes.zoeChip}>
            <IconCalendar size={11} />
            Today
          </span>
        </div>

        {/* Body: ManyChat handles its own scroll + composer */}
        <div className={classes.zoeBody}>
          <ManyChat
            projectId={projectId ?? undefined}
            workspaceId={effectiveWorkspaceId ?? undefined}
            defaultAgentId={defaultAgent?.id}
          />
        </div>
      </div>
    </div>
  );
}

export function ZoeFab() {
  const { isOpen, openModal, closeModal, pendingNotification, openModalWithNotification } =
    useAgentModal();

  const handleClick = () => {
    if (isOpen) {
      closeModal();
    } else if (pendingNotification) {
      openModalWithNotification();
    } else {
      openModal();
    }
  };

  return (
    <button
      className={classes.zoeFab}
      onClick={handleClick}
      aria-label={isOpen ? "Close Zoe" : "Open Zoe"}
    >
      <IconMessageChatbot size={20} />
      <span className={classes.zoeFabPulse} aria-hidden />
      <span className={classes.zoeFabKbd}>Ask Zoe · ⌘J</span>
    </button>
  );
}

export default ZoeDrawer;
