"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileButton, Image, Loader, SegmentedControl } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconExternalLink, IconPhoto, IconUpload } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useFileDrop } from "~/hooks/useFileDrop";
import { isImageFile, readMeetingImages } from "~/lib/meetings/meetingImages";
import {
  buildScreenshotNarrative,
  sortScreenshotsChronologically,
  type NarrativeScreenshot,
  type ScreenshotNarrativeEntry,
} from "~/lib/meetings/screenshotNarrative";
import { reportHandledError } from "~/lib/reportHandledError";

type ScreenshotItem = NarrativeScreenshot;

/** "narrative" pairs each capture with what was said before it; "grid" is
 *  images only. */
type ScreenshotsView = "narrative" | "grid";

const VIEW_STORAGE_KEY = "meeting-screenshots-view";

interface ScreenshotsTabProps {
  transcriptionSessionId: string;
  screenshots: ScreenshotItem[];
  videoUrl: string | null;
  /** Whether the meeting has a transcript at all (the body loads lazily). */
  hasTranscript: boolean;
  /** The raw transcript, with its `[SCREENSHOT]` markers; undefined while
   *  loading or when the meeting has none. */
  transcription: string | null | undefined;
  isTranscriptLoading: boolean;
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA")
  );
}

function readStoredView(): ScreenshotsView | null {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "grid" || stored === "narrative" ? stored : null;
  } catch {
    return null;
  }
}

function storeView(view: ScreenshotsView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private mode / blocked storage: the choice just doesn't persist.
  }
}

/** Past this many characters a passage is clamped behind "Show more", so a
 *  long stretch of talk before one capture doesn't dwarf the image. */
const CLAMP_CHARS = 520;

export function ScreenshotsTab({
  transcriptionSessionId,
  screenshots,
  videoUrl,
  hasTranscript,
  transcription,
  isTranscriptLoading,
}: ScreenshotsTabProps) {
  const utils = api.useUtils();
  const uploadScreenshot = api.transcription.uploadScreenshot.useMutation();
  const [uploadingCount, setUploadingCount] = useState(0);
  const resetFileRef = useRef<() => void>(null);

  // Default to the narrative: the point of the tab is a story a reader can
  // follow, not a contact sheet. The last explicit choice is remembered.
  const [view, setView] = useState<ScreenshotsView>("narrative");
  useEffect(() => {
    const stored = readStoredView();
    if (stored) setView(stored);
  }, []);
  function changeView(next: ScreenshotsView) {
    setView(next);
    storeView(next);
  }

  // The narrative needs the transcript; without one there is nothing to pair,
  // so the toggle is hidden and the grid is all there is.
  const canNarrate = hasTranscript;
  const effectiveView: ScreenshotsView = canNarrate ? view : "grid";

  const orderedScreenshots = useMemo(
    () => sortScreenshotsChronologically(screenshots),
    [screenshots],
  );
  const narrative = useMemo(
    () =>
      effectiveView === "narrative"
        ? buildScreenshotNarrative(transcription, screenshots)
        : [],
    [effectiveView, transcription, screenshots],
  );
  const hasAnyNarration = narrative.some((entry) => entry.turns.length > 0);

  async function uploadFiles(files: File[]) {
    const { images, errors, skippedCount } = await readMeetingImages(files);
    if (skippedCount > 0) {
      notifications.show({
        title: "Not an image",
        message: "Only image files can be added to a meeting.",
        color: "yellow",
      });
    }
    for (const message of errors) {
      notifications.show({ title: "Couldn't add image", message, color: "red" });
    }
    if (images.length === 0) return;

    setUploadingCount((n) => n + images.length);
    let failed = 0;
    // One at a time so the images land in the order they were dropped.
    for (const image of images) {
      try {
        await uploadScreenshot.mutateAsync({
          transcriptionSessionId,
          base64Data: image.base64,
          contentType: image.contentType,
        });
      } catch (error) {
        failed += 1;
        reportHandledError(error, {
          area: "meeting-image-upload",
          context: { transcriptionSessionId, contentType: image.contentType },
        });
      } finally {
        setUploadingCount((n) => n - 1);
      }
    }
    await utils.transcription.getDetail.invalidate({ id: transcriptionSessionId });

    if (failed > 0) {
      notifications.show({
        title: "Upload failed",
        message: `${failed} of ${images.length} image${images.length === 1 ? "" : "s"} couldn't be added.`,
        color: "red",
      });
    }
  }

  const fileDrop = useFileDrop((files) => void uploadFiles(files));

  // Paste a screenshot while this tab is open to add it. Pastes into text
  // fields are left alone.
  const uploadFilesRef = useRef(uploadFiles);
  uploadFilesRef.current = uploadFiles;
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (isEditableTarget(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
      if (files.length === 0) return;
      e.preventDefault();
      void uploadFilesRef.current(files);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const isUploading = uploadingCount > 0;

  return (
    <div
      {...fileDrop.handlers}
      className={`mp-shots-drop ${fileDrop.isDragging ? "is-dragging" : ""}`}
      data-testid="screenshots-drop-target"
    >
      {screenshots.length > 0 && (
        <div className="mp-shots-head">
          <div className="mp-sec" style={{ margin: 0, flex: 1 }}>
            <h3>Frames &amp; images</h3>
            <span className="mp-sec__count">{screenshots.length}</span>
            <span className="mp-sec__rule" />
          </div>
          {canNarrate && (
            <SegmentedControl
              size="xs"
              radius="sm"
              aria-label="Screenshots view"
              data-testid="screenshots-view-toggle"
              value={effectiveView}
              onChange={(value) => changeView(value === "grid" ? "grid" : "narrative")}
              data={[
                { label: "With transcript", value: "narrative" },
                { label: "Screenshots only", value: "grid" },
              ]}
            />
          )}
          {videoUrl && (
            <a
              className="mp-chipbtn"
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconExternalLink size={11} /> Open recording
            </a>
          )}
        </div>
      )}

      <FileButton
        multiple
        accept="image/*"
        resetRef={resetFileRef}
        onChange={(files) => {
          resetFileRef.current?.();
          if (files.length > 0) void uploadFiles(files);
        }}
      >
        {(buttonProps) => (
          <button
            {...buttonProps}
            type="button"
            className="mp-shots-add"
            disabled={isUploading}
          >
            <span className="mp-shots-add__icon">
              {isUploading ? <Loader size={14} /> : <IconUpload size={15} />}
            </span>
            <span>
              <span className="mp-shots-add__title">
                {isUploading
                  ? `Uploading ${uploadingCount} image${uploadingCount === 1 ? "" : "s"}…`
                  : screenshots.length === 0
                    ? "No screenshots yet — drop images here to add them"
                    : "Drop images here to add them"}
              </span>
              <span className="mp-shots-add__hint">
                Or click to browse, or paste a screenshot
              </span>
            </span>
          </button>
        )}
      </FileButton>

      {screenshots.length > 0 && effectiveView === "narrative" && (
        isTranscriptLoading ? (
          <div className="mp-empty" data-testid="screenshots-narrative-loading">
            <Loader size="sm" />
          </div>
        ) : (
          <>
            {transcription !== undefined && !hasAnyNarration && (
              <p className="mp-story__note" data-testid="screenshots-narrative-note">
                This transcript has no capture markers, so the images can&apos;t be
                matched to what was said.
              </p>
            )}
            <ScreenshotNarrative entries={narrative} />
          </>
        )
      )}

      {screenshots.length > 0 && effectiveView === "grid" && (
        <div className="mp-shots" data-testid="screenshots-grid">
          {orderedScreenshots.map((shot) => (
            <figure key={shot.id} className="mp-shot" style={{ margin: 0 }}>
              <div className="mp-shot__frame">
                {shot.timestamp && <span className="mp-shot__time">{shot.timestamp}</span>}
                <Image
                  className="mp-shot__img"
                  src={shot.url}
                  fit="cover"
                  alt={shot.timestamp ? `Screen capture at ${shot.timestamp}` : "Meeting image"}
                  onClick={() => window.open(shot.url, "_blank")}
                />
              </div>
              {shot.timestamp && <figcaption className="mp-shot__cap">{shot.timestamp}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {fileDrop.isDragging && (
        <div className="mp-shots-drop__overlay" aria-hidden>
          <IconPhoto size={28} />
          <span>Drop images to add them to this meeting</span>
        </div>
      )}
    </div>
  );
}

function ScreenshotNarrative({ entries }: { entries: ScreenshotNarrativeEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ol className="mp-story" data-testid="screenshots-narrative">
      {entries.map(({ screenshot, index, turns }) => {
        const chars = turns.reduce((n, t) => n + t.text.length, 0);
        const isLong = chars > CLAMP_CHARS;
        const isExpanded = expanded.has(screenshot.id);
        const alt = screenshot.timestamp
          ? `Screen capture ${index} at ${screenshot.timestamp}`
          : `Meeting image ${index}`;
        return (
          <li key={screenshot.id} className="mp-story__row" data-testid="screenshots-narrative-row">
            <span className="mp-story__num" aria-hidden>
              {index}
            </span>
            <article className="mp-story__card">
              <div className="mp-story__frame">
                {screenshot.timestamp && (
                  <span className="mp-shot__time">{screenshot.timestamp}</span>
                )}
                <Image
                  className="mp-story__img"
                  src={screenshot.url}
                  fit="contain"
                  alt={alt}
                  onClick={() => window.open(screenshot.url, "_blank")}
                />
              </div>
              <div className="mp-story__text">
                {turns.length === 0 ? (
                  <p className="mp-story__none">No transcript for this image.</p>
                ) : (
                  <>
                    <div className="mp-story__eyebrow">Said before this capture</div>
                    <div
                      className={`mp-story__passage ${isLong && !isExpanded ? "is-clamped" : ""}`}
                    >
                      {turns.map((turn, i) => (
                        <p key={i} className="mp-story__turn">
                          {turn.speaker && (
                            <b className={`mp-story__speaker is-${turn.flavor ?? "them"}`}>
                              {turn.speaker}
                            </b>
                          )}
                          {turn.text}
                        </p>
                      ))}
                    </div>
                    {isLong && (
                      <button
                        type="button"
                        className="mp-story__more"
                        onClick={() => toggleExpanded(screenshot.id)}
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
