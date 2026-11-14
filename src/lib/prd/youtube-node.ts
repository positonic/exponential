import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import type { Slice } from "@tiptap/pm/model";

import {
  parseYouTubeUrl,
  youTubeEmbedUrl,
  youTubeVideoFromAttrs,
  youTubeWatchUrl,
  type YouTubeVideo,
} from "./youtube";

/**
 * Block atom that embeds a YouTube video in a rich document body (Pages,
 * and any other host of the shared PRD schema).
 *
 * The node holds a validated `videoId` and an optional `start` second; the
 * iframe `src` is always rebuilt from those, so no user-supplied URL reaches
 * the HTML.
 *
 * Markdown projection: the canonical watch URL **alone on its own line**.
 * Off-island readers (CLI, agents, card previews) see a plain link, and the
 * parse rule below turns a top-level paragraph that is nothing but a link to
 * a YouTube video back into the node. That same rule is how a pasted URL
 * becomes an embed: tiptap-markdown parses pasted plain text as Markdown. A
 * named link (`[my talk](https://youtu.be/…)`) or a link inside a sentence
 * stays a link. The paste parse cannot see where the text lands, so the
 * plugin below turns a lone pasted embed back into a link when the cursor is
 * in a line that already has text.
 */

interface MarkdownItToken {
  type: string;
  content: string;
  level: number;
  attrGet(name: string): string | null;
  children: MarkdownItToken[] | null;
}
interface MarkdownItCoreState {
  tokens: MarkdownItToken[];
  Token: new (type: string, tag: string, nesting: number) => MarkdownItToken;
}
export interface YouTubeMarkdownItLike {
  core: { ruler: { push(name: string, rule: (state: MarkdownItCoreState) => void): void } };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** The HTML the parse rule emits; `parseHTML` below reads it back. */
export function youTubeBlockHtml(video: YouTubeVideo): string {
  const start = video.start ? ` data-youtube-start="${video.start}"` : "";
  return `<div data-type="youtube" data-youtube-video-id="${escapeAttr(video.videoId)}"${start}></div>\n`;
}

/** The video a paragraph's inline token links to, when the link is the whole paragraph. */
function soleYouTubeLink(inline: MarkdownItToken): YouTubeVideo | null {
  const children = (inline.children ?? []).filter(
    (child) => !(child.type === "text" && child.content.trim() === ""),
  );
  if (children.length !== 3) return null;
  const [open, text, close] = children;
  if (open?.type !== "link_open" || text?.type !== "text" || close?.type !== "link_close") {
    return null;
  }
  const href = open.attrGet("href");
  const fromHref = href ? parseYouTubeUrl(href) : null;
  // The link text must itself be the URL (a bare or `<…>` autolink), so a
  // named link keeps its words.
  const fromText = parseYouTubeUrl(text.content);
  if (!fromHref || !fromText || fromHref.videoId !== fromText.videoId) return null;
  return fromHref;
}

/**
 * markdown-it plugin: a top-level paragraph holding only a link to a YouTube
 * video becomes the node's HTML. Pushed onto the core chain, so it runs after
 * linkify has turned bare URLs into link tokens.
 */
const registered = new WeakSet<object>();

export function youTubeMarkdownPlugin(md: YouTubeMarkdownItLike): void {
  // tiptap-markdown calls `parse.setup` on every parse against one long-lived
  // markdown-it instance; register the rule once per instance.
  if (registered.has(md)) return;
  registered.add(md);
  md.core.ruler.push("exponential_youtube_block", (state) => {
    const tokens = state.tokens;
    const kept: MarkdownItToken[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i]!;
      const inline = tokens[i + 1];
      const close = tokens[i + 2];
      const video =
        open.type === "paragraph_open" &&
        open.level === 0 &&
        inline?.type === "inline" &&
        close?.type === "paragraph_close"
          ? soleYouTubeLink(inline)
          : null;
      if (!video) {
        kept.push(open);
        continue;
      }
      const block = new state.Token("html_block", "", 0);
      block.content = youTubeBlockHtml(video);
      kept.push(block);
      i += 2;
    }
    state.tokens = kept;
  });
}

/** True when the selection is a whole textblock's content — an empty line, or a fully selected one. */
function selectionIsWholeLine(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  if (!$from.parent.isTextblock) return true;
  return (
    $from.sameParent($to) &&
    $from.parentOffset === 0 &&
    $to.parentOffset === $from.parent.content.size
  );
}

/** The pasted slice is nothing but one YouTube embed (a pasted bare URL). */
function isLoneEmbed(slice: Slice): boolean {
  return slice.content.childCount === 1 && slice.content.firstChild?.type.name === "youtube";
}

export const YouTubeNode = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      videoId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-youtube-video-id"),
        renderHTML: (attributes) => {
          const videoId = attributes.videoId as string | null;
          return videoId ? { "data-youtube-video-id": videoId } : {};
        },
      },
      start: {
        default: null,
        parseHTML: (element) => {
          const value = Number(element.getAttribute("data-youtube-start"));
          return Number.isInteger(value) && value > 0 ? value : null;
        },
        renderHTML: (attributes) => {
          const start = attributes.start as number | null;
          return start ? { "data-youtube-start": String(start) } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="youtube"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const video = youTubeVideoFromAttrs(node.attrs);
    const wrapper = mergeAttributes(HTMLAttributes, {
      "data-type": "youtube",
      class: "prd-youtube",
    });
    if (!video) return ["div", wrapper, "YouTube video unavailable"];
    return [
      "div",
      wrapper,
      [
        "iframe",
        {
          src: youTubeEmbedUrl(video),
          title: "YouTube video",
          loading: "lazy",
          frameborder: "0",
          referrerpolicy: "strict-origin-when-cross-origin",
          allow:
            "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          allowfullscreen: "true",
        },
      ],
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("youtubeInlinePaste"),
        props: {
          // A URL pasted into a line that already has text stays inline as a
          // link, so the sentence is not split around a player.
          handlePaste: (view, event, slice) => {
            if (!isLoneEmbed(slice) || selectionIsWholeLine(view.state)) return false;
            const text = event.clipboardData?.getData("text/plain").trim() ?? "";
            const link = view.state.schema.marks.link;
            if (!text || !link || !parseYouTubeUrl(text)) return false;
            const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
            view.dispatch(
              view.state.tr
                .replaceSelectionWith(view.state.schema.text(text, [link.create({ href })]), false)
                .scrollIntoView(),
            );
            return true;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setYouTubeVideo:
        (video: YouTubeVideo) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { videoId: video.videoId, start: video.start ?? null },
          }),
    };
  },

  /** tiptap-markdown spec: the watch URL on its own line out, the node back in. */
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const video = youTubeVideoFromAttrs(node.attrs);
          if (!video) return;
          state.write(youTubeWatchUrl(video));
          state.closeBlock(node);
        },
        parse: {
          setup(md: YouTubeMarkdownItLike) {
            youTubeMarkdownPlugin(md);
          },
        },
      },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    youtube: {
      /** Insert a YouTube embed at the selection. */
      setYouTubeVideo: (video: YouTubeVideo) => ReturnType;
    };
  }
}
