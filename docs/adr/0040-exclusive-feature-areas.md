# Feature registry areas are per-product, flat, and exclusive

## Status

Accepted - 2026-07-09

## Context

The feature registry (Features V2) needs to sort a Product's Features into buckets that match how the team thinks about the product. Two mechanisms were available: the existing workspace-wide Tag system (many-to-many, freeform, already carrying a `category: "area"` stopgap used by ticket grouping), or a new dedicated model.

Tags cannot provide the properties the registry needs: nothing prevents a feature from carrying two area tags (so "which area is this feature in" has no reliable answer), tag names are shared across every product in the workspace, and tags have no ordering. These are structural properties, not conventions we could add on top.

## Decision

A new `Area` model: per-product, flat (no nesting), ordered, unique names per product. `Feature.areaId` is a nullable foreign key - **a Feature belongs to exactly one Area or none**. Deleting an Area sets its features' `areaId` to null; it never deletes features. Tags remain for every other classification (platform, technology layer, team, initiative).

## Usage rules

These rules are what make exclusivity workable in practice. They were stress-tested against functional (Slack-style), platform (Telegram-style), and customer-journey (Airbnb-style) area definitions.

1. Each product picks ONE axis for its areas (functional parts, platforms, journey steps) and does not mix axes within the area list.
2. If a feature could sit in two Areas, assign the Area where the user directly interacts with it.
3. Shared infrastructure (search index, notification system, AI model) is one Feature in one Area. Features that depend on it record the dependency in their Requirements.
4. If features regularly fit two Areas, the Area definitions are wrong and should be redefined.
5. If one Area repeatedly needs subdivision, that part of the product should become a separate Product.
6. Platform-areas (iOS, Android, ...) are only correct when features exist on exactly one platform. Multi-platform rollout of one feature is modeled as Scopes ("v1: iOS", "v2: Android"), not as multiple areas. Scopes cover both added functionality and added reach (platforms, markets, tiers).

## Known limitations (accepted)

1. No record of a feature touching several areas; no query "which areas does feature X affect." If needed later, this is an additive many-to-many table on top of the exclusive assignment.
2. No owner/team field on Feature or Area. Team views exist only through tag conventions, which nothing enforces. If needed later, this is an additive owner column.
3. Tags stay workspace-scoped, so tag names are shared between products in one workspace.

## Consequences

- The features list groups by Area by default; Areas are managed in product settings.
- The old `category: "area"` tags stop driving feature grouping. They still drive ticket-view grouping; migrating ticket grouping to derive area via ticket -> feature -> area (and then removing the tag category) is a planned follow-up.
