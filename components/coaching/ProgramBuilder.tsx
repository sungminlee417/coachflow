'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { showToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { UnsavedBadge } from '@/components/ui/UnsavedBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { SortableList, DragHandle } from '@/components/ui/SortableList'
import { useDirtyState } from '@/lib/use-dirty-state'
import { ArrowLeft, Plus, X, Save, Search } from 'lucide-react'
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

      showToast(program?.id ? 'Program updated' : 'Program created')
      onClose()
    } catch {
      showToast('Failed to save program', 'error')
    } finally {
      setSaving(false)
    }
  }

  const memberIds = new Set(members.map(m => m.id))
  const pickerCandidates = allWorkouts
    .filter(w => !memberIds.has(w.id))
    .filter(w => {
      if (!pickerQuery.trim()) return true
      const q = pickerQuery.toLowerCase()
      return w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)
    })

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <IconButton onClick={requestClose} aria-label="Go back">
          <ArrowLeft size={18} />
        </IconButton>
        <h2 className="text-xl font-bold text-slate-900">
          {program ? 'Edit Program' : 'Create Program'}
        </h2>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6 space-y-4">
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
            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
          />
          <span className="text-sm text-slate-700">Save as template</span>
        </label>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Workouts
        </h3>
        <Button variant="success" size="sm" onClick={() => setShowPicker(true)}>
          <Plus size={14} />
          Add Workout
        </Button>
      </div>

      {members.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 border-dashed p-8 text-center">
          <p className="text-slate-400 text-sm">
            No workouts in this program yet. Add one to get started.
          </p>
        </div>
      ) : (
        <SortableList
          items={members}
          onReorder={setMembers}
          className="space-y-2"
          renderItem={(m, idx, dragProps) => (
            <div
              className={`bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3 ${
                dragProps.isDragging ? 'shadow-lg' : ''
              }`}
            >
              <DragHandle {...dragProps} />
              <span className="text-xs font-semibold text-slate-400 tabular-nums w-6">
                {idx + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 truncate">{m.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {m.exercise_count} {m.exercise_count === 1 ? 'exercise' : 'exercises'}
                  {m.cycle_length && m.cycle_position && (
                    <>
                      {' · '}
                      <span className="text-indigo-600 font-medium tabular-nums">
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
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/40 transition-colors cursor-pointer text-sm font-medium"
        >
          <Plus size={16} />
          Add Workout
        </button>
      )}

      <div className="h-24" aria-hidden />

      <div className="sticky bottom-0 -mx-4 sm:-mx-8 mt-6 z-20 px-4 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-6px_20px_-8px_rgba(15,23,42,0.12)] flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span className="tabular-nums">
            <span className="font-semibold text-slate-700">{members.length}</span>{' '}
            {members.length === 1 ? 'workout' : 'workouts'}
          </span>
          <UnsavedBadge visible={isDirty && !saving} />
        </div>
        <div className="sm:hidden">
          <UnsavedBadge visible={isDirty && !saving} />
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={requestClose} disabled={saving} size="sm">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty}
          size="sm"
        >
          {!saving && <Save size={14} />}
          {saving ? 'Saving…' : 'Save Program'}
        </Button>
      </div>

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
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
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
            <p className="text-sm text-slate-400 italic py-6 text-center">
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
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{w.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {w.exercise_count}{' '}
                      {w.exercise_count === 1 ? 'exercise' : 'exercises'}
                      {w.cycle_length && w.cycle_position && (
                        <>
                          {' · '}Day {w.cycle_position}/{w.cycle_length}
                        </>
                      )}
                    </p>
                  </div>
                  <Plus size={14} className="text-emerald-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved edits to this program. They'll be lost if you leave now."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
