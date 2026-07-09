'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CardGridSkeleton } from '@/components/ui/Skeleton'
import { sortLibrary, type LibrarySortMode } from '@/components/ui/LibrarySort'
import { LibraryFilterableGrid } from '@/components/ui/LibraryFilterableGrid'
import { Plus, Send, Pencil, Trash2, ListChecks, Copy } from 'lucide-react'
import { stripMeta } from '@/lib/copy-utils'
import type { WorkoutProgram } from '@/lib/types'
import dynamic from 'next/dynamic'
// Lazy-loaded — only mounted after the coach taps "Create / Edit", so
// keeping it out of the dashboard's initial JS chunk is a free win.
const ProgramBuilder = dynamic(() => import('./ProgramBuilder'), { ssr: false })
import ProgramAssignmentModal from '../assignments/ProgramAssignmentModal'

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
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<LibrarySortMode>('recent')

  const visiblePrograms = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? programs.filter(p => p.name.toLowerCase().includes(q))
      : programs
    return sortLibrary(filtered, sortMode)
  }, [programs, query, sortMode])

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
      // workout_assignments are NOT linked to programs — they survive deletion and stay intact.
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

  const handleDuplicate = async (programId: string) => {
    setDuplicatingId(programId)
    try {
      const { data: src } = await supabase.from('workout_programs').select('*').eq('id', programId).maybeSingle()
      if (!src) throw new Error('Source not found')

      const { data: program, error: insertErr } = await supabase
        .from('workout_programs')
        .insert({ ...stripMeta(src), name: `${src.name} (copy)`, coach_id: coachId })
        .select('id')
        .single()
      if (insertErr || !program) throw insertErr ?? new Error('Insert failed')

      const { data: joinRows } = await supabase
        .from('workout_program_workouts')
        .select('workout_id, order_index')
        .eq('program_id', programId)
        .order('order_index')

      if (joinRows?.length) {
        // Member workouts are shared — the copy gives a different grouping, not cloned content.
        const { error: joinErr } = await supabase
          .from('workout_program_workouts')
          .insert(joinRows.map(r => ({ program_id: program.id, workout_id: r.workout_id, order_index: r.order_index })))
        if (joinErr) throw joinErr
      }

      await fetchPrograms()
      showToast('Program duplicated')
    } catch (err) {
      console.error('handleDuplicate failed:', err)
      showToast('Failed to duplicate program', 'error')
    } finally {
      setDuplicatingId(null)
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
            <h2 className="text-2xl font-bold text-foreground">Programs</h2>
            <p className="text-sm text-subtle mt-1">Loading programs…</p>
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
          <h2 className="text-2xl font-bold text-foreground">Programs</h2>
          <p className="text-sm text-muted mt-1">
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
        <LibraryFilterableGrid
          total={programs.length}
          visibleCount={visiblePrograms.length}
          query={query}
          onQueryChange={setQuery}
          sortMode={sortMode}
          onSortChange={setSortMode}
          searchPlaceholder="Search programs…"
          emptyMatchLabel="programs"
        >
          {visiblePrograms.map(p => (
            <div
              key={p.id}
              className="bg-surface rounded-xl border border-line p-5 flex flex-col gap-3 transition-all hover:border-indigo-line hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground leading-snug">{p.name}</h3>
                {p.is_template && (
                  <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-soft text-purple-fg border border-purple-line rounded-full">
                    Template
                  </span>
                )}
              </div>

              <div className="flex-1">
                {p.description && (
                  <p className="text-sm text-muted line-clamp-2">{p.description}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-elevated text-xs text-subtle font-medium tabular-nums">
                  <ListChecks size={11} className="text-indigo-500" />
                  {p.workout_count} {p.workout_count === 1 ? 'workout' : 'workouts'}
                </span>
                <div className="flex items-center gap-1">
                  <IconButton
                    onClick={() => { setEditing(p); setShowBuilder(true) }}
                    aria-label="Edit program"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton
                    onClick={() => handleDuplicate(p.id)}
                    aria-label="Duplicate program"
                    title="Duplicate"
                    disabled={duplicatingId === p.id}
                  >
                    <Copy size={15} />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    onClick={() => setDeletingId(p.id)}
                    aria-label="Delete program"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>

              <Button onClick={() => setAssigning(p)} variant="secondary" className="w-full">
                <Send size={14} />
                Assign to client
              </Button>
            </div>
          ))}
        </LibraryFilterableGrid>
      )}
    </div>
  )
}
