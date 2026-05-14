"use client";

import { Button } from "@mantine/core";
import {
  IconCheck,
  IconClipboardList,
  IconPlayerPlay,
  IconPlus,
} from "@tabler/icons-react";
import { HTMLContent } from "../HTMLContent";

interface TranscriptionAction {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  dueDate?: string | Date | null;
  status?: string | null;
}

interface ActionsPaneProps {
  actions: TranscriptionAction[];
  processedAt: Date | string | null;
  actionsSavedAt: Date | string | null;
  onGenerateOrReview: () => void;
  isGenerating: boolean;
  onCreateAction: () => void;
}

export function ActionsPane({
  actions,
  processedAt,
  actionsSavedAt,
  onGenerateOrReview,
  isGenerating,
  onCreateAction,
}: ActionsPaneProps) {
  const total = actions.length;
  const done = actions.filter((a) => a.status === "COMPLETED").length;
  const remaining = total - done;
  const hasDrafts = !!actionsSavedAt;

  return (
    <div className="mdm-pane">
      <div className="mdm-actions">
        <div className="mdm-actions__bar">
          <div className="mdm-actions__bar-text">
            {total === 0 ? (
              <>
                No actions have been pulled from this meeting yet.{" "}
                {processedAt ? "Generate drafts to start." : "Generate actions to begin."}
              </>
            ) : (
              <>
                <b>{remaining}</b> of {total} action{total === 1 ? "" : "s"} open.
                Confirm, assign, and add to your projects.
              </>
            )}
          </div>
          <Button
            size="xs"
            variant="filled"
            color="blue"
            leftSection={
              hasDrafts ? <IconClipboardList size={13} /> : <IconPlayerPlay size={13} />
            }
            onClick={onGenerateOrReview}
            loading={isGenerating}
          >
            {hasDrafts ? "Review drafts" : "Generate actions"}
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlus size={13} />}
            onClick={onCreateAction}
          >
            Add manually
          </Button>
        </div>

        {total === 0 ? null : (
          <div className="mdm-actions__list">
            {actions.map((a) => (
              <article
                key={a.id}
                className={`mdm-action ${a.status === "COMPLETED" ? "is-done" : ""}`}
              >
                <span className="mdm-action__check" aria-hidden="true">
                  <IconCheck size={10} />
                </span>
                <div className="min-w-0">
                  <div className="mdm-action__title">
                    <HTMLContent html={a.name} compactUrls />
                  </div>
                  {a.description && (
                    <p className="mdm-action__description">{a.description}</p>
                  )}
                  <div className="mdm-action__meta">
                    {a.priority && (
                      <span className="mdm-action__pill mdm-action__pill--priority">
                        {a.priority}
                      </span>
                    )}
                    {a.dueDate && (
                      <span className="mdm-action__pill mdm-action__pill--due">
                        Due {new Date(a.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    {a.status && (
                      <span
                        className={`mdm-action__pill ${a.status === "COMPLETED" ? "mdm-action__pill--done" : ""}`}
                      >
                        {a.status}
                      </span>
                    )}
                  </div>
                </div>
                <div />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
