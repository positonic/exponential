/**
 * Rotating "thinking" status lines shown in Zoe's message bubble during the
 * first ~5s of a turn — after the user sends, before the first tool-call or
 * text chunk streams back. Purely presentational reassurance that fills the
 * dead air; once real activity arrives, ToolActivity / the response replaces it.
 *
 * Voice: Zoe — warm, British, witty (see CONTEXT.md "router persona" / Zoe).
 * Keep each line short (it's a status, not a sentence) and end with an ellipsis.
 */
export const THINKING_MESSAGES = [
  "Right, let me have a look…",
  "Pulling your bits together…",
  "Rummaging through your projects…",
  "Putting the kettle on…",
  "Getting my bearings…",
  "Having a proper think…",
  "Just a tick…",
  "Sorting the wheat from the chaff…",
  "Casting an eye over things…",
  "Rolling up my sleeves…",
  "Sizing up your day…",
  "Won't be a moment…",
] as const;

/** Shown once Zoe's tools have all returned but she hasn't started writing yet. */
export const COMPOSING_MESSAGE = "Putting it together…";

// Maps a tool name (the kebab id from the stream, e.g. "get-all-projects") to a
// Zoe-voiced, present-continuous narration so the wait reads as her thinking out
// loud. Substring match collapses variants ("search-emails", "get-recent-emails")
// onto one line. Order matters — first hit wins, write-verbs before entities so
// "create-project-action" narrates as a write, not a read.
const TOOL_NARRATION: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|-)(create|update|delete|add|quick|checkin|check-in|link|unlink)/, "Jotting that down…"],
  [/calendar|diary|event|slot/, "Peeking at your diary…"],
  [/goal|okr|objective|key.?result/, "Lining up your goals…"],
  [/project|action|task/, "Going through your projects…"],
  [/email|inbox|gmail/, "Skimming your inbox…"],
  [/slack/, "Catching up on Slack…"],
  [/crm|contact|organi[sz]ation|deal/, "Looking up your contacts…"],
  [/notion/, "Digging through Notion…"],
  [/meeting|transcript/, "Revisiting your meetings…"],
  [/web|search|fetch/, "Having a quick search…"],
];

export function narrateTool(name: string): string {
  const n = name.toLowerCase();
  for (const [re, line] of TOOL_NARRATION) {
    if (re.test(n)) return line;
  }
  return "Having a look…";
}
