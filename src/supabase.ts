import { createClient } from '@supabase/supabase-js'
import type { DailyLog, RestartEvent, RevenueEntry } from './types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const syncDailyLog = async (log: DailyLog) => {
  if (!supabase) return { ok: false, message: 'Supabase env keys missing' }

  const { error } = await supabase.from('daily_logs').upsert(
    {
      id: log.id,
      log_date: log.date,
      payload: log,
      updated_at: log.updatedAt,
    },
    { onConflict: 'log_date' },
  )

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Synced' }
}

export const syncRevenueEntry = async (entry: RevenueEntry) => {
  if (!supabase) return { ok: false, message: 'Supabase env keys missing' }

  const { error } = await supabase.from('revenue_entries').upsert({
    id: entry.id,
    entry_date: entry.date,
    source: entry.source,
    type: entry.type,
    amount: entry.amount,
    status: entry.status,
    payload: entry,
    updated_at: entry.updatedAt,
  })

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Synced' }
}

export const syncRestartEvent = async (restart: RestartEvent) => {
  if (!supabase) return { ok: false, message: 'Supabase env keys missing' }

  const { error } = await supabase.from('restart_events').upsert({
    id: restart.id,
    restart_date: restart.date,
    reason: restart.reason,
    failed_task: restart.failedTask,
    payload: restart,
    updated_at: new Date().toISOString(),
  })

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Synced' }
}

export const uploadProgressPhoto = async (date: string, file: File) => {
  if (!supabase) return { ok: false, url: '', message: 'Supabase env keys missing' }

  const compressed = await compressImage(file)
  const path = `${date}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('progress-photos')
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: true })

  if (error) return { ok: false, url: '', message: error.message }

  const { data } = supabase.storage.from('progress-photos').getPublicUrl(path)
  return { ok: true, url: data.publicUrl, message: 'Photo uploaded' }
}

const compressImage = async (file: File) => {
  const bitmap = await createImageBitmap(file)
  const maxSize = 1280
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return file
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.78)
  })
}
