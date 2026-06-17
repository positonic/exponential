-- Level B auto-filing idempotency (ADR-0012 decision 4): a filed failure is
-- never filed twice. filedRef records the destination (beads issue / Ticket).
ALTER TABLE "ThreadScore" ADD COLUMN "filedAt" TIMESTAMP(3);
ALTER TABLE "ThreadScore" ADD COLUMN "filedRef" TEXT;
