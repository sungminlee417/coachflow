'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardGridSkeleton } from '@/components/ui/Skeleton'
import { Plus, Send, Pencil, Trash2, ListChecks } from 'lucide-react'
import type { WorkoutProgram } from '@/lib/types'
import dynamic from 'next/dynamic'
// Lazy-loaded — only mounted after the coach taps "Create / Edit", so
// keeping it out of the dashboard's initial JS chunk is a free win.
const ProgramBuilder = dynamic(() => import('./ProgramBuilder'), { ssr: false })
import ProgramAssignmentModal from './ProgramAssignmentModal'

interface ProgramLibraryProps {
  coachId: string
}

export default function ProgramLibrary({ coachId }: ProgramLibraryProps) {
  const supabase = useSupabase()
  const [programs, setPrograms] = useState<WorkoutProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editing, setEditing] = useState<WorkoutProgram | null>(null)
  const [assigning, setAssigning] = useState<WorkoutProgram | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchPrograms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPrograms = async () => {
    try {
      const { data, error } = await supabase
        .from('workout_programs')
        .select(
          'id, name, description, is_template, created_at, workout_program_workouts(count)'
        )
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: WorkoutProgram[] = (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        is_template: !!p.is_template,
        created_at: p.created_at,
        workout_count: p.workout_program_workouts?.[0]?.count ?? 0,
      }))
      setPrograms(list)
    } catch {
      // Silently downgrade to empty state — surfaced via the empty UI below.
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      // CASCADE on workout_program_workouts cleans up the join rows.
      // workout_assignments are NOT linked to programs and remain intact.
      const { error } = await supabase
        .from('workout_programs')
        .delete()
        .eq('id', deletingId)
      if (error) throw error
      await fetchPrograms()
      showToast('Program deleted')
    } catch {
      showToast('Failed to delete program', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  if (showBuilder) {
    return (
      <ProgramBuilder
        coachId={coachId}
        program={editing}
        onClose={() => {
          setShowBuilder(false)
          setEditing(null)
          fetchPrograms()
        }}
      />
    )
  }

  if (loading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Programs</h2>
            <p className="text-sm text-slate-400 mt-1">Loading programs…</p>
          </div>
        </div>
        <CardGridSkeleton count={3} />
      </div>
    )
  }

  return (
    <div>
      <ProgramAssignmentModal
        open={!!assigning}
        coachId={coachId}
        programId={assigning?.id ?? ''}
        programName={assigning?.name ?? ''}
        onClose={() => setAssigning(null)}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Delete program?"
        message="The program and its workout list will be removed. The individual workouts and any assignments you've already made stay untouched."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Programs</h2>
          <p className="text-sm text-slate-500 mt-1">
            {programs.length} {programs.length === 1 ? 'program' : 'programs'}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setShowBuilder(true)
          }}
        >
          <Plus size={16} />
          Create Program
        </Button>
      </div>

      {programs.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No programs yet"
          description="Group your workouts into programs (e.g., Push/Pull/Legs) so you can assign multiple at once."
          action={
            <Button
              onClick={() => {
                setEditing(null)
                setShowBuilder(true)
              }}
            >
              <Plus size={16} />
              Create Your First Program
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map(p => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-slate-200 p-5 transition-all hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex justify-between items-start mb-2 gap-2">
                <h3 className="font-semibold text-slate-900">{p.name}</h3>
                {p.is_template && (
                  <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-50 text-purple-600 border border-purple-200 rounded-full">
                    Template
                  </span>
                )}
              </div>
              {p.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{p.description}</p>
              )}
              <p className="text-xs text-slate-400 mb-4 tabular-nums">
                {p.workout_count} {p.workout_count === 1 ? 'workout' : 'workouts'}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setAssigning(p)} className="flex-1">
                  <Send size={14} />
                  Assign
                </Button>
                <IconButton
                  onClick={() => {
                    setEditing(p)
                    setShowBuilder(true)
                  }}
                  aria-label="Edit program"
                >
                  <Pencil size={16} />
                </IconButton>
                <IconButton
                  tone="danger"
                  onClick={() => setDeletingId(p.id)}
                  aria-label="Delete program"
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
