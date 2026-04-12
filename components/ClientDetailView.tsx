"use client";
import { useChatContext } from "@/app/directmessage/ChatContext";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import ChatBox from "./ChatBox";

interface Client {
  id: string;
  full_name: string;
  email: string;
}

interface Workout {
  id: string;
  name: string;
  description: string;
}

interface WorkoutAssignment {
  id: string;
  assigned_date: string;
  completed: boolean;
  completed_at: string | null;
  workout: {
    id: string;
    name: string;
  };
}

interface ClientDetailViewProps {
  client: Client;
  coachId: string;
  onBack: () => void;
}

export default function ClientDetailView({
  client,
  coachId,
  onBack,
}: ClientDetailViewProps) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignment, setShowAssignment] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [assignDate, setAssignDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [stats, setStats] = useState({
    totalAssigned: 0,
    totalCompleted: 0,
    completionRate: 0,
    currentWeekCompleted: 0,
  });
  const supabase = createClient();

  useEffect(() => {
    fetchClientAssignments();
    fetchWorkouts();
  }, []);

  const fetchWorkouts = async () => {
    try {
      const { data, error } = await supabase
        .from("workouts")
        .select("id, name, description")
        .eq("coach_id", coachId)
        .order("name");

      if (error) throw error;
      setWorkouts(data || []);
    } catch (error) {
      console.error("Error fetching workouts:", error);
    }
  };

  const openChat = () => setOpen(true);
  const closeChat = () => setOpen(false);

  const fetchClientAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from("workout_assignments")
        .select(
          `
          id,
          assigned_date,
          completed,
          completed_at,
          workout:workout_id (
            id,
            name
          )
        `,
        )
        .eq("client_id", client.id)
        .order("assigned_date", { ascending: false })
        .limit(30);

      if (error) throw error;

      const workoutData = data || [];
      setAssignments(workoutData);

      // Calculate stats
      const totalAssigned = workoutData.length;
      const totalCompleted = workoutData.filter((w) => w.completed).length;
      const completionRate =
        totalAssigned > 0
          ? Math.round((totalCompleted / totalAssigned) * 100)
          : 0;

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const currentWeekCompleted = workoutData.filter(
        (w) =>
          w.completed && w.completed_at && new Date(w.completed_at) >= weekAgo,
      ).length;

      setStats({
        totalAssigned,
        totalCompleted,
        completionRate,
        currentWeekCompleted,
      });
    } catch (error) {
      console.error("Error fetching client assignments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignWorkout = async () => {
    if (!selectedWorkout) {
      alert("Please select a workout");
      return;
    }

    setAssigning(true);
    try {
      const { error } = await supabase.from("workout_assignments").insert({
        workout_id: selectedWorkout.id,
        client_id: client.id,
        coach_id: coachId,
        assigned_date: assignDate,
        notes: assignNotes,
      });

      if (error) throw error;

      setShowAssignment(false);
      setSelectedWorkout(null);
      setAssignNotes("");
      fetchClientAssignments();
      alert("Workout assigned successfully!");
    } catch (error) {
      console.error("Error assigning workout:", error);
      alert("Failed to assign workout");
    } finally {
      setAssigning(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div>
      {/* Assignment Modal */}
      {showAssignment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Assign Workout
                </h2>
                <button
                  onClick={() => {
                    setShowAssignment(false);
                    setSelectedWorkout(null);
                    setAssignNotes("");
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              {/* context that holds state value
                client will have t */}

              <div className="mb-4 p-3 bg-blue-50 rounded">
                <p className="text-sm text-blue-900 font-medium">
                  {client.full_name}
                </p>
              </div>

              {workouts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">
                    You don't have any workouts yet.
                  </p>
                  <p className="text-sm text-gray-600">
                    Create a workout first in the Workouts tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Workout *
                    </label>
                    <select
                      value={selectedWorkout?.id || ""}
                      onChange={(e) => {
                        const workout = workouts.find(
                          (w) => w.id === e.target.value,
                        );
                        setSelectedWorkout(workout || null);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Choose a workout...</option>
                      {workouts.map((workout) => (
                        <option key={workout.id} value={workout.id}>
                          {workout.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      value={assignDate}
                      onChange={(e) => setAssignDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes (optional)
                    </label>
                    <textarea
                      value={assignNotes}
                      onChange={(e) => setAssignNotes(e.target.value)}
                      placeholder="Any specific instructions..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleAssignWorkout}
                      disabled={assigning || !selectedWorkout}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {assigning ? "Assigning..." : "Assign Workout"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAssignment(false);
                        setSelectedWorkout(null);
                        setAssignNotes("");
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="mr-4 text-gray-600 hover:text-gray-900"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">
            {client.full_name}
          </h2>
          <p className="text-gray-600">{client.email}</p>
        </div>
        <button
          onClick={() => openChat()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Direct message
        </button>
        <button
          onClick={() => setShowAssignment(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Assign Workout
        </button>
      </div>

      {/* chat box needs to be open based on state
       * absolutely position on bottom left
       * pass in close function so it closes chatbot on button x */}
      <ChatBox clientId={client.id} open={open} />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-2xl font-bold text-gray-900 mb-1">
            {stats.totalAssigned}
          </div>
          <div className="text-sm text-gray-600">Total Assigned</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-2xl font-bold text-green-600 mb-1">
            {stats.totalCompleted}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-2xl font-bold text-blue-600 mb-1">
            {stats.completionRate}%
          </div>
          <div className="text-sm text-gray-600">Completion Rate</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-2xl font-bold text-purple-600 mb-1">
            {stats.currentWeekCompleted}
          </div>
          <div className="text-sm text-gray-600">This Week</div>
        </div>
      </div>

      {/* Workout Assignments */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Assignments
          </h3>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No workouts assigned yet</p>
              <button
                onClick={() => setShowAssignment(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Assign First Workout
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                    assignment.completed
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {assignment.workout.name}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Assigned: {formatDate(assignment.assigned_date)}
                    </div>
                  </div>
                  <div className="text-right">
                    {assignment.completed ? (
                      <div className="flex items-center text-green-600 font-medium">
                        <span className="mr-1">✓</span>
                        Completed
                        {assignment.completed_at && (
                          <span className="ml-2 text-xs text-gray-500">
                            {formatDate(assignment.completed_at)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-500 font-medium">Pending</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
