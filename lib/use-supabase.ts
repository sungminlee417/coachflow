'use client'

import { useMemo } from 'react'
import { createClient } from './supabase/client'

export function useSupabase() {
  return useMemo(() => createClient(), [])
}
