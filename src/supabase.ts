import { createClient } from '@supabase/supabase-js'
import type { DailyLog, RestartEvent, RevenueEntry } from './types'
import type { MissionData } from './types'
import { normalizeDailyLog, normalizeRestartEvent, normalizeRevenueEntry, sortMissionData } from './storage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
const cloudSyncDisabled =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cloud') === 'off'

export const isSupabaseConfigured = !cloudSyncDisabled && Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const syncDailyLog = async (log: DailyLog) => {
  if (!supabase) return { ok: false, message: 'Supabase env keys missing' }

  const syncedLog = normalizeDailyLog(log, 'synced')
  const { error } = await supabase.from('daily_logs').upsert(
    {
      id: syncedLog.id,
      log_date: syncedLog.date,
      payload: syncedLog,
      updated_at: syncedLog.updatedAt,
    },
    { onConflict: 'log_date' },
  )

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Synced' }
}

export const syncRevenueEntry = async (entry: RevenueEntry) => {
  if (!supabase) return { ok: false, message: 'Supabase env keys missing' }

  const syncedEntry = normalizeRevenueEntry(entry, 'synced')
  const { error } = await supabase.from('revenue_entries').upsert({
    id: syncedEntry.id,
    entry_date: syncedEntry.date,
    source: syncedEntry.source,
    type: syncedEntry.type,
    amount: syncedEntry.amount,
    status: syncedEntry.status,
    payload: syncedEntry,
    updated_at: syncedEntry.updatedAt,
  })

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Synced' }
}

export const syncRestartEvent = async (restart: RestartEvent) => {
  if (!supabase) return { ok: false, message: 'Supabase env keys missing' }

  const syncedRestart = normalizeRestartEvent(restart, 'synced')
  const { error } = await supabase.from('restart_events').upsert({
    id: syncedRestart.id,
    restart_date: syncedRestart.date,
    reason: syncedRestart.reason,
    failed_task: syncedRestart.failedTask,
    payload: syncedRestart,
    updated_at: syncedRestart.updatedAt,
  })

  return error ? { ok: false, message: error.message } : { ok: true, message: 'Synced' }
}

export const fetchCloudMissionData = async () => {
  if (!supabase) {
    return { ok: false as const, message: 'Supabase env keys missing', data: null }
  }

  const [dailyLogs, revenueEntries, restartEvents] = await Promise.all([
    supabase.from('daily_logs').select('id, log_date, payload, updated_at'),
    supabase.from('revenue_entries').select('id, entry_date, payload, updated_at'),
    supabase.from('restart_events').select('id, restart_date, reason, failed_task, payload, updated_at'),
  ])

  const error = dailyLogs.error ?? revenueEntries.error ?? restartEvents.error
  if (error) {
    return { ok: false as const, message: error.message, data: null }
  }

  return {
    ok: true as const,
    message: 'Cloud pulled',
    data: sortMissionData({
      logs: (dailyLogs.data ?? []).map((row) => cloudDailyLog(row)),
      revenue: (revenueEntries.data ?? []).map((row) => cloudRevenueEntry(row)),
      restarts: (restartEvents.data ?? []).map((row) => cloudRestartEvent(row)),
    }),
  }
}

export const pushMissionData = async (data: MissionData) => {
  if (!supabase) return { ok: false, message: 'Supabase env keys missing' }

  const results = await Promise.all([
    ...data.logs.map((log) => syncDailyLog(log)),
    ...data.revenue.map((entry) => syncRevenueEntry(entry)),
    ...data.restarts.map((restart) => syncRestartEvent(restart)),
  ])
  const failed = results.find((result) => !result.ok)

  return failed ?? { ok: true, message: 'Cloud synced' }
}

export const subscribeToCloudChanges = (onChange: () => void) => {
  if (!supabase) return () => undefined

  let debounceTimer = 0
  const notify = () => {
    window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(onChange, 500)
  }

  const channel = supabase
    .channel('mission-75-device-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_logs' }, notify)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_entries' }, notify)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restart_events' }, notify)
    .subscribe()

  return () => {
    window.clearTimeout(debounceTimer)
    void supabase.removeChannel(channel)
  }
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

const cloudDailyLog = (row: {
  id: string
  log_date: string
  payload: unknown
  updated_at: string
}) => {
  const payload = row.payload as DailyLog
  return normalizeDailyLog(
    {
      ...payload,
      id: payload.id ?? row.id,
      date: payload.date ?? row.log_date,
      updatedAt: payload.updatedAt ?? row.updated_at,
    },
    'synced',
  )
}

const cloudRevenueEntry = (row: {
  id: string
  entry_date: string
  payload: unknown
  updated_at: string
}) => {
  const payload = row.payload as RevenueEntry
  return normalizeRevenueEntry(
    {
      ...payload,
      id: payload.id ?? row.id,
      date: payload.date ?? row.entry_date,
      updatedAt: payload.updatedAt ?? row.updated_at,
    },
    'synced',
  )
}

const cloudRestartEvent = (row: {
  id: string
  restart_date: string
  reason: string
  failed_task: string
  payload: unknown
  updated_at: string
}) => {
  const payload = row.payload as RestartEvent
  return normalizeRestartEvent(
    {
      ...payload,
      id: payload.id ?? row.id,
      date: payload.date ?? row.restart_date,
      reason: payload.reason ?? row.reason,
      failedTask: payload.failedTask ?? row.failed_task,
      updatedAt: payload.updatedAt ?? row.updated_at,
    },
    'synced',
  )
}
