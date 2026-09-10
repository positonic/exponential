import { notifications } from "@mantine/notifications";

/** The server's own cap on `page.uploadImage` / `feature.uploadImage`. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Host-supplied uploader: base64 payload in, blob URL out. */
export type UploadImage = (base64Data: string) => Promise<{ url: string }>;

/**
 * Turn a picked, pasted or dropped file into an image URL ready to insert.
 *
 * The one place the editor's image rules live, shared by every way an image
 * gets in (paste, drop, and the `/image` block): reject non-images silently
 * (the caller falls through to default handling), refuse anything over the
 * server's cap with a notification rather than a failed round-trip, and turn
 * an upload failure into a notification too.
 *
 * Resolves the URL to insert, or null when nothing should be inserted — the
 * caller never has to distinguish "not an image" from "already reported".
 */
export async function uploadImageFile(
  file: File,
  upload: UploadImage,
  options: { reportWrongType?: boolean } = {},
): Promise<string | null> {
  if (!file.type.startsWith("image/")) {
    // Paste and drop fall through to the editor's default handling here, so
    // they stay quiet. A file picked from the `/image` dialog has nowhere else
    // to go, and silence there reads as the command doing nothing.
    if (options.reportWrongType) {
      notifications.show({
        title: "Not an image",
        message: "Pick a PNG, JPEG, GIF, WebP or SVG file.",
        color: "red",
      });
    }
    return null;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    notifications.show({
      title: "Image too large",
      message: "Please use an image under 5MB.",
      color: "red",
    });
    return null;
  }

  const base64 = await readBase64(file);
  if (!base64) return null;

  try {
    const { url } = await upload(base64);
    return url;
  } catch {
    notifications.show({
      title: "Upload failed",
      message: "Could not upload the image. Please try again.",
      color: "red",
    });
    return null;
  }
}

/** The payload half of a data URL, or null if the read produced nothing. */
function readBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? (result.split(",")[1] ?? null) : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Open the OS file picker for a single image and resolve the chosen file.
 * Used by the `/image` block, which has no file input of its own.
 *
 * Resolves null when the dialog is dismissed. Current browsers fire a `cancel`
 * event for that; older ones fire nothing at all, in which case the promise
 * never settles and the input is left to be garbage-collected — which callers
 * treat as "nothing happened", the same outcome.
 */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
