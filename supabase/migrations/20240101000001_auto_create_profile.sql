-- Drop existing restrictive policies and recreate them
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;

-- Allow authenticated users to insert their own profile
CREATE POLICY "Enable insert for authenticated users" ON profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a profile for the new user (will be populated by the signup form)
    -- This just ensures the auth trigger doesn't fail
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Supabase has a built-in auth.users table trigger
-- We'll handle profile creation in the application code instead
