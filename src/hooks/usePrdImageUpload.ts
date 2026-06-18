"use client";

import { useMemo } from "react";
import type { EditorView } from "@tiptap/pm/view";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Image paste/drop for the PRD editor (ADR-0024). Mirrors `useImagePaste` but
 * targets the ProseMirror document: an uploaded image is inserted as an inline
 * `image` node (which the codec serialises to a Markdown image link) rather than
 * a Markdown string. Returns Tiptap `editorProps` handlers; upload runs via
 * `feature.uploadImage`.
 */
export function usePrdImageUpload(featureId: string) {
  const uploadImage = api.product.feature.uploadImage.useMutation();

  return useMemo(() => {
    const insertImage = (view: EditorView, file: File, pos?: number): boolean => {
      if (!file.type.startsWith("image/")) return false;
      if (file.size > MAX_IMAGE_BYTES) {
        notifications.show({
          title: "Image too large",
          message: "Please use an image under 5MB.",
          color: "red",
        });
        return true;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") return;
        const base64 = result.split(",")[1];
        if (!base64) return;

        uploadImage
          .mutateAsync({ id: featureId, base64Data: base64 })
          .then((res) => {
            const { state } = view;
            const node = state.schema.nodes.image?.create({ src: res.url });
            if (!node) return;
            const at = pos ?? state.selection.from;
            view.dispatch(state.tr.insert(at, node));
          })
          .catch(() => {
            notifications.show({
              title: "Upload failed",
              message: "Could not upload the image. Please try again.",
              color: "red",
            });
          });
      };
      reader.readAsDataURL(file);
      return true;
    };

    const firstImage = (list?: FileList | null): File | null => {
      if (!list) return null;
      for (const file of Array.from(list)) {
        if (file.type.startsWith("image/")) return file;
      }
      return null;
    };

    return {
      handlePaste: (view: EditorView, event: ClipboardEvent): boolean => {
        const file = firstImage(event.clipboardData?.files);
        if (!file) return false;
        event.preventDefault();
        return insertImage(view, file);
      },
      handleDrop: (view: EditorView, event: DragEvent): boolean => {
        const file = firstImage(event.dataTransfer?.files);
        if (!file) return false;
        event.preventDefault();
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        return insertImage(view, file, coords?.pos);
      },
    };
  }, [featureId, uploadImage]);
}
