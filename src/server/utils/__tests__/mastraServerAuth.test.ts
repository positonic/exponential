/**
 * Telling the Mastra server apart from everything else that holds an agent
 * token: only a request carrying the shared server key counts, and with no
 * key configured nothing does.
 */

import { describe, expect, it } from "vitest";
import { MASTRA_SERVER_KEY_HEADER, isMastraServerRequest } from "../mastraServerAuth";

const ENV = { MASTRA_SERVER_API_KEY: "server-secret-123" };
const withKey = (value: string) => new Headers({ [MASTRA_SERVER_KEY_HEADER]: value });

describe("isMastraServerRequest", () => {
  it("accepts the shared server key", () => {
    expect(isMastraServerRequest(withKey("server-secret-123"), ENV)).toBe(true);
  });

  it("refuses a wrong key, a key of another length, and no key", () => {
    expect(isMastraServerRequest(withKey("server-secret-124"), ENV)).toBe(false);
    expect(isMastraServerRequest(withKey("server-secret"), ENV)).toBe(false);
    expect(isMastraServerRequest(new Headers(), ENV)).toBe(false);
  });

  it("does not take the agent's bearer token for the server key", () => {
    expect(isMastraServerRequest(new Headers({ authorization: "Bearer server-secret-123" }), ENV)).toBe(false);
  });

  it("refuses everyone when no server key is configured", () => {
    expect(isMastraServerRequest(withKey(""), {})).toBe(false);
    expect(isMastraServerRequest(withKey("anything"), {})).toBe(false);
    expect(isMastraServerRequest(withKey("anything"), { MASTRA_SERVER_API_KEY: "" })).toBe(false);
  });
});
