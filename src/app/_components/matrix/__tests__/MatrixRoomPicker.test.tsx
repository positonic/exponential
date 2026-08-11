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
    data?: { joined: RoomRow[] };
    isLoading: boolean;
    error: { message: string } | null;
  };
} = { current: { data: { joined: [] }, isLoading: false, error: null } };

vi.mock("~/trpc/react", () => ({
  api: {
    matrixServer: {
      rooms: {
        useQuery: () => queryHolder.current,
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
    queryHolder.current = { data: { joined: [] }, isLoading: false, error: null };

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
});
