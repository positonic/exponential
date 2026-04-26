"use client";

import { useMemo, useState } from "react";
import { Popover, TextInput, Loader, ScrollArea } from "@mantine/core";
import { IconCheck, IconSearch } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface LinkKeyResultPopoverProps {
  /** The project we are linking key results to. */
  projectId: string;
  workspaceId: string | null;
  /** KR ids currently linked to this project. */
  linkedKeyResultIds: string[];
  /** Trigger element (e.g. the "+ Link another KR" button). */
  children: React.ReactNode;
  /** Called after a link/unlink succeeds. */
  onLinksChanged: () => void;
}

export function LinkKeyResultPopover({
  projectId,
  workspaceId,
  linkedKeyResultIds,
  children,
  onLinksChanged,
}: LinkKeyResultPopoverProps) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");

  const candidatesQuery = api.okr.getAll.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: opened && workspaceId !== null },
  );

  const linkProject = api.okr.linkProject.useMutation();
  const unlinkProject = api.okr.unlinkProject.useMutation();

  const linkedSet = new Set(linkedKeyResultIds);

  const sorted = useMemo(() => {
    const all = candidatesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? all.filter(
          (kr) =>
            kr.title?.toLowerCase().includes(q) ||
            kr.goal?.title?.toLowerCase().includes(q),
        )
      : all;
    return [...matched].sort((a, b) => {
      const goalCmp = (a.goal?.title ?? "").localeCompare(b.goal?.title ?? "");
      if (goalCmp !== 0) return goalCmp;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
  }, [candidatesQuery.data, search]);

  const handleToggle = (krId: string) => {
    const isLinked = linkedSet.has(krId);
    const mutation = isLinked ? unlinkProject : linkProject;
    mutation.mutate(
      { keyResultId: krId, projectId },
      {
        onSuccess: () => {
          onLinksChanged();
        },
      },
    );
  };

  const isPending = linkProject.isPending || unlinkProject.isPending;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withArrow
      shadow="md"
      width={360}
    >
      <Popover.Target>
        <div onClick={() => setOpened((o) => !o)} role="button" tabIndex={0}>
          {children}
        </div>
      </Popover.Target>
      <Popover.Dropdown className="border-border-primary bg-background-primary p-0">
        <div className="border-b border-border-primary p-2">
          <TextInput
            size="xs"
            placeholder="Search key results…"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <ScrollArea h={260}>
          {candidatesQuery.isLoading ? (
            <div className="flex justify-center p-4">
              <Loader size="xs" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-3 text-sm text-text-muted">
              {search ? "No key results match" : "No key results in this workspace"}
            </div>
          ) : (
            sorted.map((kr) => {
              const isLinked = linkedSet.has(kr.id);
              return (
                <button
                  key={kr.id}
                  type="button"
                  className={
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover " +
                    (isLinked ? "text-text-primary" : "text-text-secondary")
                  }
                  onClick={() => handleToggle(kr.id)}
                  disabled={isPending}
                >
                  <span
                    className={
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
                      (isLinked
                        ? "border-blue-500 bg-blue-500"
                        : "border-border-primary")
                    }
                  >
                    {isLinked && <IconCheck size={12} className="text-white" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{kr.title}</span>
                    {kr.goal?.title && (
                      <span className="truncate text-xs text-text-muted">
                        {kr.goal.title}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </ScrollArea>
      </Popover.Dropdown>
    </Popover>
  );
}
