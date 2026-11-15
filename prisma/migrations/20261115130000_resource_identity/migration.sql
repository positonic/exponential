-- Resource identity (ticket witty.otter, ADR-0082).
--
-- A Resource gets a second address. `url` stays the address its link opens;
-- `identity` is what a save is matched by, so one page saved from two
-- addresses (other dates, a tracking parameter) is one Resource.
--
-- Rows that already exist get an identity computed from the URL they have.
-- Nothing is merged or deleted: two of one owner's rows may end up with the
-- same identity, and both stay. Hence an index, not a unique constraint.

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "identity" TEXT;

-- The rule of `pageIdentity` (src/lib/resources/identity.ts) for a row with
-- no declared URL: scheme and host lowercased, fragment dropped, a trailing
-- slash dropped from a non-root path, tracking parameters removed, the rest
-- sorted by name. A URL that is not a web address is its own identity.
-- Written against the text of the URL, which is what the browser saved; an
-- address JavaScript would normalise further (an encoded host, `/../` in the
-- path) keeps this spelling, and the worst that costs is one duplicate when
-- that page is saved again.
CREATE FUNCTION "_resource_identity_backfill"(raw TEXT) RETURNS TEXT AS $$
DECLARE
  u TEXT := btrim(raw);
  m TEXT[];
  scheme TEXT;
  host TEXT;
  path TEXT;
  kept TEXT;
BEGIN
  m := regexp_match(u, '^(https?)://([^/?#]+)([^?#]*)(\?[^#]*)?', 'i');
  IF m IS NULL THEN
    RETURN u;
  END IF;

  scheme := lower(m[1]);
  host := lower(regexp_replace(m[2], '^.*@', ''));
  IF scheme = 'http' THEN
    host := regexp_replace(host, ':80$', '');
  ELSE
    host := regexp_replace(host, ':443$', '');
  END IF;

  path := m[3];
  IF path = '' THEN
    path := '/';
  ELSIF length(path) > 1 AND right(path, 1) = '/' THEN
    path := left(path, -1);
  END IF;

  SELECT string_agg(part, '&' ORDER BY split_part(part, '=', 1) COLLATE "C", ord)
    INTO kept
    FROM unnest(string_to_array(substr(COALESCE(m[4], ''), 2), '&')) WITH ORDINALITY AS q(part, ord)
   WHERE part <> ''
     AND lower(split_part(part, '=', 1)) NOT LIKE 'utm\_%'
     AND lower(split_part(part, '=', 1)) NOT LIKE '%\_impression\_id'
     AND lower(split_part(part, '=', 1)) NOT IN ('fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid');

  RETURN scheme || '://' || host || path || COALESCE('?' || kept, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill existing rows
UPDATE "Resource"
   SET "identity" = "_resource_identity_backfill"("url")
 WHERE "url" IS NOT NULL AND btrim("url") <> '';

DROP FUNCTION "_resource_identity_backfill"(TEXT);

-- CreateIndex
CREATE INDEX "Resource_userId_identity_idx" ON "Resource"("userId", "identity");
