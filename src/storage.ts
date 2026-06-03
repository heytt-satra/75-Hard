import { openDB } from 'idb'
import type { DBSchema } from 'idb'
import type { DailyLog, MissionData, RestartEvent, RevenueEntry } from './types'

type SyncStatus = 'local' | 'synced' | 'error'

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
  return sortMissionData({
    logs: logs.map((log) => normalizeDailyLog(log, log.syncStatus ?? 'local')),
    revenue: revenue.map((entry) => normalizeRevenueEntry(entry, entry.syncStatus ?? 'local')),
    restarts: restarts.map((restart) => normalizeRestartEvent(restart, restart.syncStatus ?? 'local')),
  })
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
  await db.put('restarts', {
    ...restart,
    updatedAt: new Date().toISOString(),
    syncStatus: 'local',
  })
}

export const persistMissionData = async (data: MissionData) => {
  const db = await dbPromise
  const transaction = db.transaction(['dailyLogs', 'revenue', 'restarts'], 'readwrite')
  const dailyStore = transaction.objectStore('dailyLogs')
  const revenueStore = transaction.objectStore('revenue')
  const restartStore = transaction.objectStore('restarts')

  dailyStore.clear()
  revenueStore.clear()
  restartStore.clear()

  data.logs.forEach((log) => dailyStore.put(normalizeDailyLog(log, log.syncStatus)))
  data.revenue.forEach((entry) => revenueStore.put(normalizeRevenueEntry(entry, entry.syncStatus)))
  data.restarts.forEach((restart) => restartStore.put(normalizeRestartEvent(restart, restart.syncStatus)))

  await transaction.done
}

export const sortMissionData = (data: MissionData): MissionData => ({
  logs: data.logs.slice().sort((a, b) => b.date.localeCompare(a.date)),
  revenue: data.revenue.slice().sort((a, b) => b.date.localeCompare(a.date)),
  restarts: data.restarts.slice().sort((a, b) => b.date.localeCompare(a.date)),
})

export const mergeMissionData = (local: MissionData, cloud: MissionData): MissionData => {
  return sortMissionData({
    logs: mergeDailyLogs(local.logs, cloud.logs),
    revenue: mergeByKey(local.revenue, cloud.revenue, (entry) => entry.id),
    restarts: mergeByKey(local.restarts, cloud.restarts, (restart) => restart.id),
  })
}

export const hasUnsyncedMissionData = (data: MissionData) => {
  return [...data.logs, ...data.revenue, ...data.restarts].some(
    (item) => item.syncStatus === 'local' || item.syncStatus === 'error',
  )
}

export const markMissionDataSynced = (data: MissionData): MissionData => {
  return sortMissionData({
    logs: data.logs.map((log) => normalizeDailyLog(log, 'synced')),
    revenue: data.revenue.map((entry) => normalizeRevenueEntry(entry, 'synced')),
    restarts: data.restarts.map((restart) => normalizeRestartEvent(restart, 'synced')),
  })
}

export const normalizeDailyLog = (log: DailyLog, syncStatus: SyncStatus = 'local'): DailyLog => ({
  ...log,
  updatedAt: log.updatedAt || new Date().toISOString(),
  syncStatus,
})

export const normalizeRevenueEntry = (
  entry: RevenueEntry,
  syncStatus: SyncStatus = 'local',
): RevenueEntry => ({
  ...entry,
  updatedAt: entry.updatedAt || new Date().toISOString(),
  syncStatus,
})

export const normalizeRestartEvent = (
  restart: RestartEvent,
  syncStatus: SyncStatus = 'local',
): RestartEvent => ({
  ...restart,
  updatedAt: restart.updatedAt || new Date().toISOString(),
  syncStatus,
})

const mergeByKey = <T extends { updatedAt: string; syncStatus: SyncStatus }>(
  localItems: T[],
  cloudItems: T[],
  getKey: (item: T) => string,
) => {
  const merged = new Map<string, T>()

  for (const item of cloudItems) {
    merged.set(getKey(item), item)
  }

  for (const item of localItems) {
    const key = getKey(item)
    const cloudItem = merged.get(key)
    if (!cloudItem || isNewer(item, cloudItem)) {
      merged.set(key, item)
    }
  }

  return [...merged.values()]
}

const mergeDailyLogs = (localLogs: DailyLog[], cloudLogs: DailyLog[]) => {
  const merged = new Map<string, DailyLog>()

  for (const log of cloudLogs) {
    merged.set(log.date, log)
  }

  for (const localLog of localLogs) {
    const cloudLog = merged.get(localLog.date)
    if (!cloudLog) {
      merged.set(localLog.date, localLog)
      continue
    }

    const localHasData = hasMeaningfulDailyLogData(localLog)
    const cloudHasData = hasMeaningfulDailyLogData(cloudLog)
    if (localHasData && !cloudHasData) {
      merged.set(localLog.date, localLog)
    } else if (localHasData === cloudHasData && isNewer(localLog, cloudLog)) {
      merged.set(localLog.date, localLog)
    }
  }

  return [...merged.values()]
}

const hasMeaningfulDailyLogData = (log: DailyLog) => {
  return Boolean(
    log.wakeTime ||
      log.workoutDone ||
      log.workoutNote ||
      log.readingDone ||
      log.readingTitle ||
      log.readingLearned ||
      log.writingDone ||
      log.writingNote ||
      log.waterMl > 0 ||
      log.foodClean ||
      log.bodyWeightKg ||
      log.bodyNote ||
      log.progressPhotoUrl ||
      log.progressPhotoLocal ||
      log.dailyReviewDone ||
      log.mood ||
      log.lessons ||
      log.felt ||
      log.cannotQuitReason ||
      log.paused ||
      log.pauseReason ||
      log.failed ||
      log.failureNote ||
      Object.values(log.businessProofs).some((proof) =>
        Boolean(proof.workedOn || proof.movedForward || proof.output || proof.nextStep || proof.blocker),
      ),
  )
}

const isNewer = (candidate: { updatedAt: string }, current: { updatedAt: string }) => {
  return new Date(candidate.updatedAt).getTime() > new Date(current.updatedAt).getTime()
}
