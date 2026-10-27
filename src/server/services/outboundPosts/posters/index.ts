/**
 * One poster per provider, keyed by `ChannelLink.provider`. Adding a provider is one
 * file plus one line here; no producer changes.
 */

import type { PrismaClient } from "@prisma/client";
import type { RoomPoster } from "../types";
import { createMatrixRoomPoster } from "./matrix";

export type PosterRegistry = ReadonlyMap<string, RoomPoster>;

export function createPosters(db: PrismaClient): PosterRegistry {
  const matrix = createMatrixRoomPoster(db);
  return new Map([[matrix.provider, matrix]]);
}
