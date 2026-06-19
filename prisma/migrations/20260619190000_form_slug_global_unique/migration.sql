-- The public Forms renderer/intake resolve a form by slug alone (`/f/[slug]`,
-- `POST /api/forms/[slug]/submit`) with no workspace in the URL. A per-workspace
-- unique slug therefore allowed two workspaces to share a slug and route public
-- submissions to the wrong tenant. Make the slug globally unique instead.

-- DropIndex (per-workspace unique + redundant secondary index)
DROP INDEX "Form_workspaceId_slug_key";
DROP INDEX "Form_slug_idx";

-- CreateIndex (global unique — also serves slug lookups)
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");
