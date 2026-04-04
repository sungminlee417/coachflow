-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('coach', 'client');

-- Create enum for invite status
CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'expired');

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coach profiles table (additional coach-specific info)
CREATE TABLE coach_profiles (
    id UUID REFERENCES profiles(id) PRIMARY KEY,
    bio TEXT,
    specialties TEXT[],
    certifications TEXT[],
    years_experience INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invite codes table
CREATE TABLE invite_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    status invite_status DEFAULT 'pending',
    max_uses INTEGER DEFAULT 1,
    times_used INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coach-Client relationships table
CREATE TABLE coach_client_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    invite_code_id UUID REFERENCES invite_codes(id),
    status TEXT DEFAULT 'active',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(coach_id, client_id)
);

-- Workouts table
CREATE TABLE workouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_template BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exercises table
CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workout_id UUID REFERENCES workouts(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    sets INTEGER,
    reps TEXT, -- Can be "10-12" or "AMRAP" etc
    weight TEXT,
    rest_seconds INTEGER,
    notes TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workout assignments table (assigns workouts to clients on specific dates)
CREATE TABLE workout_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workout_id UUID REFERENCES workouts(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    assigned_date DATE NOT NULL,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meal plans table
CREATE TABLE meal_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_template BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meals table
CREATE TABLE meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meal_plan_id UUID REFERENCES meal_plans(id) ON DELETE CASCADE NOT NULL,
    meal_type TEXT NOT NULL, -- breakfast, lunch, dinner, snack
    name TEXT NOT NULL,
    description TEXT,
    calories INTEGER,
    protein_grams DECIMAL,
    carbs_grams DECIMAL,
    fat_grams DECIMAL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Meal plan assignments table
CREATE TABLE meal_plan_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meal_plan_id UUID REFERENCES meal_plans(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    assigned_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_invite_codes_coach ON invite_codes(coach_id);
CREATE INDEX idx_invite_codes_code ON invite_codes(code);
CREATE INDEX idx_coach_client_relationships_coach ON coach_client_relationships(coach_id);
CREATE INDEX idx_coach_client_relationships_client ON coach_client_relationships(client_id);
CREATE INDEX idx_workouts_coach ON workouts(coach_id);
CREATE INDEX idx_workout_assignments_client_date ON workout_assignments(client_id, assigned_date);
CREATE INDEX idx_workout_assignments_coach ON workout_assignments(coach_id);
CREATE INDEX idx_meal_plans_coach ON meal_plans(coach_id);
CREATE INDEX idx_meal_plan_assignments_client_date ON meal_plan_assignments(client_id, assigned_date);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_client_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_assignments ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Coaches can view their clients' profiles
CREATE POLICY "Coaches can view their clients profiles" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE coach_id = auth.uid() AND client_id = profiles.id AND status = 'active'
        )
    );

-- Clients can view their coach's profile
CREATE POLICY "Clients can view their coaches profiles" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE client_id = auth.uid() AND coach_id = profiles.id AND status = 'active'
        )
    );

-- Coach profiles policies
CREATE POLICY "Coaches can manage their own coach profile" ON coach_profiles
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "Clients can view their coaches profile details" ON coach_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE client_id = auth.uid() AND coach_id = coach_profiles.id AND status = 'active'
        )
    );

-- Invite codes policies
CREATE POLICY "Coaches can manage their own invite codes" ON invite_codes
    FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "Anyone can view valid invite codes for signup" ON invite_codes
    FOR SELECT USING (
        status = 'pending' AND
        (expires_at IS NULL OR expires_at > NOW()) AND
        (times_used < max_uses)
    );

-- Coach-client relationships policies
CREATE POLICY "Coaches can view their relationships" ON coach_client_relationships
    FOR SELECT USING (auth.uid() = coach_id);

CREATE POLICY "Clients can view their relationships" ON coach_client_relationships
    FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "System can create relationships" ON coach_client_relationships
    FOR INSERT WITH CHECK (true);

-- Workouts policies
CREATE POLICY "Coaches can manage their own workouts" ON workouts
    FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "Clients can view workouts assigned to them" ON workouts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workout_assignments
            WHERE workout_assignments.workout_id = workouts.id
            AND workout_assignments.client_id = auth.uid()
        )
    );

-- Exercises policies
CREATE POLICY "Coaches can manage exercises in their workouts" ON exercises
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM workouts
            WHERE workouts.id = exercises.workout_id AND workouts.coach_id = auth.uid()
        )
    );

CREATE POLICY "Clients can view exercises in assigned workouts" ON exercises
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM workout_assignments wa
            JOIN workouts w ON w.id = wa.workout_id
            WHERE w.id = exercises.workout_id AND wa.client_id = auth.uid()
        )
    );

-- Workout assignments policies
CREATE POLICY "Coaches can manage workout assignments for their clients" ON workout_assignments
    FOR ALL USING (
        auth.uid() = coach_id AND
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE coach_id = auth.uid() AND client_id = workout_assignments.client_id AND status = 'active'
        )
    );

CREATE POLICY "Clients can view their workout assignments" ON workout_assignments
    FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Clients can update completion status of their assignments" ON workout_assignments
    FOR UPDATE USING (auth.uid() = client_id)
    WITH CHECK (auth.uid() = client_id);

-- Meal plans policies
CREATE POLICY "Coaches can manage their own meal plans" ON meal_plans
    FOR ALL USING (auth.uid() = coach_id);

CREATE POLICY "Clients can view meal plans assigned to them" ON meal_plans
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM meal_plan_assignments
            WHERE meal_plan_assignments.meal_plan_id = meal_plans.id
            AND meal_plan_assignments.client_id = auth.uid()
        )
    );

-- Meals policies
CREATE POLICY "Coaches can manage meals in their meal plans" ON meals
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM meal_plans
            WHERE meal_plans.id = meals.meal_plan_id AND meal_plans.coach_id = auth.uid()
        )
    );

CREATE POLICY "Clients can view meals in assigned meal plans" ON meals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM meal_plan_assignments mpa
            JOIN meal_plans mp ON mp.id = mpa.meal_plan_id
            WHERE mp.id = meals.meal_plan_id AND mpa.client_id = auth.uid()
        )
    );

-- Meal plan assignments policies
CREATE POLICY "Coaches can manage meal plan assignments for their clients" ON meal_plan_assignments
    FOR ALL USING (
        auth.uid() = coach_id AND
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE coach_id = auth.uid() AND client_id = meal_plan_assignments.client_id AND status = 'active'
        )
    );

CREATE POLICY "Clients can view their meal plan assignments" ON meal_plan_assignments
    FOR SELECT USING (auth.uid() = client_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coach_profiles_updated_at BEFORE UPDATE ON coach_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invite_codes_updated_at BEFORE UPDATE ON invite_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coach_client_relationships_updated_at BEFORE UPDATE ON coach_client_relationships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workouts_updated_at BEFORE UPDATE ON workouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON exercises
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workout_assignments_updated_at BEFORE UPDATE ON workout_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meal_plans_updated_at BEFORE UPDATE ON meal_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meals_updated_at BEFORE UPDATE ON meals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meal_plan_assignments_updated_at BEFORE UPDATE ON meal_plan_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
