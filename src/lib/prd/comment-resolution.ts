import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Hides the highlight of **resolved** comment threads without touching the
 * document (ADR-0024 §Resolve: resolving hides the highlight but never deletes
 * the mark or the thread, so it can be reopened). The resolved set is the
 * reconciliation's truth (DB `resolvedAt`), pushed in via {@link setResolvedThreadIds};
 * this plugin renders a `prd-comment-resolved` inline decoration over those
 * spans, and CSS neutralises the highlight there.
 */
const resolutionKey = new PluginKey<{ resolved: Set<string> }>("prdCommentResolution");

export const CommentResolution = Extension.create({
  name: "commentResolution",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: resolutionKey,
        state: {
          init: () => ({ resolved: new Set<string>() }),
          apply(tr, value) {
            const meta = tr.getMeta(resolutionKey) as
              | { resolved: Set<string> }
              | undefined;
            return meta ?? value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = resolutionKey.getState(state);
            const resolved = pluginState?.resolved;
            if (!resolved || resolved.size === 0) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              // Overlapping threads nest their mark spans around one text node,
              // and the CSS hides every highlight span containing this
              // decoration — so decorate only text whose threads are ALL
              // resolved, or an open thread's highlight would vanish too.
              const threadIds = node.marks
                .filter((m) => m.type.name === "comment")
                .map((m) => m.attrs.threadId as string | undefined);
              if (
                threadIds.length > 0 &&
                threadIds.every((id) => id != null && resolved.has(id))
              ) {
                decorations.push(
                  Decoration.inline(pos, pos + node.nodeSize, {
                    class: "prd-comment-resolved",
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/** Update which thread highlights are hidden as resolved. */
export function setResolvedThreadIds(editor: Editor, ids: Set<string>): void {
  const { state, view } = editor;
  view.dispatch(state.tr.setMeta(resolutionKey, { resolved: ids }));
}
