"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import InviteCodeGenerator from "./InviteCodeGenerator";
import ClientList from "./ClientList";
import WorkoutLibrary from "./WorkoutLibrary";

interface CoachDashboardProps {
  user: User;
  profile: any;
}

export default function CoachDashboard({ user, profile }: CoachDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "clients" | "workouts" | "invites"
  >("clients");
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CoachFlow</h1>
              <p className="text-sm text-gray-600">
                Welcome back, {profile.full_name}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("clients")}
              className={`${
                activeTab === "clients"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300" 
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              My Clients
            </button>
            <button
              onClick={() => setActiveTab("workouts")}
              className={`${
                activeTab === "workouts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Workouts
            </button>
            <button
              onClick={() => setActiveTab("invites")}
              className={`${
                activeTab === "invites"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              Invite Codes
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "clients" && <ClientList coachId={user.id} />}
        {activeTab === "workouts" && <WorkoutLibrary coachId={user.id} />}
        {activeTab === "invites" && <InviteCodeGenerator coachId={user.id} />}
      </div>
    </div>
  );
}
