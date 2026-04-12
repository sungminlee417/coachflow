import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CoachDashboard from "@/components/CoachDashboard";
import ClientDashboard from "@/components/ClientDashboard";
import ProfileNotFound from "@/components/ProfileNotFound";
import { ChatProvider } from "../directmessage/ChatContext";

export default async function Dashboard() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user profile with role
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Profile doesn't exist - this means signup didn't complete properly
    return <ProfileNotFound error={profileError?.message} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ChatProvider>
        {profile.role === "coach" ? (
          <CoachDashboard user={user} profile={profile}>
            {" "}
            hi
          </CoachDashboard> // becomes children
        ) : (
          <ClientDashboard user={user} profile={profile} /> // becomes children
        )}
      </ChatProvider>
    </div>
  );
}
