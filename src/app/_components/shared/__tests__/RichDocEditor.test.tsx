import { describe, expect, test, vi } from "vitest";
import { render } from "~/test/test-utils";

const useEditorMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@tiptap/react", () => ({
  BubbleMenu: () => null,
  EditorContent: () => null,
  useEditor: useEditorMock,
}));

import { RichDocEditor } from "../RichDocEditor";

describe("RichDocEditor", () => {
  test("uses the semantic theme text color instead of forcing dark-mode prose", () => {
    render(
      <RichDocEditor
        initialDoc={{ type: "doc", content: [{ type: "paragraph" }] }}
        initialMarkdown={null}
        onSave={vi.fn()}
      />,
    );

    const options = useEditorMock.mock.calls[0]?.[0];
    const className = options?.editorProps?.attributes?.class;

    expect(className).toContain("text-text-primary");
    expect(className).not.toContain("prose-invert");
  });
});
