-- Drop all existing policies on profiles to start fresh
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Coaches can view their clients profiles" ON profiles;
DROP POLICY IF EXISTS "Clients can view their coaches profiles" ON profiles;

-- Create clean, working policies
CREATE POLICY "Users can select their own profile" ON profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Coaches can view their clients' profiles
CREATE POLICY "Coaches can view their clients profiles" ON profiles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE coach_id = auth.uid() AND client_id = profiles.id AND status = 'active'
        )
    );

-- Clients can view their coach's profile
CREATE POLICY "Clients can view their coaches profiles" ON profiles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE client_id = auth.uid() AND coach_id = profiles.id AND status = 'active'
        )
    );
