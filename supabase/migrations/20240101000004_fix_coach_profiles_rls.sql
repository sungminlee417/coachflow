-- Drop existing policies on coach_profiles
DROP POLICY IF EXISTS "Coaches can manage their own coach profile" ON coach_profiles;
DROP POLICY IF EXISTS "Clients can view their coaches profile details" ON coach_profiles;

-- Create policies that allow coaches to create and manage their profiles
CREATE POLICY "Coaches can insert their own coach profile" ON coach_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = id AND
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
    );

CREATE POLICY "Coaches can select their own coach profile" ON coach_profiles
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id OR
        EXISTS (
            SELECT 1 FROM coach_client_relationships
            WHERE client_id = auth.uid() AND coach_id = coach_profiles.id AND status = 'active'
        )
    );

CREATE POLICY "Coaches can update their own coach profile" ON coach_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Coaches can delete their own coach profile" ON coach_profiles
    FOR DELETE
    TO authenticated
    USING (auth.uid() = id);
