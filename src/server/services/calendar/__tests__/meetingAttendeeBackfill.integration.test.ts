import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getTestDb } from "~/test/test-db";
import { createUser, createWorkspace } from "~/test/factories";

/**
 * The 20261008150000 migration turns MeetingAttendee from member-only rows
 * into Attendees keyed by email (ADR-0059 amendment, 2026-10-07), backfilling
 * every existing row from its User before the NOT NULL and the new
 * (meetingId, email) unique land.
 *
 * The test database is migrated to head, so this rolls the table back to its
 * pre-V4 shape, inserts rows the way the old code wrote them, and replays the
 * migration's own MeetingAttendee statements from `migration.sql`. All of it
 * runs in one transaction that is always rolled back: Postgres DDL is
 * transactional, so the shared test schema is never left half-migrated.
 */
const MIGRATION = join(
  process.cwd(),
  "prisma/migrations/20261008150000_one_off_ceremony_and_external_attendees/migration.sql",
);

/** The migration's statements that touch MeetingAttendee, comments stripped, in order. */
function attendeeStatements(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split(/;\s*$/m)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.includes('"MeetingAttendee"'));
}

/** The pre-V4 table: userId required, unique per (meetingId, userId), no email/name/contact. */
const ROLL_BACK_TO_PRE_V4 = [
  'ALTER TABLE "MeetingAttendee" DROP CONSTRAINT "MeetingAttendee_contactId_fkey"',
  'ALTER TABLE "MeetingAttendee" DROP CONSTRAINT "MeetingAttendee_userId_fkey"',
  'DROP INDEX "MeetingAttendee_contactId_idx"',
  'DROP INDEX "MeetingAttendee_meetingId_email_key"',
  'ALTER TABLE "MeetingAttendee" DROP COLUMN "contactId", DROP COLUMN "email", DROP COLUMN "name"',
  'ALTER TABLE "MeetingAttendee" ALTER COLUMN "userId" SET NOT NULL',
  'CREATE UNIQUE INDEX "MeetingAttendee_meetingId_userId_key" ON "MeetingAttendee"("meetingId", "userId")',
  'ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
];

class Rollback extends Error {}

describe("MeetingAttendee migration backfill", () => {
  it("fills email and name from the user, and the (meetingId, email) unique rejects a duplicate", async () => {
    const db = getTestDb();
    const owner = await createUser(db, { email: "Owner@Example.com", name: "Owner" });
    const noEmail = await db.user.create({ data: { name: "No Mail" } });
    // Same inbox, different case: both backfill to "ada@example.com".
    const adaUpper = await createUser(db, { email: "Ada@Example.com", name: "Ada (old account)" });
    const adaLower = await createUser(db, { email: "ada@example.com", name: "Ada" });
    const organizerTwin = await createUser(db, { email: "OWNER@example.com", name: "Owner twin" });
    const workspace = await createWorkspace(db, { ownerId: owner.id });

    let observed: {
      rows: Array<{ userId: string; email: string; name: string | null }>;
      duplicateRejected: boolean;
    } | null = null;

    await db
      .$transaction(async (tx) => {
        for (const sql of ROLL_BACK_TO_PRE_V4) await tx.$executeRawUnsafe(sql);

        await tx.$executeRawUnsafe(
          `INSERT INTO "Meeting" ("id", "workspaceId", "organizerId", "title", "startsAt", "endsAt", "icalUid", "updatedAt")
           VALUES ('m-backfill', $1, $2, 'Before V4', now(), now() + interval '1 hour', 'uid-backfill@exponential.im', now())`,
          workspace.id,
          owner.id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "MeetingAttendee" ("id", "meetingId", "userId") VALUES
             ('a-0', 'm-backfill', $5), ('a-1', 'm-backfill', $1), ('a-2', 'm-backfill', $2),
             ('a-3', 'm-backfill', $3), ('a-4', 'm-backfill', $4)`,
          owner.id,
          noEmail.id,
          adaUpper.id,
          adaLower.id,
          organizerTwin.id,
        );

        for (const sql of attendeeStatements()) await tx.$executeRawUnsafe(sql);

        const rows = await tx.$queryRawUnsafe<Array<{ userId: string; email: string; name: string | null }>>(
          `SELECT "userId", "email", "name" FROM "MeetingAttendee" WHERE "meetingId" = 'm-backfill' ORDER BY "id"`,
        );

        // A failed statement aborts the transaction, so probe the unique
        // behind a savepoint.
        let duplicateRejected = false;
        await tx.$executeRawUnsafe("SAVEPOINT duplicate_probe");
        try {
          await tx.$executeRawUnsafe(
            `INSERT INTO "MeetingAttendee" ("id", "meetingId", "email") VALUES ('a-9', 'm-backfill', 'owner@example.com')`,
          );
        } catch {
          duplicateRejected = true;
        }
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT duplicate_probe");

        observed = { rows, duplicateRejected };
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });

    expect(observed).not.toBeNull();
    // Case-twins collapse to one row: the organizer's for their address
    // (even though the twin's row is older), else the oldest.
    expect(observed!.rows).toEqual([
      { userId: owner.id, email: "owner@example.com", name: "Owner" },
      { userId: noEmail.id, email: `user:${noEmail.id}`, name: "No Mail" },
      { userId: adaUpper.id, email: "ada@example.com", name: "Ada (old account)" },
    ]);
    expect(observed!.duplicateRejected).toBe(true);

    // The rollback restored the migrated table: an external attendee row fits.
    const columns = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'MeetingAttendee'`,
    );
    expect(columns.map((c) => c.column_name)).toEqual(expect.arrayContaining(["email", "name", "contactId"]));
  });
});
