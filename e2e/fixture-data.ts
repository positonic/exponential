/**
 * Reads the seeded-fixture manifest written by global-setup, giving specs the
 * URLs/ids of the seeded data without hardcoding CUIDs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { SeededFixture } from "../scripts/dev-fixture/seed";

export function loadFixture(): SeededFixture {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth", "fixture.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as SeededFixture;
}
