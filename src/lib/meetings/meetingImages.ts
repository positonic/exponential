/**
 * Images attached to a Meeting by hand (dropped or pasted into the Add Meeting
 * modal). They are stored as Screenshot rows on the session, so they appear on
 * the meeting's Screenshots tab.
 */

export const MEETING_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type MeetingImageContentType =
  (typeof MEETING_IMAGE_CONTENT_TYPES)[number];

export interface PendingMeetingImage {
  id: string;
  name: string;
  base64: string;
  contentType: MeetingImageContentType;
  previewUrl: string;
}

// Images travel to the server as base64 inside a tRPC request, and Vercel caps
// function request bodies at 4.5MB. Base64 inflates by a third, so anything
// over this many raw bytes is re-encoded as a downscaled JPEG first.
const MAX_RAW_BYTES = 2.5 * 1024 * 1024;
/**
 * Longest base64 payload an image may have — the encoded size of a file at the
 * pass-through limit, padding included. The server enforces the same cap.
 */
export const MAX_MEETING_IMAGE_BASE64_LENGTH =
  Math.ceil(MAX_RAW_BYTES / 3) * 4;

// Progressively smaller encodes tried for an oversized image.
const REENCODE_STEPS = [
  { maxDimension: 2560, quality: 0.85 },
  { maxDimension: 1920, quality: 0.75 },
  { maxDimension: 1280, quality: 0.7 },
];

function isSupportedContentType(
  type: string,
): type is MeetingImageContentType {
  return (MEETING_IMAGE_CONTENT_TYPES as readonly string[]).includes(type);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

async function reencodeAsJpeg(
  file: File,
  name: string,
  maxDimension: number,
  quality: number,
): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // SVG, or HEIC outside Safari: the browser can't decode it, and its own
    // DOMException text tells the user nothing.
    throw new Error(
      `${name} isn't a supported image format — use PNG, JPEG, WebP or GIF`,
    );
  }
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    // JPEG has no alpha: without an opaque fill, transparent pixels (e.g. the
    // shadow around a macOS window screenshot) come out black.
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    bitmap.close();
  }
}

let nextImageId = 0;

/**
 * Read a dropped/pasted image into an upload-ready payload. Small images in a
 * supported format pass through untouched; oversized or unusual formats (e.g.
 * HEIC where the browser can decode it) are re-encoded as JPEG.
 */
export async function readMeetingImage(
  file: File,
): Promise<PendingMeetingImage> {
  const id = `meeting-image-${Date.now()}-${nextImageId++}`;
  const name = file.name || "Pasted image";

  if (isSupportedContentType(file.type) && file.size <= MAX_RAW_BYTES) {
    const dataUrl = await readAsDataUrl(file);
    return {
      id,
      name,
      base64: dataUrl.split(",")[1] ?? "",
      contentType: file.type,
      previewUrl: dataUrl,
    };
  }

  for (const step of REENCODE_STEPS) {
    const dataUrl = await reencodeAsJpeg(
      file,
      name,
      step.maxDimension,
      step.quality,
    );
    const base64 = dataUrl.split(",")[1] ?? "";
    if (base64.length <= MAX_MEETING_IMAGE_BASE64_LENGTH) {
      return { id, name, base64, contentType: "image/jpeg", previewUrl: dataUrl };
    }
  }
  throw new Error(`${name} is too large to attach`);
}

export interface ReadMeetingImagesResult {
  images: PendingMeetingImage[];
  /** One message per image that couldn't be read. */
  errors: string[];
  /** Files that weren't images at all. */
  skippedCount: number;
}

/** Read a batch of dropped/pasted files, keeping their order. */
export async function readMeetingImages(
  files: File[],
): Promise<ReadMeetingImagesResult> {
  const imageFiles = files.filter(isImageFile);
  const results = await Promise.allSettled(imageFiles.map(readMeetingImage));
  const images: PendingMeetingImage[] = [];
  const errors: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      images.push(result.value);
    } else {
      errors.push(
        result.reason instanceof Error
          ? result.reason.message
          : "That image could not be read.",
      );
    }
  }
  return { images, errors, skippedCount: files.length - imageFiles.length };
}
