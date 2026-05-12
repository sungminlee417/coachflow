-- Soft-revoke for invite codes. When a coach hits the trash icon on a code
-- that has already produced a coach_client_relationships row, hard-deleting
-- the invite would leave the relationship's invite_code_id dangling. Instead
-- we stamp revoked_at and skip the row during acceptance + filter it out of
-- the default list. Pending/unused codes are still hard-deleted by the UI.
--
-- DATA SAFETY: this is purely additive. Existing rows get NULL for the new
-- column, which means "not revoked" — identical to today's behavior.

ALTER TABLE invite_codes
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
