/**
 * Brand-level copy helpers.
 *
 * Centralizes the product name and tagline so they can be swapped via env vars
 * (useful for white-label builds or staging deploys that need a different name).
 * Safe to import from both server and client code — values resolve at build
 * time from `NEXT_PUBLIC_*` vars.
 */

const DEFAULT_PRODUCT_NAME = 'Exponential';
const DEFAULT_PRODUCT_SHORT_NAME = 'Exponential';
const DEFAULT_PRODUCT_TAGLINE =
  'The open-source operating system for startups run by people and AI agents: goals, projects, meetings and decisions in one place.';

export const PRODUCT_NAME: string =
  process.env.NEXT_PUBLIC_PRODUCT_NAME ?? DEFAULT_PRODUCT_NAME;

export const PRODUCT_SHORT_NAME: string =
  process.env.NEXT_PUBLIC_PRODUCT_SHORT_NAME ?? DEFAULT_PRODUCT_SHORT_NAME;

export const PRODUCT_TAGLINE: string =
  process.env.NEXT_PUBLIC_PRODUCT_TAGLINE ?? DEFAULT_PRODUCT_TAGLINE;

/**
 * Homepage title and description for search results. Written around phrases
 * people search for ("open-source project management", "AI agents") rather
 * than the wording of the hero.
 */
export const PRODUCT_SEO_TITLE = `Open-Source Project Management for Startups & AI Agents | ${PRODUCT_NAME}`;

export const PRODUCT_SEO_DESCRIPTION =
  'Run your startup\'s goals, OKRs and projects with your team and AI agents in one place. Open source (AGPL), self-hostable, with an MCP server and CLI. Free to start.';

/**
 * Official social profiles. The footer links to them and the Organization
 * JSON-LD lists them as `sameAs`, which is how search engines and AI answer
 * engines tie these accounts to the site.
 */
export const SOCIAL_PROFILES = {
  x: 'https://x.com/be_exponential',
  github: 'https://github.com/positonic/exponential',
  linkedin: 'https://www.linkedin.com/company/108621153/',
} as const;
