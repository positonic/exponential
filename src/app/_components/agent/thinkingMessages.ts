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
