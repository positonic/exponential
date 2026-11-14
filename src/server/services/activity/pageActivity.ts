/**
 * Entity type of page activity events (`page/created`, `page/updated`).
 *
 * Pages can be private — invite-only, in a restricted project, or shared by
 * grant — so page events are the one kind of activity a workspace member may
 * not be allowed to see. Every reader that shows events to people handles them
 * one of two ways:
 *
 * - A feed with a single viewer (`getActivityFeed`, `getAggregatedActivityFeed`)
 *   drops the page rows that viewer cannot open, checked when the feed is read.
 * - An output shared by many readers (the Week-in-Review, a ceremony agenda)
 *   has no single viewer to check against, so it leaves page events out.
 */
export const PAGE_ENTITY_TYPE = "page" as const;
