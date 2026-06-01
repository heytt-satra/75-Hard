import { openDB } from 'idb'
import type { DBSchema } from 'idb'
import type { DailyLog, MissionData, RestartEvent, RevenueEntry } from './types'

type MissionDb = DBSchema & {
  dailyLogs: {
    key: string
    value: DailyLog
  }
  revenue: {
    key: string
    value: RevenueEntry
  }
  restarts: {
    key: string
    value: RestartEvent
  }
}

const dbPromise = openDB<MissionDb>('mission-75-heytt-os', 1, {
  upgrade(db) {
    db.createObjectStore('dailyLogs', { keyPath: 'date' })
    db.createObjectStore('revenue', { keyPath: 'id' })
    db.createObjectStore('restarts', { keyPath: 'id' })
  },
})

export const loadMissionData = async (): Promise<MissionData> => {
  const db = await dbPromise
  const [logs, revenue, restarts] = await Promise.all([
    db.getAll('dailyLogs'),
    db.getAll('revenue'),
    db.getAll('restarts'),
  ])
  return {
    logs: logs.sort((a, b) => b.date.localeCompare(a.date)),
    revenue: revenue.sort((a, b) => b.date.localeCompare(a.date)),
    restarts: restarts.sort((a, b) => b.date.localeCompare(a.date)),
  }
}

export const saveDailyLog = async (log: DailyLog) => {
  const db = await dbPromise
  await db.put('dailyLogs', {
    ...log,
    updatedAt: new Date().toISOString(),
    syncStatus: 'local',
  })
}

export const saveRevenueEntry = async (entry: RevenueEntry) => {
  const db = await dbPromise
  await db.put('revenue', {
    ...entry,
    updatedAt: new Date().toISOString(),
    syncStatus: 'local',
  })
}

export const saveRestart = async (restart: RestartEvent) => {
  const db = await dbPromise
  await db.put('restarts', restart)
}
