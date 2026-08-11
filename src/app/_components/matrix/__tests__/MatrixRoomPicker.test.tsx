/**
 * Component-render tests for the Matrix room picker.
 *
 * The tRPC query is mocked so these assert what the user actually sees: the rooms and
 * their ids, the "invite the bot" dead-end when it has joined nothing, and that a
 * homeserver failure is surfaced rather than swallowed into an empty list.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";

interface RoomRow {
  roomId: string;
  name: string;
  isEncrypted: boolean;
}

const queryHolder: {
  current: {
    data?: { joined: RoomRow[]; invited: RoomRow[] };
    isLoading: boolean;
    error: { message: string } | null;
  };
} = {
  current: { data: { joined: [], invited: [] }, isLoading: false, error: null },
};

const acceptMutate = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      matrixServer: { rooms: { invalidate: vi.fn() } },
    }),
    matrixServer: {
      rooms: {
        useQuery: () => queryHolder.current,
      },
      acceptInvite: {
        useMutation: () => ({
          mutate: acceptMutate,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

import { MatrixRoomPicker } from "../MatrixRoomPicker";

function renderPicker(onSelect?: (room: RoomRow) => void) {
  return render(
    <MatrixRoomPicker workspaceId="ws-1" serverId="srv-1" onSelect={onSelect} />,
  );
}

describe("MatrixRoomPicker", () => {
  test("lists each joined room with its name and id", () => {
    queryHolder.current = {
      data: {
        joined: [
          { roomId: "!eng:example.org", name: "Engineering", isEncrypted: false },
          { roomId: "!ops:example.org", name: "Ops", isEncrypted: false },
        ],
        invited: [],
      },
      isLoading: false,
      error: null,
    };

    renderPicker();

    expect(screen.getByText("Engineering")).toBeTruthy();
    expect(screen.getByText("!eng:example.org")).toBeTruthy();
    expect(screen.getByText("Ops")).toBeTruthy();
  });

  test("tells the user to invite the bot when it has joined nothing", () => {
    queryHolder.current = {
      data: { joined: [], invited: [] },
      isLoading: false,
      error: null,
    };

    renderPicker();

    expect(screen.getByText(/has not joined any rooms yet/i)).toBeTruthy();
  });

  test("surfaces a homeserver failure instead of showing an empty list", () => {
    queryHolder.current = {
      data: undefined,
      isLoading: false,
      error: { message: "Could not reach https://matrix.example.org." },
    };

    renderPicker();

    expect(
      screen.getByText(/Could not reach https:\/\/matrix\.example\.org\./),
    ).toBeTruthy();
    expect(screen.queryByText(/has not joined any rooms yet/i)).toBeNull();
  });

  test("reports the chosen room to the caller", () => {
    const onSelect = vi.fn();
    queryHolder.current = {
      data: {
        joined: [
          { roomId: "!eng:example.org", name: "Engineering", isEncrypted: false },
        ],
        invited: [],
      },
      isLoading: false,
      error: null,
    };

    renderPicker(onSelect);
    fireEvent.click(screen.getByLabelText("Engineering"));

    expect(onSelect).toHaveBeenCalledWith({
      roomId: "!eng:example.org",
      name: "Engineering",
      isEncrypted: false,
    });
  });
  test("lists pending invites separately, with an Accept action", () => {
    queryHolder.current = {
      data: {
        joined: [],
        invited: [
          { roomId: "!waiting:example.org", name: "Product", isEncrypted: false },
        ],
      },
      isLoading: false,
      error: null,
    };

    renderPicker();

    // A waiting invite must not read as "no rooms" — that dead-end is the whole
    // reason invites are surfaced.
    expect(screen.queryByText(/has not joined any rooms yet/i)).toBeNull();
    expect(screen.getByText("Pending invites")).toBeTruthy();
    expect(screen.getByText("Product")).toBeTruthy();
    expect(screen.getByText(/cannot post until it does/i)).toBeTruthy();
  });

  test("accepting an invite asks the server to join that room", () => {
    acceptMutate.mockClear();
    queryHolder.current = {
      data: {
        joined: [],
        invited: [
          { roomId: "!waiting:example.org", name: "Product", isEncrypted: false },
        ],
      },
      isLoading: false,
      error: null,
    };

    renderPicker();
    fireEvent.click(screen.getByText("Accept"));

    expect(acceptMutate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      serverId: "srv-1",
      roomId: "!waiting:example.org",
    });
  });

  test("an invited room is not offered as a selectable destination yet", () => {
    queryHolder.current = {
      data: {
        joined: [],
        invited: [
          { roomId: "!waiting:example.org", name: "Product", isEncrypted: false },
        ],
      },
      isLoading: false,
      error: null,
    };

    renderPicker();

    // No radio for it: the bot cannot post there until it has actually joined.
    expect(screen.queryByLabelText("Product")).toBeNull();
  });
});
