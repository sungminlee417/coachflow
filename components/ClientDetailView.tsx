"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "./Toast";
import { ArrowLeft, Plus, X, CheckCircle, Clock } from "lucide-react";
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
  const [close, setClose] = useState(false);
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
    } catch {}
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workoutData = (data || []).map((item: any) => ({
        ...item,
        workout: Array.isArray(item.workout) ? item.workout[0] : item.workout,
      }));
      setAssignments(workoutData);

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
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleAssignWorkout = async () => {
    if (!selectedWorkout) {
      showToast("Please select a workout", "error");
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
      showToast("Workout assigned successfully!");
    } catch {
      showToast("Failed to assign workout", "error");
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  Assign Workout
                </h2>
                <button
                  onClick={() => {
                    setShowAssignment(false);
                    setSelectedWorkout(null);
                    setAssignNotes("");
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              {/* context that holds state value
                client will have t */}

              <div className="mb-5 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                <p className="text-sm text-indigo-700 font-medium">
                  {client.full_name}
                </p>
              </div>

              {workouts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500 mb-1">No workouts yet</p>
                  <p className="text-sm text-slate-400">
                    Create a workout first in the My Workouts tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="cd-workout"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Workout
                    </label>
                    <select
                      id="cd-workout"
                      value={selectedWorkout?.id || ""}
                      onChange={(e) => {
                        const workout = workouts.find(
                          (w) => w.id === e.target.value,
                        );
                        setSelectedWorkout(workout || null);
                      }}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
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
                    <label
                      htmlFor="cd-date"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Date
                    </label>
                    <input
                      id="cd-date"
                      type="date"
                      value={assignDate}
                      onChange={(e) => setAssignDate(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cd-notes"
                      className="block text-sm font-medium text-slate-700 mb-1"
                    >
                      Notes{" "}
                      <span className="text-slate-400 font-normal">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      id="cd-notes"
                      value={assignNotes}
                      onChange={(e) => setAssignNotes(e.target.value)}
                      placeholder="Any specific instructions..."
                      rows={3}
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleAssignWorkout}
                      disabled={assigning || !selectedWorkout}
                      className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors cursor-pointer"
                    >
                      {assigning ? "Assigning..." : "Assign Workout"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAssignment(false);
                        setSelectedWorkout(null);
                        setAssignNotes("");
                      }}
                      className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors cursor-pointer"
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-bold">
              {client.full_name?.charAt(0) || "C"}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {client.full_name}
              </h2>
              <p className="text-sm text-slate-500">{client.email}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => openChat()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Direct message
        </button>
        <button
          onClick={() => setShowAssignment(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Assign Workout
        </button>
      </div>

      {/* chat box needs to be open based on state
       * absolutely position on bottom left
       * pass in close function so it closes chatbot on button x */}
      <ChatBox
        clientId={client.id}
        open={open}
        onClose={closeChat}
        client={client}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">
            {stats.totalAssigned}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Total Assigned</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-emerald-600">
            {stats.totalCompleted}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Completed</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-indigo-600">
            {stats.completionRate}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Completion Rate</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-2xl font-bold text-purple-600">
            {stats.currentWeekCompleted}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">This Week</div>
        </div>
      </div>

      {/* Workout Assignments */}
      <div>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Recent Assignments
        </h3>

        {loading ? (
          <div className="text-slate-400 text-sm py-8 text-center">
            Loading...
          </div>
        ) : assignments.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500 mb-1">No workouts assigned yet</p>
            <p className="text-sm text-slate-400 mb-4">
              Assign their first workout to get started
            </p>
            <button
              onClick={() => setShowAssignment(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors cursor-pointer"
            >
              <Plus size={16} />
              Assign First Workout
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className={`flex items-center justify-between p-4 rounded-xl border ${
                  assignment.completed
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  {assignment.completed ? (
                    <CheckCircle size={18} className="text-emerald-500" />
                  ) : (
                    <Clock size={18} className="text-slate-400" />
                  )}
                  <div>
                    <p className="font-medium text-slate-900 text-sm">
                      {assignment.workout.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Assigned: {formatDate(assignment.assigned_date)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {assignment.completed ? (
                    <span className="text-xs font-medium text-emerald-600">
                      Completed{" "}
                      {assignment.completed_at &&
                        formatDate(assignment.completed_at)}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-slate-400">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
