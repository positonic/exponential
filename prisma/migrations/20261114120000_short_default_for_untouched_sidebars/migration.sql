-- Data only: no schema change.
--
-- The default sidebar became short on 2026-11-14: Actions, Metrics, Shipped,
-- CRM, Agents and Knowledge are hidden unless a person switches them on. That
-- default only reaches people with no saved layout. Anyone who has ever folded
-- a section has a saved row holding the old, everything-visible menu, and
-- would keep all twelve items for good.
--
-- This applies the new default to saved layouts whose owner has never hidden
-- anything: such a row was not a choice about visibility, only a fold, a
-- rename or a reorder. A layout with even one hidden item or section is a
-- menu somebody curated, and is left exactly as it is. So is anything pinned
-- in the shortcuts section, and any custom link.
--
-- Order, names, folds and custom shortcuts are untouched; only `hidden` on
-- those six built-in items changes. Each person can switch any of them back
-- on from More -> "Choose what's in my menu".

-- Per-workspace layouts (ADR-0073).
UPDATE "WorkspaceNavLayout" AS w
SET "navLayout" = (
  SELECT jsonb_agg(
    CASE
      WHEN s.section->>'id' = 'shortcuts' OR jsonb_typeof(s.section->'items') IS DISTINCT FROM 'array' THEN s.section
      ELSE jsonb_set(
        s.section,
        '{items}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN i.item->>'id' IN ('actions', 'metrics', 'shipped', 'crm', 'agents', 'knowledge')
                  AND NOT (i.item ? 'href')
                THEN jsonb_set(i.item, '{hidden}', 'true'::jsonb)
                ELSE i.item
              END
              ORDER BY i.ord
            )
            FROM jsonb_array_elements(s.section->'items') WITH ORDINALITY AS i(item, ord)
          ),
          '[]'::jsonb
        )
      )
    END
    ORDER BY s.ord
  )
  FROM jsonb_array_elements(w."navLayout") WITH ORDINALITY AS s(section, ord)
)
WHERE w.id IN (
  SELECT c.id
  FROM (
    -- A stored value that is not an array is read as an empty layout, so it
    -- is skipped rather than failing the migration. The CASE is what makes
    -- that safe: SQL may evaluate plain AND-ed conditions in any order.
    SELECT
      id,
      CASE WHEN jsonb_typeof("navLayout") = 'array' THEN "navLayout" ELSE '[]'::jsonb END AS layout
    FROM "WorkspaceNavLayout"
  ) AS c
  WHERE jsonb_array_length(c.layout) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(c.layout) AS section
      WHERE section->'hidden' = 'true'::jsonb
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(section->'items') = 'array' THEN section->'items' ELSE '[]'::jsonb END
          ) AS item
          WHERE item->'hidden' = 'true'::jsonb
        )
    )
);

-- The user-wide layout the settings page edits.
UPDATE "NavigationPreference" AS p
SET "navLayout" = (
  SELECT jsonb_agg(
    CASE
      WHEN s.section->>'id' = 'shortcuts' OR jsonb_typeof(s.section->'items') IS DISTINCT FROM 'array' THEN s.section
      ELSE jsonb_set(
        s.section,
        '{items}',
        COALESCE(
          (
            SELECT jsonb_agg(
              CASE
                WHEN i.item->>'id' IN ('actions', 'metrics', 'shipped', 'crm', 'agents', 'knowledge')
                  AND NOT (i.item ? 'href')
                THEN jsonb_set(i.item, '{hidden}', 'true'::jsonb)
                ELSE i.item
              END
              ORDER BY i.ord
            )
            FROM jsonb_array_elements(s.section->'items') WITH ORDINALITY AS i(item, ord)
          ),
          '[]'::jsonb
        )
      )
    END
    ORDER BY s.ord
  )
  FROM jsonb_array_elements(p."navLayout") WITH ORDINALITY AS s(section, ord)
)
WHERE p.id IN (
  SELECT c.id
  FROM (
    -- A stored value that is not an array is read as an empty layout, so it
    -- is skipped rather than failing the migration. The CASE is what makes
    -- that safe: SQL may evaluate plain AND-ed conditions in any order.
    SELECT
      id,
      CASE WHEN jsonb_typeof("navLayout") = 'array' THEN "navLayout" ELSE '[]'::jsonb END AS layout
    FROM "NavigationPreference"
  ) AS c
  WHERE jsonb_array_length(c.layout) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(c.layout) AS section
      WHERE section->'hidden' = 'true'::jsonb
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(section->'items') = 'array' THEN section->'items' ELSE '[]'::jsonb END
          ) AS item
          WHERE item->'hidden' = 'true'::jsonb
        )
    )
);
