'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/use-supabase'
import { Field, Select } from './Input'
import type { Client } from '@/lib/types'

interface AssigneePickerProps {
  coachId: string
  value: string
  onChange: (id: string) => void
  preselectedClientId?: string
  id?: string
  label?: string
}

export function AssigneePicker({
  coachId,
  value,
  onChange,
  preselectedClientId,
  id = 'assignee',
  label = 'Assign to',
}: AssigneePickerProps) {
  const supabase = useSupabase()
  const [clients, setClients] = useState<Client[]>([])
  const [self, setSelf] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [{ data: rels }, { data: profile }] = await Promise.all([
          supabase
            .from('coach_client_relationships')
            .select('client:client_id ( id, full_name, email )')
            .eq('coach_id', coachId)
            .eq('status', 'active')
            .neq('client_id', coachId),
          supabase.from('profiles').select('id, full_name, email').eq('id', coachId).single(),
        ])

        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = rels?.map((item: any) => item.client).filter(Boolean) || []
        setClients(list)
        if (profile) setSelf(profile)
        if (preselectedClientId && !value) onChange(preselectedClientId)
      } catch {
        // swallow - empty UI handles
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId])

  if (loading) {
    return (
      <div className="space-y-1.5">
        <div className="h-4 w-20 bg-line/70 rounded animate-pulse" />
        <div className="h-10 bg-line/70 rounded-lg animate-pulse" />
      </div>
    )
  }

  return (
    <Field id={id} label={label}>
      <Select id={id} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Choose...</option>
        {self && <option value={self.id}>Myself ({self.full_name})</option>}
        {clients.map(client => (
          <option key={client.id} value={client.id}>
            {client.full_name} ({client.email})
          </option>
        ))}
      </Select>
    </Field>
  )
}
