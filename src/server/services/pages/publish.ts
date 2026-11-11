/**
 * Publishing one page (ADR-0038): first publish mints the immutable 8-char
 * `publicId`; later publishes reuse it so old links revive. Shared by
 * `page.publish` / `publishMany` (which also publish a holding page's rows,
 * ADR-0078 §4) and by `database.createRow`, so a row added to an already
 * published page is published like its siblings.
 */
import { randomInt } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH, slugifyPageTitle } from "~/lib/pages/public-url";

/** The publishing state the share popover renders (ADR-0038). */
export const PUBLIC_SETTINGS_SELECT = {
  id: true,
  isPublic: true,
  publicId: true,
  publicSlug: true,
  publicSeoIndexed: true,
  publishedAt: true,
} satisfies Prisma.KnowledgePageSelect;

/** Mint an 8-char lowercase-alphanumeric public id (ADR-0038). */
export function generatePublicId(): string {
  let id = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i++) {
    id += PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)];
  }
  return id;
}

/**
 * Publish one page. Callers enforce access. The first publish mints the id
 * (retrying the 36^8 collision rather than pre-checking; `publicId: null` in
 * the where makes a concurrent first publish reuse the winner's id).
 */
export async function publishOnePage(db: PrismaClient, id: string) {
  const existing = await db.knowledgePage.findUniqueOrThrow({
    where: { id },
    select: { title: true, publicId: true, publicSlug: true },
  });

  const publicSlug = existing.publicSlug ?? slugifyPageTitle(existing.title);

  if (existing.publicId) {
    return db.knowledgePage.update({
      where: { id },
      data: { isPublic: true, publicSlug, publishedAt: new Date() },
      select: PUBLIC_SETTINGS_SELECT,
    });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.knowledgePage.update({
        where: { id, AND: [{ publicId: null }] },
        data: {
          isPublic: true,
          publicId: generatePublicId(),
          publicSlug,
          publishedAt: new Date(),
        },
        select: PUBLIC_SETTINGS_SELECT,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002: minted id collided with another page's — remint.
        if (error.code === "P2002") continue;
        // P2025: a concurrent publish minted first — keep its id.
        if (error.code === "P2025") {
          return db.knowledgePage.update({
            where: { id },
            data: { isPublic: true, publishedAt: new Date() },
            select: PUBLIC_SETTINGS_SELECT,
          });
        }
      }
      throw error;
    }
  }
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Could not allocate a public URL. Please try again.",
  });
}
