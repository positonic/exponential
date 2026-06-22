import { type PutBlobResult } from '@vercel/blob';
import { del, put } from '@vercel/blob';

export async function uploadToBlob(
  base64Data: string,
  filename: string,
  contentType = "image/png",
): Promise<PutBlobResult> {
  const buffer = Buffer.from(base64Data, "base64");
  const blob = await put(filename, buffer, { access: "public", contentType });
  return blob;
}

export async function deleteFromBlob(url: string): Promise<void> {
  await del(url);
} 