/**
 * The post button's own decisions: what it tells the user before posting, and whether
 * choosing a room quietly reconfigures their project.
 *
 * The seam's behaviour is covered in postMeetingSummary.test.ts; these are the choices
 * that only exist in the UI.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";

interface Effective {
  kind: "room" | "off" | "none";
  name?: string;
  inherited?: boolean;
}

const state: {
  servers: { id: string }[];
  effective: Effective;
  rooms: { joined: { roomId: string; name: string; isEncrypted: boolean }[]; invited: [] };
} = {
  servers: [{ id: "srv-1" }],
  effective: { kind: "none" },
  rooms: { joined: [], invited: [] },
};

const postMutate = vi.fn();
const bindMutate = vi.fn();
/** What the next postToMatrix call should resolve to, so onSuccess branches can run. */
const mutationResult: { current: unknown } = { current: null };

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({ matrixRoom: { getBinding: { invalidate: vi.fn() } } }),
    matrixServer: {
      list: { useQuery: () => ({ data: state.servers, isLoading: false, error: null }) },
      rooms: { useQuery: () => ({ data: state.rooms, isLoading: false, error: null }) },
      acceptInvite: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
      },
    },
    matrixRoom: {
      getBinding: {
        useQuery: () => ({
          data: { mode: "inherit", room: null, effective: state.effective },
          isLoading: false,
          error: null,
        }),
      },
      bind: { useMutation: () => ({ mutate: bindMutate, isPending: false, error: null }) },
    },
    transcription: {
      postToMatrix: {
        useMutation: (opts?: { onSuccess?: (r: unknown) => void }) => ({
          mutate: (vars: unknown) => {
            postMutate(vars);
            const next = mutationResult.current;
            if (next) opts?.onSuccess?.(next);
          },
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

import { PostToMatrixButton } from "../PostToMatrixButton";

beforeEach(() => {
  postMutate.mockClear();
  bindMutate.mockClear();
  mutationResult.current = null;
  state.servers = [{ id: "srv-1" }];
  state.effective = { kind: "none" };
  state.rooms = { joined: [], invited: [] };
});

describe("PostToMatrixButton", () => {
  test("renders nothing when the workspace has no Matrix server", () => {
    state.servers = [];
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);
    expect(screen.queryByText("Post to Matrix")).toBeNull();
  });

  test("renders nothing for a meeting outside any workspace", () => {
    render(<PostToMatrixButton meetingId="m1" workspaceId={null} projectId={null} />);
    expect(screen.queryByText("Post to Matrix")).toBeNull();
  });

  test("names the resolved room before anything is sent", () => {
    state.effective = { kind: "room", name: "Engineering", inherited: false };
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);

    fireEvent.click(screen.getByText("Post to Matrix"));
    expect(screen.getByText("Engineering")).toBeTruthy();
  });

  test("says when the room is inherited from the workspace", () => {
    state.effective = { kind: "room", name: "General", inherited: true };
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);

    fireEvent.click(screen.getByText("Post to Matrix"));
    expect(screen.getByText(/workspace default/i)).toBeTruthy();
  });

  test("warns that posting is switched off for the project", () => {
    state.effective = { kind: "off" };
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);

    fireEvent.click(screen.getByText("Post to Matrix"));
    expect(screen.getByText(/switched off/i)).toBeTruthy();
  });

  test("says a picker is coming when nothing is bound", () => {
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);

    fireEvent.click(screen.getByText("Post to Matrix"));
    expect(screen.getByText(/No room is bound yet/i)).toBeTruthy();
  });

  test("posting the resolved destination sends no room override", () => {
    state.effective = { kind: "room", name: "Engineering", inherited: false };
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);

    fireEvent.click(screen.getByText("Post to Matrix"));
    fireEvent.click(screen.getByText("Post summary"));

    expect(postMutate).toHaveBeenCalledWith({ meetingId: "m1" });
  });

  test("does not bind anything just from opening the picker", () => {
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);

    fireEvent.click(screen.getByText("Post to Matrix"));
    fireEvent.click(screen.getByText("Choose a room"));

    // The checkbox exists but is off — a one-off post is not a configuration change.
    const checkbox = screen.getByLabelText(
      "Save as this project's room",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(bindMutate).not.toHaveBeenCalled();
  });

  test("offers no save checkbox for a meeting with no project", () => {
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId={null} />);

    fireEvent.click(screen.getByText("Post to Matrix"));
    fireEvent.click(screen.getByText("Choose a room"));

    // There is no project to save it to.
    expect(screen.queryByLabelText("Save as this project's room")).toBeNull();
  });

  test("a confirmed repost goes to the room the warning named, not a stale pick", () => {
    // The reviewer's scenario: pick a room in the picker but DON'T post it, then post
    // the resolved destination and confirm the repost. Reading the picked room at click
    // time would send the repost somewhere the warning never mentioned — and Matrix has
    // no un-send, so that copy is permanent.
    state.effective = { kind: "room", name: "Engineering", inherited: false };
    state.rooms = {
      joined: [{ roomId: "!other:example.org", name: "Other", isEncrypted: false }],
      invited: [],
    };
    render(<PostToMatrixButton meetingId="m1" workspaceId="ws-1" projectId="p1" />);

    // Select "Other" — this sets `chosen` — then abandon the picker without posting.
    fireEvent.click(screen.getByText("Post to Matrix"));
    fireEvent.click(screen.getByText("Choose a room"));
    fireEvent.click(screen.getByLabelText("Other"));
    fireEvent.click(document.querySelector(".mantine-Modal-close")!);

    // Post the RESOLVED destination and get a repost warning naming it.
    mutationResult.current = {
      kind: "needs-confirm",
      roomId: "!eng:example.org",
      lastPostedAt: "2026-08-11T09:00:00Z",
    };
    fireEvent.click(screen.getByText("Post to Matrix"));
    fireEvent.click(screen.getByText("Post summary"));

    postMutate.mockClear();
    mutationResult.current = { kind: "posted", roomId: "!eng:example.org" };
    fireEvent.click(screen.getByText("Post again"));

    // No room override — the resolved destination is what the warning was about.
    expect(postMutate).toHaveBeenCalledWith({ meetingId: "m1", confirmRepost: true });
  });
});
