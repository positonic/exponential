"use client";

import { useEffect, useRef, useState } from "react";
import { FileButton, Image, Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconExternalLink, IconPhoto, IconUpload } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useFileDrop } from "~/hooks/useFileDrop";
import { isImageFile, readMeetingImages } from "~/lib/meetings/meetingImages";
import { reportHandledError } from "~/lib/reportHandledError";

interface ScreenshotItem {
  id: string;
  url: string;
  timestamp: string | null;
}

interface ScreenshotsTabProps {
  transcriptionSessionId: string;
  screenshots: ScreenshotItem[];
  videoUrl: string | null;
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA")
  );
}

export function ScreenshotsTab({
  transcriptionSessionId,
  screenshots,
  videoUrl,
}: ScreenshotsTabProps) {
  const utils = api.useUtils();
  const uploadScreenshot = api.transcription.uploadScreenshot.useMutation();
  const [uploadingCount, setUploadingCount] = useState(0);
  const resetFileRef = useRef<() => void>(null);

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
    await utils.transcription.getById.invalidate({ id: transcriptionSessionId });

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

      {screenshots.length > 0 && (
        <div className="mp-shots">
          {screenshots.map((shot) => (
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
