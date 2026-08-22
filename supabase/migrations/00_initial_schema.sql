-- Baseline schema — captures the live production state of CoachFlow's
-- public schema as it existed before any numbered migration was tracked
-- in this repo. The 30+ tables, sequences, indexes, RLS policies, FK
-- constraints, and helper functions below were created through the
-- Supabase dashboard and earlier tooling, never as numbered migrations.
--
-- This file is generated from `pg_dump --schema-only --schema=public`
-- against the live DB, then transformed so every statement is
-- idempotent. Re-running it on an already-migrated database is a
-- no-op for every block:
--   • CREATE TABLE / INDEX / SEQUENCE  → IF NOT EXISTS
--   • CREATE FUNCTION                  → CREATE OR REPLACE FUNCTION
--   • CREATE TYPE                      → DO/EXCEPTION duplicate_object
--   • CREATE TRIGGER                   → DROP IF EXISTS + CREATE
--   • CREATE POLICY                    → DO/IF NOT EXISTS pg_policies
--   • ALTER TABLE ADD CONSTRAINT       → DO/EXCEPTION duplicate_object
--   • ENABLE ROW LEVEL SECURITY        → already idempotent
--
-- The numbered migrations 01..32 that follow this file each modify
-- this baseline (adding columns, indexes, RLS policies, RPCs). They
-- are also written idempotent-first, so the full pipeline can be
-- replayed against either an empty database or this production one.

--
-- PostgreSQL database dump
--




--

-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--

-- Name: invite_status; Type: TYPE; Schema: public; Owner: -
--



--
DO $$ BEGIN
  CREATE TYPE public.invite_status AS ENUM (
      'pending',
      'accepted',
      'expired'
  );


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--



--
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
      'coach',
      'client'
  );


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: get_active_meal_plan_assignments(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_active_meal_plan_assignments(p_client_id uuid, p_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF v_caller <> p_client_id AND NOT EXISTS (
    SELECT 1
    FROM coach_client_relationships
    WHERE coach_id = v_caller
      AND client_id = p_client_id
      AND status = 'active'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', mpa.id,
        'start_date', mpa.start_date,
        'end_date', mpa.end_date,
        'notes', mpa.notes,
        'coach_id', mpa.coach_id,
        'meal_plan', jsonb_build_object(
          'id', mp.id,
          'name', mp.name,
          'description', mp.description,
          'meals', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', m.id,
                'meal_type', m.meal_type,
                'name', m.name,
                'description', m.description,
                'days_of_week', m.days_of_week,
                'time', m.time,
                'order_index', m.order_index,
                'foods', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', f.id,
                      'name', f.name,
                      'quantity', f.quantity,
                      'calories', f.calories,
                      'protein_grams', f.protein_grams,
                      'carbs_grams', f.carbs_grams,
                      'fat_grams', f.fat_grams,
                      'order_index', f.order_index,
                      'ingredients', COALESCE((
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', i.id,
                            'name', i.name,
                            'quantity', i.quantity,
                            'calories', i.calories,
                            'protein_grams', i.protein_grams,
                            'carbs_grams', i.carbs_grams,
                            'fat_grams', i.fat_grams,
                            'order_index', i.order_index
                          )
                          ORDER BY i.order_index
                        )
                        FROM ingredients i
                        WHERE i.food_id = f.id
                      ), '[]'::jsonb),
                      'food_alternatives', COALESCE((
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'id', fa.id,
                            'name', fa.name,
                            'quantity', fa.quantity,
                            'calories', fa.calories,
                            'protein_grams', fa.protein_grams,
                            'carbs_grams', fa.carbs_grams,
                            'fat_grams', fa.fat_grams,
                            'order_index', fa.order_index
                          )
                          ORDER BY fa.order_index
                        )
                        FROM food_alternatives fa
                        WHERE fa.food_id = f.id
                      ), '[]'::jsonb)
                    )
                    ORDER BY f.order_index
                  )
                  FROM foods f
                  WHERE f.meal_id = m.id
                ), '[]'::jsonb)
              )
              ORDER BY m.order_index
            )
            FROM meals m
            WHERE m.meal_plan_id = mp.id
          ), '[]'::jsonb)
        )
      )
    )
    FROM meal_plan_assignments mpa
    JOIN meal_plans mp ON mp.id = mpa.meal_plan_id
    WHERE mpa.client_id = p_client_id
      AND (mpa.start_date IS NULL OR mpa.start_date <= p_date)
      AND (mpa.end_date IS NULL OR mpa.end_date >= p_date)
  ), '[]'::jsonb);
END;
$$;


--

-- Name: get_active_workout_assignments(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_active_workout_assignments(p_client_id uuid, p_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Anonymous callers never get rows.
  IF v_caller IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Caller must be the trainee themselves OR a coach with an active
  -- relationship to the trainee. Self-coaching (coach_id = client_id)
  -- passes the first branch.
  IF v_caller <> p_client_id AND NOT EXISTS (
    SELECT 1
    FROM coach_client_relationships
    WHERE coach_id = v_caller
      AND client_id = p_client_id
      AND status = 'active'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', wa.id,
        'start_date', wa.start_date,
        'end_date', wa.end_date,
        'completed', wa.completed,
        'completed_at', wa.completed_at,
        'notes', wa.notes,
        'coach_id', wa.coach_id,
        'cycle_anchor_date', wa.cycle_anchor_date,
        'workout', jsonb_build_object(
          'id', w.id,
          'name', w.name,
          'description', w.description,
          'days_of_week', w.days_of_week,
          'cycle_length', w.cycle_length,
          'cycle_position', w.cycle_position,
          'exercises', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', e.id,
                'name', e.name,
                'exercise_type', e.exercise_type,
                'sets', e.sets,
                'reps', e.reps,
                'weight', e.weight,
                'rest_seconds', e.rest_seconds,
                'notes', e.notes,
                'order_index', e.order_index,
                'pair_with_next', e.pair_with_next,
                'cardio_subtype', e.cardio_subtype,
                'exercise_sets', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', es.id,
                      'set_number', es.set_number,
                      'target_reps', es.target_reps,
                      'target_duration_seconds', es.target_duration_seconds,
                      'notes', es.notes,
                      'target_speed', es.target_speed,
                      'target_incline', es.target_incline,
                      'target_resistance', es.target_resistance
                    )
                    ORDER BY es.set_number
                  )
                  FROM exercise_sets es
                  WHERE es.exercise_id = e.id
                ), '[]'::jsonb),
                'exercise_alternatives', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', ea.id,
                      'name', ea.name,
                      'order_index', ea.order_index
                    )
                    ORDER BY ea.order_index
                  )
                  FROM exercise_alternatives ea
                  WHERE ea.exercise_id = e.id
                ), '[]'::jsonb)
              )
              ORDER BY e.order_index
            )
            FROM exercises e
            WHERE e.workout_id = w.id
          ), '[]'::jsonb)
        )
      )
    )
    FROM workout_assignments wa
    JOIN workouts w ON w.id = wa.workout_id
    WHERE wa.client_id = p_client_id
      AND (wa.start_date IS NULL OR wa.start_date <= p_date)
      AND (wa.end_date IS NULL OR wa.end_date >= p_date)
  ), '[]'::jsonb);
END;
$$;


--

-- Name: get_client_last_active_dates(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.get_client_last_active_dates(p_coach_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR v_caller <> p_coach_id THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'client_id', client_id,
        'last_active_date', last_active_date
      )
    )
    FROM (
      SELECT
        ccr.client_id,
        GREATEST(
          -- set_logs has no client_id of its own — ownership lives on
          -- the parent workout_assignments row, so we join through.
          (
            SELECT MAX(sl.logged_date)
            FROM set_logs sl
            JOIN workout_assignments wa ON wa.id = sl.assignment_id
            WHERE wa.client_id = ccr.client_id
          ),
          (SELECT MAX(ml.logged_date) FROM meal_logs ml WHERE ml.user_id = ccr.client_id),
          (SELECT MAX(wl.recorded_at) FROM weight_logs wl WHERE wl.user_id = ccr.client_id),
          (SELECT MAX(bm.recorded_at) FROM body_measurements bm WHERE bm.user_id = ccr.client_id)
        ) AS last_active_date
      FROM coach_client_relationships ccr
      WHERE ccr.coach_id = p_coach_id
        AND ccr.status = 'active'
        AND ccr.client_id <> ccr.coach_id
    ) t
  ), '[]'::jsonb);
END;
$$;


--

-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Insert a profile for the new user (will be populated by the signup form)
    -- This just ensures the auth trigger doesn't fail
    RETURN NEW;
END;
$$;


--

-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--

-- Name: use_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.use_invite(code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_invite record;
  v_coach_name text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;

  SELECT id, coach_id, status, times_used, max_uses, expires_at, revoked_at
    INTO v_invite
  FROM invite_codes
  WHERE invite_codes.code = use_invite.code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  IF v_invite.status <> 'pending' OR v_invite.times_used >= v_invite.max_uses THEN
    RETURN jsonb_build_object('status', 'fully_used');
  END IF;

  IF v_invite.coach_id = v_caller THEN
    RETURN jsonb_build_object('status', 'self_code');
  END IF;

  IF EXISTS (
    SELECT 1 FROM coach_client_relationships
    WHERE coach_id = v_invite.coach_id AND client_id = v_caller
  ) THEN
    RETURN jsonb_build_object('status', 'already_connected');
  END IF;

  -- Atomic: create the relationship and bump the counter together. If
  -- either statement raises, the other rolls back.
  INSERT INTO coach_client_relationships (coach_id, client_id, invite_code_id)
  VALUES (v_invite.coach_id, v_caller, v_invite.id);

  UPDATE invite_codes
  SET
    times_used = v_invite.times_used + 1,
    status = CASE
      WHEN v_invite.times_used + 1 >= v_invite.max_uses THEN 'accepted'
      ELSE 'pending'
    END
  WHERE id = v_invite.id;

  SELECT full_name INTO v_coach_name
  FROM profiles
  WHERE id = v_invite.coach_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'coach_name', COALESCE(v_coach_name, 'your coach')
  );
END;
$$;




--

-- Name: body_measurements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.body_measurements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recorded_at date DEFAULT CURRENT_DATE NOT NULL,
    weight numeric,
    neck numeric,
    shoulders numeric,
    waist numeric,
    hips numeric,
    chest numeric,
    chest_flexed boolean DEFAULT false NOT NULL,
    thigh_left numeric,
    thigh_left_flexed boolean DEFAULT false NOT NULL,
    thigh_right numeric,
    thigh_right_flexed boolean DEFAULT false NOT NULL,
    calf_left numeric,
    calf_left_flexed boolean DEFAULT false NOT NULL,
    calf_right numeric,
    calf_right_flexed boolean DEFAULT false NOT NULL,
    arm_left numeric,
    arm_left_flexed boolean DEFAULT false NOT NULL,
    arm_right numeric,
    arm_right_flexed boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shoulders_flexed boolean DEFAULT false NOT NULL
);


--

-- Name: coach_client_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.coach_client_relationships (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    client_id uuid NOT NULL,
    invite_code_id uuid,
    status text DEFAULT 'active'::text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--

-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid,
    client_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    content text,
    is_read boolean
);


--

-- Name: COLUMN conversations.content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.content IS 'text';


--

-- Name: COLUMN conversations.is_read; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.conversations.is_read IS 'whether the message has been read by the receiver';


--

-- Name: exercise_alternatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.exercise_alternatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exercise_id uuid NOT NULL,
    name text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: exercise_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.exercise_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exercise_id uuid NOT NULL,
    set_number integer NOT NULL,
    target_reps text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    target_duration_seconds integer,
    target_speed text,
    target_incline text,
    target_resistance text
);


--

-- Name: exercise_substitutions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.exercise_substitutions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    logged_date date NOT NULL,
    substituted_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.exercises (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    workout_id uuid NOT NULL,
    name text NOT NULL,
    sets numeric,
    reps text,
    weight text,
    rest_seconds numeric,
    notes text,
    order_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pair_with_next boolean DEFAULT false NOT NULL,
    exercise_type text DEFAULT 'strength'::text NOT NULL,
    catalog_id text,
    cardio_subtype text,
    CONSTRAINT exercises_exercise_type_check CHECK ((exercise_type = ANY (ARRAY['strength'::text, 'cardio'::text])))
);


--

-- Name: food_alternatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.food_alternatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    food_id uuid NOT NULL,
    name text NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    quantity text,
    calories numeric,
    protein_grams numeric,
    carbs_grams numeric,
    fat_grams numeric
);


--

-- Name: foods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.foods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meal_id uuid NOT NULL,
    name text NOT NULL,
    quantity text,
    calories numeric,
    protein_grams numeric,
    carbs_grams numeric,
    fat_grams numeric,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: ingredients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    food_id uuid NOT NULL,
    name text NOT NULL,
    quantity text,
    calories numeric,
    protein_grams numeric,
    carbs_grams numeric,
    fat_grams numeric,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: invite_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.invite_codes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    code text NOT NULL,
    coach_id uuid NOT NULL,
    status public.invite_status DEFAULT 'pending'::public.invite_status,
    max_uses integer DEFAULT 1,
    times_used integer DEFAULT 0,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    revoked_at timestamp with time zone
);


--

-- Name: meal_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.meal_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    meal_id uuid NOT NULL,
    user_id uuid NOT NULL,
    logged_date date NOT NULL,
    completed boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: meal_plan_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.meal_plan_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    meal_plan_id uuid NOT NULL,
    client_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    start_date date,
    end_date date
);


--

-- Name: meal_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.meal_plans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_template boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--

-- Name: meals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.meals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    meal_plan_id uuid NOT NULL,
    meal_type text NOT NULL,
    name text NOT NULL,
    description text,
    calories numeric,
    protein_grams numeric,
    carbs_grams numeric,
    fat_grams numeric,
    order_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    days_of_week smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "time" time without time zone,
    CONSTRAINT meals_days_of_week_valid CHECK ((days_of_week <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))
);


--

-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    sender_id uuid,
    content text,
    created_at timestamp without time zone DEFAULT now()
);


--

-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role public.user_role,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    length_unit text DEFAULT 'in'::text NOT NULL,
    weight_unit text DEFAULT 'lbs'::text NOT NULL,
    weight_goal numeric,
    rest_timer_enabled boolean DEFAULT true NOT NULL,
    show_streak_card boolean DEFAULT true NOT NULL,
    theme text DEFAULT 'system'::text NOT NULL,
    weight_program_start_date date,
    CONSTRAINT profiles_length_unit_check CHECK ((length_unit = ANY (ARRAY['in'::text, 'cm'::text]))),
    CONSTRAINT profiles_theme_check CHECK ((theme = ANY (ARRAY['system'::text, 'light'::text, 'dark'::text]))),
    CONSTRAINT profiles_weight_unit_check CHECK ((weight_unit = ANY (ARRAY['lbs'::text, 'kg'::text])))
);


--

-- Name: program_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.program_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    client_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    cycle_anchor_date date,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: set_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.set_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    set_number integer NOT NULL,
    reps_performed numeric,
    weight_performed numeric,
    completed boolean DEFAULT false NOT NULL,
    notes text,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_performed_seconds integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    logged_date date DEFAULT CURRENT_DATE NOT NULL,
    speed_performed numeric,
    incline_performed numeric,
    resistance_performed numeric
);


--

-- Name: weight_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.weight_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recorded_at date DEFAULT CURRENT_DATE NOT NULL,
    weight numeric NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    body_fat_percent numeric(5,2)
);


--

-- Name: workout_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.workout_assignments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    workout_id uuid NOT NULL,
    client_id uuid NOT NULL,
    coach_id uuid NOT NULL,
    completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    start_date date,
    end_date date,
    cycle_anchor_date date
);


--

-- Name: workout_program_workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.workout_program_workouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    program_id uuid NOT NULL,
    workout_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: workout_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.workout_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coach_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_template boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.workouts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    coach_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_template boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    days_of_week smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    cycle_length integer,
    cycle_position integer,
    CONSTRAINT workouts_cycle_length_check CHECK (((cycle_length IS NULL) OR ((cycle_length >= 1) AND (cycle_length <= 60)))),
    CONSTRAINT workouts_cycle_paired CHECK ((((cycle_length IS NULL) AND (cycle_position IS NULL)) OR ((cycle_length IS NOT NULL) AND (cycle_position IS NOT NULL) AND (cycle_position <= cycle_length)))),
    CONSTRAINT workouts_cycle_position_check CHECK (((cycle_position IS NULL) OR (cycle_position >= 1))),
    CONSTRAINT workouts_days_of_week_valid CHECK ((days_of_week <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))
);


--

-- Name: body_measurements body_measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.body_measurements'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.body_measurements
      ADD CONSTRAINT body_measurements_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: coach_client_relationships coach_client_relationships_coach_id_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.coach_client_relationships
      ADD CONSTRAINT coach_client_relationships_coach_id_client_id_key UNIQUE (coach_id, client_id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: coach_client_relationships coach_client_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.coach_client_relationships'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.coach_client_relationships
        ADD CONSTRAINT coach_client_relationships_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: conversations conversations_coach_id_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.conversations
      ADD CONSTRAINT conversations_coach_id_client_id_key UNIQUE (coach_id, client_id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.conversations'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.conversations
        ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: exercise_alternatives exercise_alternatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.exercise_alternatives'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.exercise_alternatives
        ADD CONSTRAINT exercise_alternatives_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: exercise_sets exercise_sets_exercise_id_set_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.exercise_sets
      ADD CONSTRAINT exercise_sets_exercise_id_set_number_key UNIQUE (exercise_id, set_number);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: exercise_sets exercise_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.exercise_sets'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.exercise_sets
        ADD CONSTRAINT exercise_sets_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: exercise_substitutions exercise_substitutions_assignment_id_exercise_id_logged_dat_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.exercise_substitutions
      ADD CONSTRAINT exercise_substitutions_assignment_id_exercise_id_logged_dat_key UNIQUE (assignment_id, exercise_id, logged_date);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: exercise_substitutions exercise_substitutions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.exercise_substitutions'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.exercise_substitutions
        ADD CONSTRAINT exercise_substitutions_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.exercises'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.exercises
        ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: food_alternatives food_alternatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.food_alternatives'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.food_alternatives
        ADD CONSTRAINT food_alternatives_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: foods foods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.foods'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.foods
        ADD CONSTRAINT foods_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ingredients'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.ingredients
        ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: invite_codes invite_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.invite_codes
      ADD CONSTRAINT invite_codes_code_key UNIQUE (code);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.invite_codes'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.invite_codes
        ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: meal_logs meal_logs_meal_id_user_id_logged_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_logs
      ADD CONSTRAINT meal_logs_meal_id_user_id_logged_date_key UNIQUE (meal_id, user_id, logged_date);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_logs meal_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meal_logs'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.meal_logs
        ADD CONSTRAINT meal_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: meal_plan_assignments meal_plan_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meal_plan_assignments'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.meal_plan_assignments
        ADD CONSTRAINT meal_plan_assignments_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: meal_plans meal_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meal_plans'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.meal_plans
        ADD CONSTRAINT meal_plans_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: meals meals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meals'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.meals
        ADD CONSTRAINT meals_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.messages
        ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.profiles
        ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: program_assignments program_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.program_assignments'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.program_assignments
        ADD CONSTRAINT program_assignments_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: program_assignments program_assignments_program_id_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.program_assignments
      ADD CONSTRAINT program_assignments_program_id_client_id_key UNIQUE (program_id, client_id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: set_logs set_logs_assignment_exercise_set_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.set_logs
      ADD CONSTRAINT set_logs_assignment_exercise_set_date_key UNIQUE (assignment_id, exercise_id, set_number, logged_date);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: set_logs set_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.set_logs'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.set_logs
        ADD CONSTRAINT set_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: weight_logs weight_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.weight_logs'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.weight_logs
        ADD CONSTRAINT weight_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: weight_logs weight_logs_user_id_recorded_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.weight_logs
      ADD CONSTRAINT weight_logs_user_id_recorded_at_key UNIQUE (user_id, recorded_at);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_assignments workout_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workout_assignments'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.workout_assignments
        ADD CONSTRAINT workout_assignments_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: workout_program_workouts workout_program_workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workout_program_workouts'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.workout_program_workouts
        ADD CONSTRAINT workout_program_workouts_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: workout_program_workouts workout_program_workouts_program_id_workout_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workout_program_workouts
      ADD CONSTRAINT workout_program_workouts_program_id_workout_id_key UNIQUE (program_id, workout_id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_programs workout_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workout_programs'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.workout_programs
        ADD CONSTRAINT workout_programs_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: workouts workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workouts'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.workouts
        ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);
  END IF;
END $$;


-- Name: idx_body_measurements_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON public.body_measurements USING btree (user_id, recorded_at DESC);


--

-- Name: idx_body_measurements_user_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_recorded ON public.body_measurements USING btree (user_id, recorded_at DESC);


--

-- Name: idx_coach_client_relationships_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_coach_client_relationships_client ON public.coach_client_relationships USING btree (client_id);


--

-- Name: idx_coach_client_relationships_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_coach_client_relationships_coach ON public.coach_client_relationships USING btree (coach_id);


--

-- Name: idx_exercise_alternatives_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_exercise_alternatives_exercise ON public.exercise_alternatives USING btree (exercise_id, order_index);


--

-- Name: idx_exercise_sets_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_exercise_sets_exercise ON public.exercise_sets USING btree (exercise_id);


--

-- Name: idx_exercise_substitutions_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_exercise_substitutions_lookup ON public.exercise_substitutions USING btree (assignment_id, exercise_id, logged_date DESC);


--

-- Name: idx_exercises_catalog_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_exercises_catalog_id ON public.exercises USING btree (catalog_id) WHERE (catalog_id IS NOT NULL);


--

-- Name: idx_exercises_workout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_exercises_workout ON public.exercises USING btree (workout_id);


--

-- Name: idx_food_alternatives_food; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_food_alternatives_food ON public.food_alternatives USING btree (food_id, order_index);


--

-- Name: idx_foods_meal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_foods_meal ON public.foods USING btree (meal_id);


--

-- Name: idx_foods_meal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_foods_meal_id ON public.foods USING btree (meal_id);


--

-- Name: idx_ingredients_food; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_ingredients_food ON public.ingredients USING btree (food_id);


--

-- Name: idx_ingredients_food_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_ingredients_food_id ON public.ingredients USING btree (food_id);


--

-- Name: idx_invite_codes_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_invite_codes_coach ON public.invite_codes USING btree (coach_id);


--

-- Name: idx_invite_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON public.invite_codes USING btree (code);


--

-- Name: idx_meal_logs_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_date ON public.meal_logs USING btree (user_id, logged_date);


--

-- Name: idx_meal_plan_assignments_client_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_meal_plan_assignments_client_date ON public.meal_plan_assignments USING btree (client_id, start_date);


--

-- Name: idx_meal_plan_assignments_plan_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_meal_plan_assignments_plan_client ON public.meal_plan_assignments USING btree (meal_plan_id, client_id);


--

-- Name: idx_meal_plans_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_meal_plans_coach ON public.meal_plans USING btree (coach_id);


--

-- Name: idx_meals_meal_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_meals_meal_plan ON public.meals USING btree (meal_plan_id);


--

-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles USING btree (role);


--

-- Name: idx_program_assignments_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_program_assignments_lookup ON public.program_assignments USING btree (program_id, client_id);


--

-- Name: idx_program_workouts_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_program_workouts_lookup ON public.workout_program_workouts USING btree (program_id, order_index);


--

-- Name: idx_set_logs_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_set_logs_assignment ON public.set_logs USING btree (assignment_id);


--

-- Name: idx_set_logs_exercise_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_set_logs_exercise_history ON public.set_logs USING btree (exercise_id, logged_date DESC) WHERE (completed = true);


--

-- Name: idx_set_logs_prior_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_set_logs_prior_lookup ON public.set_logs USING btree (exercise_id, assignment_id, logged_date DESC);


--

-- Name: idx_set_logs_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_set_logs_progress ON public.set_logs USING btree (exercise_id, logged_date DESC);


--

-- Name: idx_weight_logs_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON public.weight_logs USING btree (user_id, recorded_at DESC);


--

-- Name: idx_weight_logs_user_recorded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_weight_logs_user_recorded ON public.weight_logs USING btree (user_id, recorded_at DESC);


--

-- Name: idx_workout_assignments_client_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_workout_assignments_client_date ON public.workout_assignments USING btree (client_id, start_date);


--

-- Name: idx_workout_assignments_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_workout_assignments_coach ON public.workout_assignments USING btree (coach_id);


--

-- Name: idx_workout_assignments_workout_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_workout_assignments_workout_client ON public.workout_assignments USING btree (workout_id, client_id);


--

-- Name: idx_workouts_coach; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS idx_workouts_coach ON public.workouts USING btree (coach_id);


--

-- Name: meal_plan_assignments_unique_per_client; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS meal_plan_assignments_unique_per_client ON public.meal_plan_assignments USING btree (meal_plan_id, client_id);


--

-- Name: workout_assignments_unique_per_client; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS workout_assignments_unique_per_client ON public.workout_assignments USING btree (workout_id, client_id);


--

-- Name: coach_client_relationships update_coach_client_relationships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_coach_client_relationships_updated_at ON public.coach_client_relationships;
CREATE TRIGGER update_coach_client_relationships_updated_at BEFORE UPDATE ON public.coach_client_relationships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: exercises update_exercises_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_exercises_updated_at ON public.exercises;
CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: invite_codes update_invite_codes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_invite_codes_updated_at ON public.invite_codes;
CREATE TRIGGER update_invite_codes_updated_at BEFORE UPDATE ON public.invite_codes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: meal_plan_assignments update_meal_plan_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_meal_plan_assignments_updated_at ON public.meal_plan_assignments;
CREATE TRIGGER update_meal_plan_assignments_updated_at BEFORE UPDATE ON public.meal_plan_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: meal_plans update_meal_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_meal_plans_updated_at ON public.meal_plans;
CREATE TRIGGER update_meal_plans_updated_at BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: meals update_meals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_meals_updated_at ON public.meals;
CREATE TRIGGER update_meals_updated_at BEFORE UPDATE ON public.meals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: workout_assignments update_workout_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_workout_assignments_updated_at ON public.workout_assignments;
CREATE TRIGGER update_workout_assignments_updated_at BEFORE UPDATE ON public.workout_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: workouts update_workouts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS update_workouts_updated_at ON public.workouts;
CREATE TRIGGER update_workouts_updated_at BEFORE UPDATE ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: body_measurements body_measurements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.body_measurements
      ADD CONSTRAINT body_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: coach_client_relationships coach_client_relationships_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.coach_client_relationships
      ADD CONSTRAINT coach_client_relationships_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: coach_client_relationships coach_client_relationships_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.coach_client_relationships
      ADD CONSTRAINT coach_client_relationships_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: coach_client_relationships coach_client_relationships_invite_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.coach_client_relationships
      ADD CONSTRAINT coach_client_relationships_invite_code_id_fkey FOREIGN KEY (invite_code_id) REFERENCES public.invite_codes(id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: conversations conversations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.conversations
      ADD CONSTRAINT conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: conversations conversations_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.conversations
      ADD CONSTRAINT conversations_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: exercise_alternatives exercise_alternatives_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.exercise_alternatives
      ADD CONSTRAINT exercise_alternatives_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: exercise_sets exercise_sets_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.exercise_sets
      ADD CONSTRAINT exercise_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: exercise_substitutions exercise_substitutions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.exercise_substitutions
      ADD CONSTRAINT exercise_substitutions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.workout_assignments(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: exercise_substitutions exercise_substitutions_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.exercise_substitutions
      ADD CONSTRAINT exercise_substitutions_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: exercises exercises_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.exercises
      ADD CONSTRAINT exercises_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: food_alternatives food_alternatives_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.food_alternatives
      ADD CONSTRAINT food_alternatives_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: foods foods_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.foods
      ADD CONSTRAINT foods_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: ingredients ingredients_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.ingredients
      ADD CONSTRAINT ingredients_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: invite_codes invite_codes_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.invite_codes
      ADD CONSTRAINT invite_codes_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_logs meal_logs_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_logs
      ADD CONSTRAINT meal_logs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.meal_plan_assignments(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_logs meal_logs_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_logs
      ADD CONSTRAINT meal_logs_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_logs meal_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_logs
      ADD CONSTRAINT meal_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_plan_assignments meal_plan_assignments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_plan_assignments
      ADD CONSTRAINT meal_plan_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_plan_assignments meal_plan_assignments_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_plan_assignments
      ADD CONSTRAINT meal_plan_assignments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_plan_assignments meal_plan_assignments_meal_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_plan_assignments
      ADD CONSTRAINT meal_plan_assignments_meal_plan_id_fkey FOREIGN KEY (meal_plan_id) REFERENCES public.meal_plans(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meal_plans meal_plans_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meal_plans
      ADD CONSTRAINT meal_plans_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: meals meals_meal_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.meals
      ADD CONSTRAINT meals_meal_plan_id_fkey FOREIGN KEY (meal_plan_id) REFERENCES public.meal_plans(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.messages
      ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.messages
      ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.profiles
      ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: program_assignments program_assignments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.program_assignments
      ADD CONSTRAINT program_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: program_assignments program_assignments_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.program_assignments
      ADD CONSTRAINT program_assignments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: program_assignments program_assignments_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.program_assignments
      ADD CONSTRAINT program_assignments_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.workout_programs(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: set_logs set_logs_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.set_logs
      ADD CONSTRAINT set_logs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.workout_assignments(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: set_logs set_logs_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.set_logs
      ADD CONSTRAINT set_logs_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: weight_logs weight_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.weight_logs
      ADD CONSTRAINT weight_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_assignments workout_assignments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workout_assignments
      ADD CONSTRAINT workout_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_assignments workout_assignments_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workout_assignments
      ADD CONSTRAINT workout_assignments_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_assignments workout_assignments_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workout_assignments
      ADD CONSTRAINT workout_assignments_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_program_workouts workout_program_workouts_program_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workout_program_workouts
      ADD CONSTRAINT workout_program_workouts_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.workout_programs(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_program_workouts workout_program_workouts_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workout_program_workouts
      ADD CONSTRAINT workout_program_workouts_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workout_programs workout_programs_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workout_programs
      ADD CONSTRAINT workout_programs_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES auth.users(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: workouts workouts_coach_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  ALTER TABLE ONLY public.workouts
      ADD CONSTRAINT workouts_coach_id_fkey FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


  --
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Name: invite_codes Anyone can view valid invite codes for signup; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invite_codes'
      AND policyname = 'Anyone can view valid invite codes for signup'
  ) THEN
    CREATE POLICY "Anyone can view valid invite codes for signup" ON public.invite_codes FOR SELECT USING (((status = 'pending'::public.invite_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (times_used < max_uses)));


    --
  END IF;
END $$;


-- Name: profiles Clients can view their coaches profiles; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Clients can view their coaches profiles'
  ) THEN
    CREATE POLICY "Clients can view their coaches profiles" ON public.profiles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
       FROM public.coach_client_relationships
      WHERE ((coach_client_relationships.client_id = auth.uid()) AND (coach_client_relationships.coach_id = profiles.id) AND (coach_client_relationships.status = 'active'::text)))));


    --
  END IF;
END $$;


-- Name: coach_client_relationships Clients can view their relationships; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coach_client_relationships'
      AND policyname = 'Clients can view their relationships'
  ) THEN
    CREATE POLICY "Clients can view their relationships" ON public.coach_client_relationships FOR SELECT USING ((auth.uid() = client_id));


    --
  END IF;
END $$;


-- Name: set_logs Clients manage own set_logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'set_logs'
      AND policyname = 'Clients manage own set_logs'
  ) THEN
    CREATE POLICY "Clients manage own set_logs" ON public.set_logs USING ((assignment_id IN ( SELECT workout_assignments.id
       FROM public.workout_assignments
      WHERE (workout_assignments.client_id = auth.uid())))) WITH CHECK ((assignment_id IN ( SELECT workout_assignments.id
       FROM public.workout_assignments
      WHERE (workout_assignments.client_id = auth.uid()))));


    --
  END IF;
END $$;


-- Name: invite_codes Coaches can manage their own invite codes; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invite_codes'
      AND policyname = 'Coaches can manage their own invite codes'
  ) THEN
    CREATE POLICY "Coaches can manage their own invite codes" ON public.invite_codes USING ((auth.uid() = coach_id));


    --
  END IF;
END $$;


-- Name: profiles Coaches can view their clients profiles; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Coaches can view their clients profiles'
  ) THEN
    CREATE POLICY "Coaches can view their clients profiles" ON public.profiles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
       FROM public.coach_client_relationships
      WHERE ((coach_client_relationships.coach_id = auth.uid()) AND (coach_client_relationships.client_id = profiles.id) AND (coach_client_relationships.status = 'active'::text)))));


    --
  END IF;
END $$;


-- Name: coach_client_relationships Coaches can view their relationships; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coach_client_relationships'
      AND policyname = 'Coaches can view their relationships'
  ) THEN
    CREATE POLICY "Coaches can view their relationships" ON public.coach_client_relationships FOR SELECT USING ((auth.uid() = coach_id));


    --
  END IF;
END $$;


-- Name: body_measurements Coaches view client measurements; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'body_measurements'
      AND policyname = 'Coaches view client measurements'
  ) THEN
    CREATE POLICY "Coaches view client measurements" ON public.body_measurements FOR SELECT USING ((user_id IN ( SELECT coach_client_relationships.client_id
       FROM public.coach_client_relationships
      WHERE ((coach_client_relationships.coach_id = auth.uid()) AND (coach_client_relationships.status = 'active'::text) AND (coach_client_relationships.client_id <> auth.uid())))));


    --
  END IF;
END $$;


-- Name: set_logs Coaches view client set_logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'set_logs'
      AND policyname = 'Coaches view client set_logs'
  ) THEN
    CREATE POLICY "Coaches view client set_logs" ON public.set_logs FOR SELECT USING ((assignment_id IN ( SELECT workout_assignments.id
       FROM public.workout_assignments
      WHERE (workout_assignments.coach_id = auth.uid()))));


    --
  END IF;
END $$;


-- Name: weight_logs Coaches view client weight logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weight_logs'
      AND policyname = 'Coaches view client weight logs'
  ) THEN
    CREATE POLICY "Coaches view client weight logs" ON public.weight_logs FOR SELECT USING ((user_id IN ( SELECT coach_client_relationships.client_id
       FROM public.coach_client_relationships
      WHERE ((coach_client_relationships.coach_id = auth.uid()) AND (coach_client_relationships.status = 'active'::text) AND (coach_client_relationships.client_id <> auth.uid())))));


    --
  END IF;
END $$;


-- Name: conversations Users can create conversations; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversations'
      AND policyname = 'Users can create conversations'
  ) THEN
    CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT WITH CHECK (((auth.uid() = coach_id) OR (auth.uid() = client_id)));


    --
  END IF;
END $$;


-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


    --
  END IF;
END $$;


-- Name: profiles Users can select their own profile; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users can select their own profile'
  ) THEN
    CREATE POLICY "Users can select their own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


    --
  END IF;
END $$;


-- Name: messages Users can send messages; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
      AND policyname = 'Users can send messages'
  ) THEN
    CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
       FROM public.conversations
      WHERE ((conversations.id = messages.conversation_id) AND ((conversations.coach_id = auth.uid()) OR (conversations.client_id = auth.uid())))))));


    --
  END IF;
END $$;


-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


    --
  END IF;
END $$;


-- Name: messages Users can view messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
      AND policyname = 'Users can view messages in their conversations'
  ) THEN
    CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING ((EXISTS ( SELECT 1
       FROM public.conversations
      WHERE ((conversations.id = messages.conversation_id) AND ((conversations.coach_id = auth.uid()) OR (conversations.client_id = auth.uid()))))));


    --
  END IF;
END $$;


-- Name: conversations Users can view their conversations; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversations'
      AND policyname = 'Users can view their conversations'
  ) THEN
    CREATE POLICY "Users can view their conversations" ON public.conversations FOR SELECT USING (((auth.uid() = coach_id) OR (auth.uid() = client_id)));


    --
  END IF;
END $$;


-- Name: body_measurements Users manage own measurements; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'body_measurements'
      AND policyname = 'Users manage own measurements'
  ) THEN
    CREATE POLICY "Users manage own measurements" ON public.body_measurements USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: weight_logs Users manage own weight logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weight_logs'
      AND policyname = 'Users manage own weight logs'
  ) THEN
    CREATE POLICY "Users manage own weight logs" ON public.weight_logs USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: invite_codes accept only active invites; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invite_codes'
      AND policyname = 'accept only active invites'
  ) THEN
    CREATE POLICY "accept only active invites" ON public.invite_codes FOR SELECT USING (((revoked_at IS NULL) AND ((expires_at IS NULL) OR (expires_at > now())) AND (times_used < max_uses)));


    --
  END IF;
END $$;


-- Name: body_measurements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

--

-- Name: profiles client reads coach profile; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'client reads coach profile'
  ) THEN
    CREATE POLICY "client reads coach profile" ON public.profiles FOR SELECT USING ((EXISTS ( SELECT 1
       FROM public.coach_client_relationships ccr
      WHERE ((ccr.client_id = auth.uid()) AND (ccr.coach_id = profiles.id)))));


    --
  END IF;
END $$;


-- Name: exercise_substitutions clients manage their substitutions; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_substitutions'
      AND policyname = 'clients manage their substitutions'
  ) THEN
    CREATE POLICY "clients manage their substitutions" ON public.exercise_substitutions USING ((EXISTS ( SELECT 1
       FROM public.workout_assignments a
      WHERE ((a.id = exercise_substitutions.assignment_id) AND (a.client_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM public.workout_assignments a
      WHERE ((a.id = exercise_substitutions.assignment_id) AND (a.client_id = auth.uid())))));


    --
  END IF;
END $$;


-- Name: program_assignments clients see their program assignments; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'program_assignments'
      AND policyname = 'clients see their program assignments'
  ) THEN
    CREATE POLICY "clients see their program assignments" ON public.program_assignments FOR SELECT USING ((client_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: workout_assignments clients update completion of their assignments; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_assignments'
      AND policyname = 'clients update completion of their assignments'
  ) THEN
    CREATE POLICY "clients update completion of their assignments" ON public.workout_assignments FOR UPDATE USING ((client_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((client_id = ( SELECT auth.uid() AS uid)));


    --
  END IF;
END $$;


-- Name: meal_plan_assignments clients view their meal plan assignments; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_plan_assignments'
      AND policyname = 'clients view their meal plan assignments'
  ) THEN
    CREATE POLICY "clients view their meal plan assignments" ON public.meal_plan_assignments FOR SELECT USING ((client_id = ( SELECT auth.uid() AS uid)));


    --
  END IF;
END $$;


-- Name: workout_assignments clients view their workout assignments; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_assignments'
      AND policyname = 'clients view their workout assignments'
  ) THEN
    CREATE POLICY "clients view their workout assignments" ON public.workout_assignments FOR SELECT USING ((client_id = ( SELECT auth.uid() AS uid)));


    --
  END IF;
END $$;


-- Name: profiles coach reads client profiles; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'coach reads client profiles'
  ) THEN
    CREATE POLICY "coach reads client profiles" ON public.profiles FOR SELECT USING ((EXISTS ( SELECT 1
       FROM public.coach_client_relationships ccr
      WHERE ((ccr.coach_id = auth.uid()) AND (ccr.client_id = profiles.id)))));


    --
  END IF;
END $$;


-- Name: coach_client_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coach_client_relationships ENABLE ROW LEVEL SECURITY;

--

-- Name: exercises coaches manage exercises in their workouts; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercises'
      AND policyname = 'coaches manage exercises in their workouts'
  ) THEN
    CREATE POLICY "coaches manage exercises in their workouts" ON public.exercises USING ((EXISTS ( SELECT 1
       FROM public.workouts w
      WHERE ((w.id = exercises.workout_id) AND (w.coach_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM public.workouts w
      WHERE ((w.id = exercises.workout_id) AND (w.coach_id = ( SELECT auth.uid() AS uid))))));


    --
  END IF;
END $$;


-- Name: foods coaches manage foods in their plans; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'foods'
      AND policyname = 'coaches manage foods in their plans'
  ) THEN
    CREATE POLICY "coaches manage foods in their plans" ON public.foods USING ((EXISTS ( SELECT 1
       FROM (public.meals m
         JOIN public.meal_plans mp ON ((mp.id = m.meal_plan_id)))
      WHERE ((m.id = foods.meal_id) AND (mp.coach_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM (public.meals m
         JOIN public.meal_plans mp ON ((mp.id = m.meal_plan_id)))
      WHERE ((m.id = foods.meal_id) AND (mp.coach_id = ( SELECT auth.uid() AS uid))))));


    --
  END IF;
END $$;


-- Name: ingredients coaches manage ingredients in their plans; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ingredients'
      AND policyname = 'coaches manage ingredients in their plans'
  ) THEN
    CREATE POLICY "coaches manage ingredients in their plans" ON public.ingredients USING ((EXISTS ( SELECT 1
       FROM ((public.foods f
         JOIN public.meals m ON ((m.id = f.meal_id)))
         JOIN public.meal_plans mp ON ((mp.id = m.meal_plan_id)))
      WHERE ((f.id = ingredients.food_id) AND (mp.coach_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM ((public.foods f
         JOIN public.meals m ON ((m.id = f.meal_id)))
         JOIN public.meal_plans mp ON ((mp.id = m.meal_plan_id)))
      WHERE ((f.id = ingredients.food_id) AND (mp.coach_id = ( SELECT auth.uid() AS uid))))));


    --
  END IF;
END $$;


-- Name: meals coaches manage meals in their plans; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meals'
      AND policyname = 'coaches manage meals in their plans'
  ) THEN
    CREATE POLICY "coaches manage meals in their plans" ON public.meals USING ((EXISTS ( SELECT 1
       FROM public.meal_plans mp
      WHERE ((mp.id = meals.meal_plan_id) AND (mp.coach_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM public.meal_plans mp
      WHERE ((mp.id = meals.meal_plan_id) AND (mp.coach_id = ( SELECT auth.uid() AS uid))))));


    --
  END IF;
END $$;


-- Name: exercise_sets coaches manage sets in their workouts; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_sets'
      AND policyname = 'coaches manage sets in their workouts'
  ) THEN
    CREATE POLICY "coaches manage sets in their workouts" ON public.exercise_sets USING ((EXISTS ( SELECT 1
       FROM (public.exercises e
         JOIN public.workouts w ON ((w.id = e.workout_id)))
      WHERE ((e.id = exercise_sets.exercise_id) AND (w.coach_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM (public.exercises e
         JOIN public.workouts w ON ((w.id = e.workout_id)))
      WHERE ((e.id = exercise_sets.exercise_id) AND (w.coach_id = ( SELECT auth.uid() AS uid))))));


    --
  END IF;
END $$;


-- Name: exercise_alternatives coaches manage their alternatives; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_alternatives'
      AND policyname = 'coaches manage their alternatives'
  ) THEN
    CREATE POLICY "coaches manage their alternatives" ON public.exercise_alternatives USING ((EXISTS ( SELECT 1
       FROM (public.exercises e
         JOIN public.workouts w ON ((w.id = e.workout_id)))
      WHERE ((e.id = exercise_alternatives.exercise_id) AND (w.coach_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM (public.exercises e
         JOIN public.workouts w ON ((w.id = e.workout_id)))
      WHERE ((e.id = exercise_alternatives.exercise_id) AND (w.coach_id = auth.uid())))));


    --
  END IF;
END $$;


-- Name: food_alternatives coaches manage their food alternatives; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'food_alternatives'
      AND policyname = 'coaches manage their food alternatives'
  ) THEN
    CREATE POLICY "coaches manage their food alternatives" ON public.food_alternatives USING ((EXISTS ( SELECT 1
       FROM ((public.foods f
         JOIN public.meals m ON ((m.id = f.meal_id)))
         JOIN public.meal_plans mp ON ((mp.id = m.meal_plan_id)))
      WHERE ((f.id = food_alternatives.food_id) AND (mp.coach_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM ((public.foods f
         JOIN public.meals m ON ((m.id = f.meal_id)))
         JOIN public.meal_plans mp ON ((mp.id = m.meal_plan_id)))
      WHERE ((f.id = food_alternatives.food_id) AND (mp.coach_id = auth.uid())))));


    --
  END IF;
END $$;


-- Name: invite_codes coaches manage their invite codes; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invite_codes'
      AND policyname = 'coaches manage their invite codes'
  ) THEN
    CREATE POLICY "coaches manage their invite codes" ON public.invite_codes USING ((coach_id = auth.uid())) WITH CHECK ((coach_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: meal_plan_assignments coaches manage their meal plan assignments; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_plan_assignments'
      AND policyname = 'coaches manage their meal plan assignments'
  ) THEN
    CREATE POLICY "coaches manage their meal plan assignments" ON public.meal_plan_assignments USING ((coach_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((coach_id = ( SELECT auth.uid() AS uid)));


    --
  END IF;
END $$;


-- Name: meal_plans coaches manage their meal plans; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_plans'
      AND policyname = 'coaches manage their meal plans'
  ) THEN
    CREATE POLICY "coaches manage their meal plans" ON public.meal_plans USING ((coach_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((coach_id = ( SELECT auth.uid() AS uid)));


    --
  END IF;
END $$;


-- Name: workout_programs coaches manage their own programs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_programs'
      AND policyname = 'coaches manage their own programs'
  ) THEN
    CREATE POLICY "coaches manage their own programs" ON public.workout_programs USING ((coach_id = auth.uid())) WITH CHECK ((coach_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: program_assignments coaches manage their program assignments; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'program_assignments'
      AND policyname = 'coaches manage their program assignments'
  ) THEN
    CREATE POLICY "coaches manage their program assignments" ON public.program_assignments USING ((coach_id = auth.uid())) WITH CHECK ((coach_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: workout_assignments coaches manage their workout assignments; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_assignments'
      AND policyname = 'coaches manage their workout assignments'
  ) THEN
    CREATE POLICY "coaches manage their workout assignments" ON public.workout_assignments USING ((coach_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((coach_id = ( SELECT auth.uid() AS uid)));


    --
  END IF;
END $$;


-- Name: workouts coaches manage their workouts; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workouts'
      AND policyname = 'coaches manage their workouts'
  ) THEN
    CREATE POLICY "coaches manage their workouts" ON public.workouts USING ((coach_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((coach_id = ( SELECT auth.uid() AS uid)));


    --
  END IF;
END $$;


-- Name: workout_program_workouts coaches manage workouts in their programs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_program_workouts'
      AND policyname = 'coaches manage workouts in their programs'
  ) THEN
    CREATE POLICY "coaches manage workouts in their programs" ON public.workout_program_workouts USING ((EXISTS ( SELECT 1
       FROM public.workout_programs p
      WHERE ((p.id = workout_program_workouts.program_id) AND (p.coach_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM public.workout_programs p
      WHERE ((p.id = workout_program_workouts.program_id) AND (p.coach_id = auth.uid())))));


    --
  END IF;
END $$;


-- Name: meal_logs coaches view their clients' meal logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_logs'
      AND policyname = 'coaches view their clients' meal logs'
  ) THEN
    CREATE POLICY "coaches view their clients' meal logs" ON public.meal_logs FOR SELECT USING ((EXISTS ( SELECT 1
       FROM public.coach_client_relationships ccr
      WHERE ((ccr.client_id = meal_logs.user_id) AND (ccr.coach_id = auth.uid()) AND (ccr.status = 'active'::text)))));


    --
  END IF;
END $$;


-- Name: exercise_substitutions coaches view their clients' substitutions; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_substitutions'
      AND policyname = 'coaches view their clients' substitutions'
  ) THEN
    CREATE POLICY "coaches view their clients' substitutions" ON public.exercise_substitutions FOR SELECT USING ((EXISTS ( SELECT 1
       FROM public.workout_assignments a
      WHERE ((a.id = exercise_substitutions.assignment_id) AND (a.coach_id = auth.uid())))));


    --
  END IF;
END $$;


-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--

-- Name: exercise_alternatives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_alternatives ENABLE ROW LEVEL SECURITY;

--

-- Name: exercise_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_sets ENABLE ROW LEVEL SECURITY;

--

-- Name: exercise_substitutions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_substitutions ENABLE ROW LEVEL SECURITY;

--

-- Name: exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

--

-- Name: food_alternatives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.food_alternatives ENABLE ROW LEVEL SECURITY;

--

-- Name: foods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

--

-- Name: ingredients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

--

-- Name: invite_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

--

-- Name: meal_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

--

-- Name: meal_plan_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_plan_assignments ENABLE ROW LEVEL SECURITY;

--

-- Name: meal_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

--

-- Name: meals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

--

-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--

-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--

-- Name: program_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_assignments ENABLE ROW LEVEL SECURITY;

--

-- Name: food_alternatives read alternatives for visible meal plans; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'food_alternatives'
      AND policyname = 'read alternatives for visible meal plans'
  ) THEN
    CREATE POLICY "read alternatives for visible meal plans" ON public.food_alternatives FOR SELECT USING ((EXISTS ( SELECT 1
       FROM ((public.foods f
         JOIN public.meals m ON ((m.id = f.meal_id)))
         JOIN public.meal_plans mp ON ((mp.id = m.meal_plan_id)))
      WHERE ((f.id = food_alternatives.food_id) AND ((mp.coach_id = auth.uid()) OR (EXISTS ( SELECT 1
               FROM public.meal_plan_assignments a
              WHERE ((a.meal_plan_id = mp.id) AND (a.client_id = auth.uid())))))))));


    --
  END IF;
END $$;


-- Name: exercise_alternatives read alternatives for visible workouts; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_alternatives'
      AND policyname = 'read alternatives for visible workouts'
  ) THEN
    CREATE POLICY "read alternatives for visible workouts" ON public.exercise_alternatives FOR SELECT USING ((EXISTS ( SELECT 1
       FROM (public.exercises e
         JOIN public.workouts w ON ((w.id = e.workout_id)))
      WHERE ((e.id = exercise_alternatives.exercise_id) AND ((w.coach_id = auth.uid()) OR (EXISTS ( SELECT 1
               FROM public.workout_assignments a
              WHERE ((a.workout_id = w.id) AND (a.client_id = auth.uid())))))))));


    --
  END IF;
END $$;


-- Name: set_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.set_logs ENABLE ROW LEVEL SECURITY;

--

-- Name: coach_client_relationships trainee creates own relationship; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coach_client_relationships'
      AND policyname = 'trainee creates own relationship'
  ) THEN
    CREATE POLICY "trainee creates own relationship" ON public.coach_client_relationships FOR INSERT WITH CHECK ((client_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: meal_logs user manages own meal logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_logs'
      AND policyname = 'user manages own meal logs'
  ) THEN
    CREATE POLICY "user manages own meal logs" ON public.meal_logs USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: body_measurements user manages own measurements; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'body_measurements'
      AND policyname = 'user manages own measurements'
  ) THEN
    CREATE POLICY "user manages own measurements" ON public.body_measurements USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: set_logs user manages own set logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'set_logs'
      AND policyname = 'user manages own set logs'
  ) THEN
    CREATE POLICY "user manages own set logs" ON public.set_logs USING ((EXISTS ( SELECT 1
       FROM public.workout_assignments wa
      WHERE ((wa.id = set_logs.assignment_id) AND (wa.client_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
       FROM public.workout_assignments wa
      WHERE ((wa.id = set_logs.assignment_id) AND (wa.client_id = auth.uid())))));


    --
  END IF;
END $$;


-- Name: weight_logs user manages own weight logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'weight_logs'
      AND policyname = 'user manages own weight logs'
  ) THEN
    CREATE POLICY "user manages own weight logs" ON public.weight_logs USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: profiles user reads own profile; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'user reads own profile'
  ) THEN
    CREATE POLICY "user reads own profile" ON public.profiles FOR SELECT USING ((id = auth.uid()));


    --
  END IF;
END $$;


-- Name: profiles user updates own profile; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'user updates own profile'
  ) THEN
    CREATE POLICY "user updates own profile" ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


    --
  END IF;
END $$;


-- Name: meal_logs users manage their own meal logs; Type: POLICY; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meal_logs'
      AND policyname = 'users manage their own meal logs'
  ) THEN
    CREATE POLICY "users manage their own meal logs" ON public.meal_logs USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


    --
  END IF;
END $$;


-- Name: weight_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

--

-- Name: workout_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_assignments ENABLE ROW LEVEL SECURITY;

--

-- Name: workout_program_workouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_program_workouts ENABLE ROW LEVEL SECURITY;

--

-- Name: workout_programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;

--

-- Name: workouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--
