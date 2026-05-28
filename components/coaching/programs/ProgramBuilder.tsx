'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { useAssignmentSync } from '@/lib/hooks/use-assignment-sync'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SortableList, DragHandle } from '@/components/ui/SortableList'
import { BuilderHeader } from '@/components/ui/BuilderHeader'
import { BuilderSaveBar } from '@/components/ui/BuilderSaveBar'
import { BuilderCard } from '@/components/ui/BuilderCard'
import { EmptyStateCard } from '@/components/ui/EmptyStateCard'
import { DiscardDialog } from '@/components/ui/DiscardDialog'
import { AddItemButton } from '@/components/ui/AddItemButton'
import { AddFab } from '@/components/ui/AddFab'
import { useDirtyState } from '@/lib/use-dirty-state'
import { Plus, X, Search } from 'lucide-react'
import type { WorkoutProgram } from '@/lib/types'

interface ProgramBuilderProps {
  coachId: string
  program: WorkoutProgram | null
  onClose: () => void
}

interface MemberWorkout {
  id: string
  name: string
  description: string
  exercise_count: number
  cycle_length: number | null
  cycle_position: number | null
}

export default function ProgramBuilder({ coachId, program, onClose }: ProgramBuilderProps) {
  const supabase = useSupabase()
  const { invalidateWorkouts } = useAssignmentSync()
  const [name, setName] = useState(program?.name || '')
  const [description, setDescription] = useState(program?.description || '')
  const [isTemplate, setIsTemplate] = useState(program?.is_template || false)
  const [members, setMembers] = useState<MemberWorkout[]>([])
  const [allWorkouts, setAllWorkouts] = useState<MemberWorkout[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Don't snapshot for dirty-state until the initial fetches finish — otherwise
  // the dirty badge flashes the moment the form is opened to edit.
  const [snapshotReady, setSnapshotReady] = useState(!program?.id)

  const isDirty = useDirtyState(
    { name, description, isTemplate, memberIds: members.map(m => m.id) },
    snapshotReady
  )

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchAll = async () => {
    try {
      // Coach's full workout catalog — used both as the picker source and the
      // lookup for member metadata.
      const { data: catalog, error: catalogErr } = await supabase
        .from('workouts')
        .select(
          'id, name, description, cycle_length, cycle_position, exercises(count)'
        )
        .eq('coach_id', coachId)
        .order('name')
      if (catalogErr) throw catalogErr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: MemberWorkout[] = (catalog ?? []).map((w: any) => ({
        id: w.id,
        name: w.name,
        description: w.description ?? '',
        exercise_count: w.exercises?.[0]?.count ?? 0,
        cycle_length: w.cycle_length ?? null,
        cycle_position: w.cycle_position ?? null,
      }))
      setAllWorkouts(list)

      if (program?.id) {
        const { data: rows, error } = await supabase
          .from('workout_program_workouts')
          .select('workout_id, order_index')
          .eq('program_id', program.id)
          .order('order_index', { ascending: true })
        if (error) throw error
        const byId = new Map(list.map(w => [w.id, w]))
        const ordered: MemberWorkout[] = (rows ?? [])
          .map((r: { workout_id: string }) => byId.get(r.workout_id))
          .filter((w): w is MemberWorkout => !!w)
        setMembers(ordered)
      }
    } catch {
      showToast('Failed to load program', 'error')
    } finally {
      setSnapshotReady(true)
    }
  }

  const addMember = (workout: MemberWorkout) => {
    setMembers(prev => (prev.find(m => m.id === workout.id) ? prev : [...prev, workout]))
    setShowPicker(false)
    setPickerQuery('')
  }

  const removeMember = (workoutId: string) => {
    setMembers(prev => prev.filter(m => m.id !== workoutId))
  }

  const requestClose = () => {
    if (isDirty && !saving) setConfirmDiscard(true)
    else onClose()
  }

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Please enter a program name', 'error')
      return
    }
    setSaving(true)
    try {
      let programId = program?.id
      if (programId) {
        const { error } = await supabase
          .from('workout_programs')
          .update({ name, description, is_template: isTemplate })
          .eq('id', programId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('workout_programs')
          .insert({
            coach_id: coachId,
            name,
            description,
            is_template: isTemplate,
          })
          .select()
          .single()
        if (error) throw error
        programId = data.id
      }

      // Capture which workouts were on the program *before* the save so we
      // can compute what got added and fan those out to clients who already
      // have the program assigned. Removed workouts intentionally don't
      // touch existing client assignments — we never auto-unassign.
      const previousWorkoutIds = new Set<string>()
      if (program?.id) {
        const { data: existing } = await supabase
          .from('workout_program_workouts')
          .select('workout_id')
          .eq('program_id', programId)
        for (const r of (existing ?? []) as { workout_id: string }[]) {
          previousWorkoutIds.add(r.workout_id)
        }
      }

      // Replace strategy on the join table — these rows are pure metadata,
      // never referenced by anything else, so a clean delete-then-reinsert
      // doesn't risk client data.
      if (program?.id) {
        await supabase
          .from('workout_program_workouts')
          .delete()
          .eq('program_id', programId)
      }
      if (members.length > 0) {
        const rows = members.map((m, i) => ({
          program_id: programId,
          workout_id: m.id,
          order_index: i,
        }))
        const { error } = await supabase.from('workout_program_workouts').insert(rows)
        if (error) throw error
      }

      // ── Auto-fan-out: any newly-added workouts get assigned to every
      // client that already has this program. Purely additive — uses the
      // same upsert + ignoreDuplicates pattern as the assign flow, so it
      // can never overwrite or delete existing client data.
      const addedWorkouts = members.filter(m => !previousWorkoutIds.has(m.id))
      if (program?.id && addedWorkouts.length > 0) {
        try {
          const { data: tracked } = await supabase
            .from('program_assignments')
            .select('client_id, coach_id, cycle_anchor_date')
            .eq('program_id', programId)
          const tracking = (tracked ?? []) as {
            client_id: string
            coach_id: string
            cycle_anchor_date: string | null
          }[]
          if (tracking.length > 0) {
            const newRows = tracking.flatMap(t =>
              addedWorkouts.map(w => ({
                workout_id: w.id,
                client_id: t.client_id,
                coach_id: t.coach_id,
                start_date: null,
                end_date: null,
                // Cycle workouts use the anchor that was set when the
                // program was originally assigned to this client, so the
                // rotation stays in phase with the rest of the program.
                cycle_anchor_date:
                  w.cycle_length && w.cycle_position
                    ? t.cycle_anchor_date ?? new Date().toISOString().slice(0, 10)
                    : null,
                notes: null,
              }))
            )
            await supabase
              .from('workout_assignments')
              .upsert(newRows, {
                onConflict: 'workout_id,client_id',
                ignoreDuplicates: true,
              })
          }
        } catch {
          // Auto-sync is best-effort; the program save itself already succeeded.
        }
      }

      // Trainees who already had this program receive the new workouts;
      // refresh their assignment caches + Today dashboards so the fan-out
      // shows up without a reload.
      await invalidateWorkouts({ coachId })
      showToast(program?.id ? 'Program updated' : 'Program created')
      onClose()
    } catch {
      showToast('Failed to save program', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Filter + search are both cheap individually, but the picker re-renders
  // on every keystroke in the search box; memoizing on (allWorkouts, members,
  // pickerQuery) skips the work when unrelated state churns (saving toggle,
  // dirty-state recompute, etc.).
  const pickerCandidates = useMemo(() => {
    const memberIds = new Set(members.map(m => m.id))
    const q = pickerQuery.trim().toLowerCase()
    return allWorkouts
      .filter(w => !memberIds.has(w.id))
      .filter(w => {
        if (!q) return true
        return w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)
      })
  }, [allWorkouts, members, pickerQuery])

  return (
    <div>
      <BuilderHeader
        title={program ? 'Edit Program' : 'Create Program'}
        onBack={requestClose}
      />

      <BuilderCard>
        <Field id="pb-name" label="Program Name">
          <Input
            id="pb-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Push / Pull / Legs"
          />
        </Field>

        <Field id="pb-desc" label="Description" optional>
          <Textarea
            id="pb-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Brief description of this program..."
            rows={2}
          />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={e => setIsTemplate(e.target.checked)}
            className="h-4 w-4 text-indigo-fg focus:ring-indigo-500 border-line rounded cursor-pointer"
          />
          <span className="text-sm text-foreground">Save as template</span>
        </label>
      </BuilderCard>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">
          Workouts
        </h3>
        <Button variant="success" size="sm" onClick={() => setShowPicker(true)}>
          <Plus size={14} />
          Add Workout
        </Button>
      </div>

      {members.length === 0 ? (
        <EmptyStateCard message="No workouts in this program yet. Add one to get started." />
      ) : (
        <SortableList
          items={members}
          onReorder={setMembers}
          className="space-y-2"
          renderItem={(m, idx, dragProps) => (
            <div
              className={`bg-surface rounded-xl border border-line p-3 flex items-center gap-3 ${
 dragProps.isDragging ? 'shadow-lg' : ''
 }`}
            >
              <DragHandle {...dragProps} />
              <span className="text-xs font-semibold text-subtle tabular-nums w-6">
                {idx + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{m.name}</p>
                <p className="text-xs text-muted truncate">
                  {m.exercise_count} {m.exercise_count === 1 ? 'exercise' : 'exercises'}
                  {m.cycle_length && m.cycle_position && (
                    <>
                      {' · '}
                      <span className="text-indigo-fg font-medium tabular-nums">
                        Day {m.cycle_position} of {m.cycle_length}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <IconButton
                tone="danger"
                onClick={() => removeMember(m.id)}
                aria-label="Remove from program"
              >
                <X size={16} />
              </IconButton>
            </div>
          )}
        />
      )}

      {members.length > 0 && (
        <AddItemButton label="Add Workout" onClick={() => setShowPicker(true)} />
      )}
      {members.length > 0 && (
        <AddFab ariaLabel="Add workout" onClick={() => setShowPicker(true)} />
      )}

      <BuilderSaveBar
        count={members.length}
        noun="workout"
        isDirty={isDirty}
        saving={saving}
        onCancel={requestClose}
        onSave={handleSave}
        saveLabel="Save Program"
      />

      <Modal
        open={showPicker}
        title="Add a workout"
        onClose={() => {
          setShowPicker(false)
          setPickerQuery('')
        }}
      >
        <div className="space-y-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
            />
            <Input
              value={pickerQuery}
              onChange={e => setPickerQuery(e.target.value)}
              placeholder="Search your workouts..."
              className="pl-9"
              autoFocus
            />
          </div>
          {pickerCandidates.length === 0 ? (
            <p className="text-sm text-subtle italic py-6 text-center">
              {allWorkouts.length === 0
                ? 'You don’t have any workouts yet. Create one in the Workouts tab first.'
                : pickerQuery.trim()
                  ? 'No matches.'
                  : 'Every workout you have is already in this program.'}
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto -mx-2 px-2 space-y-1">
              {pickerCandidates.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => addMember(w)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated transition-colors cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{w.name}</p>
                    <p className="text-xs text-muted truncate">
                      {w.exercise_count}{' '}
                      {w.exercise_count === 1 ? 'exercise' : 'exercises'}
                      {w.cycle_length && w.cycle_position && (
                        <>
                          {' · '}Day {w.cycle_position}/{w.cycle_length}
                        </>
                      )}
                    </p>
                  </div>
                  <Plus size={14} className="text-emerald-fg shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <DiscardDialog
        open={confirmDiscard}
        noun="program"
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
