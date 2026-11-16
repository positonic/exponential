import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: {} }));

import { createImapClient } from "../UserEmailService";

describe("createImapClient", () => {
  it("absorbs an emitted socket timeout instead of throwing it as uncaught", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = createImapClient({ host: "imap.example.test", port: 993, user: "a@example.test", pass: "x" });

    const timeout = Object.assign(new Error("Socket timeout"), { code: "ETIMEOUT" });
    // An EventEmitter with no `error` listener rethrows here; that rethrow
    // was the fatal crash.
    expect(() => client.emit("error", timeout)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "[UserEmailService] IMAP connection error",
      expect.objectContaining({ code: "ETIMEOUT", message: "Socket timeout" }),
    );
    warn.mockRestore();
  });
});
