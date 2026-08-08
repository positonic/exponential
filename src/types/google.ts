/**
 * Which gated Google feature a user has bumped into.
 *
 * Lives here rather than beside the `GooglePremiumFeature` component so the
 * OAuth route handler can name it without a server module reaching into
 * `app/_components` (and without the component reaching back into server code).
 */
export type GooglePremiumFeatureKind = "calendar" | "contacts";
