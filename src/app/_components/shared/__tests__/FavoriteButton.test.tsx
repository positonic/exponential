/**
 * Component-render tests for FavoriteButton. The hook is mocked so we assert the
 * button's external behaviour: it reflects favourited vs not-favourited state
 * (aria-pressed + label) and calls the hook's toggle on click.
 */

import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";

const toggle = vi.fn();
const favoritedHolder = { current: false };

vi.mock("../useFavorite", () => ({
  useFavorite: () => ({
    favorited: favoritedHolder.current,
    toggle,
    isPending: false,
    isLoading: false,
  }),
}));

import { FavoriteButton } from "../FavoriteButton";

describe("FavoriteButton", () => {
  test("renders the add-to-favourites affordance when not favourited", () => {
    favoritedHolder.current = false;
    render(<FavoriteButton entityType="page" entityId="products/acme" />);
    const btn = screen.getByLabelText("Add to favourites");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  test("reflects favourited state", () => {
    favoritedHolder.current = true;
    render(<FavoriteButton entityType="page" entityId="products/acme" />);
    const btn = screen.getByLabelText("Remove from favourites");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  test("calls toggle on click", () => {
    favoritedHolder.current = false;
    toggle.mockClear();
    render(<FavoriteButton entityType="page" entityId="products/acme" />);
    fireEvent.click(screen.getByLabelText("Add to favourites"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });
});
