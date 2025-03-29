import { PutBlobResult } from '@vercel/blob';
import { put } from '@vercel/blob';

export async function uploadToBlob(
  base64Data: string, 
  filename: string
): Promise<PutBlobResult> {
  // Convert base64 to Buffer
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Upload to Vercel Blob
  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: 'image/png'
  });

  return blob;
} 