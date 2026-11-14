import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useDocumentTitle } from "~/hooks/useDocumentTitle";
import { PRODUCT_NAME } from "~/lib/brand";
import { buildProductPageTitle } from "../productPageTitle";
import {
  ProductDetailTitleProvider,
  useProductDetailTitle,
  useProductDetailTitleState,
} from "../ProductDetailTitle";

const DEFAULT_TITLE = "App default";

/** Stands in for ProductLayout: owns the title, provides the registry. */
function Layout({ pathname, children }: { pathname: string; children?: React.ReactNode }) {
  const { detailLabel, registry } = useProductDetailTitleState();
  useDocumentTitle(
    buildProductPageTitle({
      pathname,
      workspaceSlug: "clear",
      productSlug: "clear",
      productName: "CLEAR",
      detailLabel,
    }),
  );
  return <ProductDetailTitleProvider registry={registry}>{children}</ProductDetailTitleProvider>;
}

function Detail({ label }: { label: string | undefined }) {
  useProductDetailTitle(label);
  return null;
}

const ticketPath = "/w/clear/products/clear/tickets/42";

describe("product tab titles", () => {
  afterEach(() => {
    cleanup();
    document.title = DEFAULT_TITLE;
  });

  test("a detail page's name wins over the layout, whose effect runs after it", () => {
    document.title = DEFAULT_TITLE;
    render(
      <Layout pathname={ticketPath}>
        <Detail label="Fix the login loop" />
      </Layout>,
    );
    expect(document.title).toBe(`Fix the login loop · CLEAR | ${PRODUCT_NAME}`);
  });

  test("shows the section until the entity loads, then its name", () => {
    document.title = DEFAULT_TITLE;
    const { rerender } = render(
      <Layout pathname={ticketPath}>
        <Detail label={undefined} />
      </Layout>,
    );
    expect(document.title).toBe(`Backlog · CLEAR | ${PRODUCT_NAME}`);

    rerender(
      <Layout pathname={ticketPath}>
        <Detail label="Fix the login loop" />
      </Layout>,
    );
    expect(document.title).toBe(`Fix the login loop · CLEAR | ${PRODUCT_NAME}`);
  });

  test("going back to the listing drops the entity's name", () => {
    document.title = DEFAULT_TITLE;
    const { rerender } = render(
      <Layout pathname={ticketPath}>
        <Detail label="Fix the login loop" />
      </Layout>,
    );
    rerender(<Layout pathname="/w/clear/products/clear/tickets" />);
    expect(document.title).toBe(`Backlog · CLEAR | ${PRODUCT_NAME}`);
  });

  test("leaving the product section restores the previous title", () => {
    document.title = DEFAULT_TITLE;
    const { unmount } = render(
      <Layout pathname={ticketPath}>
        <Detail label="Fix the login loop" />
      </Layout>,
    );
    unmount();
    expect(document.title).toBe(DEFAULT_TITLE);
  });
});
