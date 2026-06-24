-- The same person can legitimately be a CRM contact in more than one workspace
-- (different tenants, independent relationships). Global uniqueness on emailHash
-- blocked workspace B from adding a contact whose email already existed in
-- workspace A. Scope uniqueness to (workspaceId, emailHash) so each workspace
-- has at-most-one contact per email, but workspaces can independently own a row
-- for the same person.

-- DropIndex (global unique constraint)
DROP INDEX "CrmContact_emailHash_key";

-- CreateIndex (workspace-scoped unique constraint)
CREATE UNIQUE INDEX "CrmContact_workspaceId_emailHash_key" ON "CrmContact"("workspaceId", "emailHash");
