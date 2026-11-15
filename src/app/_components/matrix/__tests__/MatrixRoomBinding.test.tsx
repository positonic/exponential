/**
 * The binding control is per kind (ADR-0075): a decisions binding reads and writes
 * its own rows and never the meeting-summary ones. The server-side isolation is
 * covered in matrixRoom.test.ts; these pin that the control asks for the right kind.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";

const getBindingArgs: unknown[] = [];
const setOffMutate = vi.fn();
const unbindMutate = vi.fn();
const bindMutate = vi.fn();

const state: { mode: "inherit" | "room" | "off"; effective: { kind: string; name?: string } } = {
  mode: "inherit",
  effective: { kind: "none" },
};

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ matrixRoom: { getBinding: { invalidate: vi.fn() } } }),
    matrixServer: {
      list: { useQuery: () => ({ data: [{ id: "srv-1" }], isLoading: false, error: null }) },
      rooms: { useQuery: () => ({ data: { joined: [], invited: [] }, isLoading: false, error: null }) },
      acceptInvite: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
    matrixRoom: {
      invitableMembers: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      createRoom: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      getBinding: {
        useQuery: (args: unknown) => {
          getBindingArgs.push(args);
          return {
            data: { mode: state.mode, room: null, effective: state.effective },
            isLoading: false,
            error: null,
          };
        },
      },
      bind: { useMutation: () => ({ mutate: bindMutate, isPending: false, error: null }) },
      setOff: { useMutation: () => ({ mutate: setOffMutate, isPending: false, error: null }) },
      unbind: { useMutation: () => ({ mutate: unbindMutate, isPending: false, error: null }) },
    },
  },
}));

import { MatrixRoomBinding } from "../MatrixRoomBinding";

beforeEach(() => {
  getBindingArgs.length = 0;
  setOffMutate.mockClear();
  unbindMutate.mockClear();
  bindMutate.mockClear();
  state.mode = "inherit";
  state.effective = { kind: "none" };
});

describe("MatrixRoomBinding per kind", () => {
  test("defaults to the meeting-summary kind so existing callers are unchanged", () => {
    render(<MatrixRoomBinding workspaceId="ws-1" projectId="p-1" />);

    expect(getBindingArgs[0]).toEqual({ workspaceId: "ws-1", projectId: "p-1", kind: "meeting_summary" });
  });

  test("a decisions binding queries its own kind", () => {
    render(<MatrixRoomBinding workspaceId="ws-1" projectId="p-1" kind="decision" />);

    expect(getBindingArgs[0]).toEqual({ workspaceId: "ws-1", projectId: "p-1", kind: "decision" });
  });

  test("switching decisions Off sends the kind, so meeting summaries are untouched", () => {
    render(<MatrixRoomBinding workspaceId="ws-1" projectId="p-1" kind="decision" />);

    fireEvent.click(screen.getByText("Off"));

    expect(setOffMutate).toHaveBeenCalledWith({ workspaceId: "ws-1", projectId: "p-1", kind: "decision" });
  });

  test("Off explains itself in the kind's own words", () => {
    state.mode = "off";
    render(<MatrixRoomBinding workspaceId="ws-1" projectId="p-1" kind="decision" />);

    expect(screen.getByText("Decisions for this project stay in Exponential.")).toBeTruthy();
  });

  test("the workspace default for decisions offers to set a room, scoped to the kind", () => {
    render(<MatrixRoomBinding workspaceId="ws-1" projectId={null} kind="decision" />);

    expect(screen.getByText("Set a default room")).toBeTruthy();
    expect(getBindingArgs[0]).toEqual({ workspaceId: "ws-1", projectId: null, kind: "decision" });
  });
});
