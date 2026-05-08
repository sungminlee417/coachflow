-- Coach-defined alternatives per food item ("If no eggs, try Greek yogurt").
-- Display-only on the trainee side for now; no per-day substitution tracking
-- (foods don't have individual completion state — meals do).
--
-- Names are free text — alternatives aren't linked to other food rows.

CREATE TABLE IF NOT EXISTS food_alternatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_food_alternatives_food
  ON food_alternatives (food_id, order_index);

ALTER TABLE food_alternatives ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='food_alternatives'
      AND policyname='read alternatives for visible meal plans'
  ) THEN
    CREATE POLICY "read alternatives for visible meal plans"
      ON food_alternatives FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM foods f
          JOIN meals m ON m.id = f.meal_id
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE f.id = food_alternatives.food_id
            AND (
              mp.coach_id = auth.uid()
              OR EXISTS (
                SELECT 1 FROM meal_plan_assignments a
                WHERE a.meal_plan_id = mp.id AND a.client_id = auth.uid()
              )
            )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='food_alternatives'
      AND policyname='coaches manage their food alternatives'
  ) THEN
    CREATE POLICY "coaches manage their food alternatives"
      ON food_alternatives FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM foods f
          JOIN meals m ON m.id = f.meal_id
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE f.id = food_alternatives.food_id
            AND mp.coach_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM foods f
          JOIN meals m ON m.id = f.meal_id
          JOIN meal_plans mp ON mp.id = m.meal_plan_id
          WHERE f.id = food_alternatives.food_id
            AND mp.coach_id = auth.uid()
        )
      );
  END IF;
END $$;
