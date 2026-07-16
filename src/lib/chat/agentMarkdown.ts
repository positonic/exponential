/**
 * Pure text transforms applied to agent prose before it is handed to
 * ReactMarkdown. Kept out of the chat components so every surface that
 * renders agent markdown (ManyChat drawer, Zoe canvas) can share them and
 * they stay unit-testable.
 */

// Markdown equivalent of ManyChat's preprocessAgentHtml paragraph splitting:
// inserts `\n\n` at agent action boundaries so streamed narration renders
// as separate paragraphs instead of one giant <Text>. Keep the action-word
// list in sync with preprocessAgentHtml in ManyChat.tsx.
export function preprocessAgentMarkdown(content: string): string {
  return content.replace(
    /:(Now |Let |Great|Good|Perfect|Excellent|However, |I |The |Then |First, |Next )/g,
    (_: string, word: string) => `:\n\n${word}`,
  );
}

// GFM autolinks only URLs with a protocol or `www.` prefix, so agent prose
// like "(github.com/Banksy-said-hi)" stays dead text. Convert bare domains —
// requiring a path plus a common TLD (so file paths like "route.ts/handler"
// and names like "socket.io" don't match), or a www. prefix — into markdown
// links. A match must start the string or follow whitespace/"(", which keeps
// it out of existing markdown link targets and protocol URLs (those are
// preceded by "/" or "[").
const BARE_URL_RE =
  /(^|[\s(])((?:[a-z0-9-]+\.)+(?:com|org|net|io|im|dev|ai|co|app|me|sh|so|xyz|gg|fm|to)\/[^\s)<]*|www\.(?:[a-z0-9-]+\.)+[a-z]{2,})/gi;

export function linkifyBareUrls(content: string): string {
  return content.replace(
    BARE_URL_RE,
    (match: string, prefix: string, url: string, offset: number) => {
      // A protocol-less markdown link target — "[CRM](exponential.im/w/…)" —
      // starts with "(" preceded by "]"; wrapping it again would corrupt the
      // link. (Targets with a protocol never match: the domain there is
      // preceded by "/", not whitespace/"(".)
      if (prefix === '(' && offset > 0 && content[offset - 1] === ']') {
        return match;
      }
      const trimmed = url.replace(/[.,;:!?]+$/, '');
      const trailing = url.slice(trimmed.length);
      return `${prefix}[${trimmed}](https://${trimmed})${trailing}`;
    },
  );
}
