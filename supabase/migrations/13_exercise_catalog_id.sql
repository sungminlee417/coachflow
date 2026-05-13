-- Link exercises to the curated catalog (yuhonas/free-exercise-db).
--
-- When a coach picks an exercise from the autocomplete dropdown, we stamp
-- the catalog id on the row so we can dereference metadata (primary
-- muscle, equipment, difficulty) at runtime without normalising every
-- field into our schema. Coaches can still type freeform names — those
-- rows just have NULL catalog_id and behave exactly like today.
--
-- DATA SAFETY: purely additive. Every existing exercise gets NULL for the
-- new column, which is identical to "not in catalog" — no current code
-- path reads catalog_id yet, so nothing changes at runtime.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS catalog_id TEXT;

-- Cheap lookup for future features like "find all clients doing this
-- exercise" or "swap to another exercise with the same primary muscle".
CREATE INDEX IF NOT EXISTS idx_exercises_catalog_id
  ON exercises (catalog_id)
  WHERE catalog_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
