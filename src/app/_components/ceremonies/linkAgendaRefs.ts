/**
 * Turns bare record references in a hand-added agenda item into Markdown
 * links before it renders: `D-0150` to the decision page (the decision route
 * resolves a D-number as well as an id), and `#1339` to the ticket when the
 * ceremony belongs to a product. Ticket URLs are product-scoped, so without
 * a product a bare `#1339` stays text rather than guessing one.
 *
 * Only plain text is touched: fenced and inline code, existing Markdown
 * links, angle links and bare URLs (whose `#fragment` is not a ticket) pass through as
 * written.
 */
export interface AgendaRefLinkContext {
  workspaceSlug: string;
  productSlug?: string | null;
}

/**
 * Spans left untouched; one capturing group so `split` keeps them at odd
 * indexes. Fenced code blocks come first so a reference inside one stays the
 * author's literal text.
 */
const PROTECTED = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|!?\[[^\]\n]*\]\([^)\n]*\)|<[^>\n]+>|https?:\/\/[^\s)]+)/g;
const DECISION = /(^|[^\w/-])D-(\d{4,})\b/g;
const TICKET = /(^|[^\w&/#])#(\d+)\b/g;

function linkPlain(text: string, ctx: AgendaRefLinkContext): string {
  const ws = encodeURIComponent(ctx.workspaceSlug);
  let out = text.replace(DECISION, (_m, pre: string, num: string) => `${pre}[D-${num}](/w/${ws}/decisions/d/D-${num})`);
  if (ctx.productSlug) {
    const product = encodeURIComponent(ctx.productSlug);
    out = out.replace(TICKET, (_m, pre: string, num: string) => `${pre}[#${num}](/w/${ws}/products/${product}/tickets/${num})`);
  }
  return out;
}

export function linkAgendaRefs(markdown: string, ctx: AgendaRefLinkContext): string {
  return markdown
    .split(PROTECTED)
    .map((part, index) => (index % 2 === 1 ? part : linkPlain(part, ctx)))
    .join("");
}
