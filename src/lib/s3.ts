/**
 * S3 client for storing original document files for the document tracker feature.
 *
 * Adapted from one2b's s3 helper. Supports any S3-compatible storage
 * (AWS S3, MinIO, Cloudflare R2) via an optional `S3_ENDPOINT` env var.
 *
 * Env vars required:
 *   - AWS_REGION              (defaults to us-east-1 if missing)
 *   - AWS_ACCESS_KEY_ID
 *   - AWS_SECRET_ACCESS_KEY
 *   - S3_BUCKET
 *   - S3_ENDPOINT             (optional; for MinIO/R2/etc.)
 *
 * All exported helpers throw a clear error if `S3_BUCKET` (or credentials)
 * are missing — they fail fast rather than silently no-op.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
}

function getS3Config(): S3Config {
  const region = process.env.AWS_REGION ?? "us-east-1";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;

  const missing: string[] = [];
  if (!accessKeyId) missing.push("AWS_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("AWS_SECRET_ACCESS_KEY");
  if (!bucket) missing.push("S3_BUCKET");

  if (missing.length > 0) {
    throw new Error(
      `S3 storage is not configured. Missing env var(s): ${missing.join(", ")}. ` +
        `Set these in your environment to enable document storage.`,
    );
  }

  return {
    region,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    bucket: bucket!,
    endpoint,
  };
}

let cachedClient: S3Client | null = null;

/**
 * Returns a singleton S3 client. Lazily initialised so importing this
 * module does NOT require S3 env vars at startup.
 */
export function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;
  const cfg = getS3Config();
  cachedClient = new S3Client({
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    ...(cfg.endpoint
      ? {
          endpoint: cfg.endpoint,
          forcePathStyle: true,
        }
      : {}),
  });
  return cachedClient;
}

export interface UploadFileInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface UploadFileResult {
  key: string;
  /**
   * Canonical s3:// URI for the uploaded object. Use
   * `getPresignedDownloadUrl` to get a fetchable URL.
   */
  url: string;
}

/**
 * Upload a file buffer to the configured S3 bucket.
 */
export async function uploadFile(
  input: UploadFileInput,
): Promise<UploadFileResult> {
  const cfg = getS3Config();
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );

  return {
    key: input.key,
    url: `s3://${cfg.bucket}/${input.key}`,
  };
}

/**
 * Generate a presigned URL the browser can use to download an object.
 * Default expiry is 1 hour.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  const cfg = getS3Config();
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/**
 * Download an S3 object as a Node Buffer.
 * Used by ingestion + extraction pipelines.
 */
export async function downloadObject(key: string): Promise<Buffer> {
  const cfg = getS3Config();
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
  );

  if (!response.Body) {
    throw new Error(`S3 object ${key} returned no body`);
  }

  const chunks: Uint8Array[] = [];
  // Body is a Node Readable stream when running on Node runtime.
  // The AWS SDK types it as the broader StreamingBlobPayloadOutputTypes
  // union, so we iterate via async iterator which works for the Node case.
  const stream = response.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Delete an S3 object. No-op-tolerant: if the key doesn't exist,
 * the AWS SDK will not throw.
 */
export async function deleteObject(key: string): Promise<void> {
  const cfg = getS3Config();
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
  );
}

/**
 * Build the canonical S3 key for a document file.
 * Sanitises the filename to a safe set of characters.
 */
export function keyForDocument(documentId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `documents/${documentId}/${safeName}`;
}
