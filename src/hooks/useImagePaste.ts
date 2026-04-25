"use client";

import { useCallback } from "react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface UseImagePasteOptions {
  actionId: string;
  onImageUploaded: (markdownRef: string) => void;
}

interface UseImagePasteReturn {
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  isUploading: boolean;
}

export function useImagePaste({
  actionId,
  onImageUploaded,
}: UseImagePasteOptions): UseImagePasteReturn {
  const uploadImage = api.action.uploadImage.useMutation();
  const utils = api.useUtils();

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;

        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > 5 * 1024 * 1024) {
          notifications.show({
            title: "Image too large",
            message: "Please paste an image under 5MB.",
            color: "red",
          });
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          if (!base64) return;

          uploadImage
            .mutateAsync({
              actionId,
              base64Data: base64,
            })
            .then((res) => {
              const markdownRef = `![image](${res.url})`;
              onImageUploaded(markdownRef);
              void utils.action.getById.invalidate({ id: actionId });
            })
            .catch(() => {
              notifications.show({
                title: "Upload failed",
                message: "Failed to upload image. Please try again.",
                color: "red",
              });
            });
        };
        reader.readAsDataURL(file);
        return; // Only handle the first image
      }
    },
    [actionId, onImageUploaded, uploadImage, utils],
  );

  return { handlePaste, isUploading: uploadImage.isPending };
}
