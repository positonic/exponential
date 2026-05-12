// @vitest-environment node
//
// This test file deliberately does NOT mock ~/lib/document-parser or
// pdf-parse. It runs in a real Node environment so the actual import
// chain (mammoth, cheerio, pdf-parse@2's PDF.js internals) is exercised.
//
// Background: the existing document.test.ts mocks the parser module, which
// meant the v1/v2 pdf-parse API mismatch and the Vercel-runtime DOMMatrix
// crash both shipped to production undetected (incident on 2026-05-10,
// see the pdf-parse lazy-load fix PR). Keep this file un-mocked so future
// regressions in the parser itself surface in CI rather than at request time.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractText } from "../document-parser";

const FIXTURES_DIR = join(__dirname, "..", "..", "test", "fixtures");

describe("extractText", () => {
  describe("plain text formats", () => {
    it("returns the decoded text and word count for text/plain", async () => {
      const buf = Buffer.from("hello world\nthis is a test", "utf-8");
      const result = await extractText(buf, "text/plain");
      expect(result.text).toBe("hello world\nthis is a test");
      expect(result.meta.wordCount).toBe(6);
      expect(result.meta.pageCount).toBeUndefined();
    });

    it("treats text/markdown like plain text (no formatting stripped)", async () => {
      const buf = Buffer.from("# Heading\n\nSome **bold** text.", "utf-8");
      const result = await extractText(buf, "text/markdown");
      expect(result.text).toBe("# Heading\n\nSome **bold** text.");
      expect(result.meta.wordCount).toBe(5);
    });

    it("decodes text/csv as utf-8", async () => {
      const buf = Buffer.from("a,b,c\n1,2,3", "utf-8");
      const result = await extractText(buf, "text/csv");
      expect(result.text).toBe("a,b,c\n1,2,3");
      expect(result.meta.wordCount).toBe(2);
    });

    it("strips charset suffixes from the mime before matching", async () => {
      const buf = Buffer.from("body", "utf-8");
      const result = await extractText(buf, "text/plain; charset=utf-8");
      expect(result.text).toBe("body");
    });
  });

  describe("text/html", () => {
    it("strips script/style/nav/footer and returns body text", async () => {
      const html = `
        <html>
          <head><style>.x { color: red }</style></head>
          <body>
            <header>nav header</header>
            <nav>menu</nav>
            <main>Hello <strong>world</strong>!</main>
            <script>alert('xss')</script>
            <footer>copyright</footer>
          </body>
        </html>`;
      const result = await extractText(Buffer.from(html, "utf-8"), "text/html");
      expect(result.text).toBe("Hello world!");
      expect(result.text).not.toContain("alert");
      expect(result.text).not.toContain("copyright");
    });
  });

  describe("application/pdf", () => {
    // Real PDF parsing — exercises pdf-parse@2's PDF.js pipeline.
    // Originally the code used the v1 function-form API against the v2
    // class-based package. That would have failed here.
    it("extracts text from a real PDF buffer using the v2 PDFParse API", async () => {
      const buf = readFileSync(join(FIXTURES_DIR, "hello.pdf"));
      const result = await extractText(buf, "application/pdf");
      expect(result.text).toContain("Hello PDF");
      expect(result.meta.pageCount).toBe(1);
      expect(result.meta.wordCount).toBeGreaterThan(0);
    });
  });

  describe("error paths", () => {
    it("throws a descriptive error for unsupported mime types", async () => {
      const buf = Buffer.from([0x00, 0x01, 0x02]);
      await expect(
        extractText(buf, "application/x-something-weird", "weird.bin"),
      ).rejects.toThrow(/Unsupported MIME type "application\/x-something-weird"/);
    });

    it("includes filename in the error message when provided", async () => {
      const buf = Buffer.from([0x00]);
      await expect(
        extractText(buf, "image/png", "screenshot.png"),
      ).rejects.toThrow(/file: screenshot\.png/);
    });
  });
});
