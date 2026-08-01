// `turndown-plugin-gfm` ships no type definitions. It exposes GitHub-Flavored
// Markdown plugins for Turndown (tables, strikethrough, task lists, fenced code
// blocks). Each export is a Turndown `Plugin` usable via `service.use(...)`.
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
  export const highlightedCodeBlock: TurndownService.Plugin;
}
