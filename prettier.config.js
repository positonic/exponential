/**
 * NOT APPLIED REPO-WIDE — do not run this as cleanup alongside another change.
 *
 * Nothing enforces this config: it is absent from CI and from .husky/pre-commit,
 * and ~1350 of the repo's ~1400 source files differ from it. The mismatch is not
 * a mistuned option — printWidth 80 (the default) already fits the existing code
 * better than 100 or 120 do. The code has simply never been formatted.
 *
 * So `npm run format:write` rewrites nearly every file in the repo. Treat it as a
 * deliberate standalone campaign, landed on its own with a .git-blame-ignore-revs
 * entry and a CI gate to stop the drift returning — not as a tidy-up in a feature
 * PR, where it buries the real change and conflicts with every open branch.
 *
 * Editor format-on-save is disabled in .vscode/settings.json for the same reason.
 *
 * @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions}
 */
export default {
  plugins: ["prettier-plugin-tailwindcss"],
};
