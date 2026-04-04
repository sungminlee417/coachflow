-- Drop the existing insert policy
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

-- Create a new policy that allows inserts during signup
-- This allows any authenticated user to insert a profile with their own user ID
CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Also add a policy to allow service role to insert profiles
CREATE POLICY "Service role can insert profiles" ON profiles
    FOR INSERT
    WITH CHECK (true);
