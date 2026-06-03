import { openDB } from 'idb'
import type { DBSchema } from 'idb'
import { emptyProof } from './mission'
import type { BusinessArea, BusinessPipelineItem, DailyLog, MissionData, RestartEvent, RevenueEntry } from './types'

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
  pipeline: {
    key: string
    value: BusinessPipelineItem
  }
}

const dbPromise = openDB<MissionDb>('mission-75-heytt-os', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('dailyLogs')) db.createObjectStore('dailyLogs', { keyPath: 'date' })
    if (!db.objectStoreNames.contains('revenue')) db.createObjectStore('revenue', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('restarts')) db.createObjectStore('restarts', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('pipeline')) db.createObjectStore('pipeline', { keyPath: 'id' })
  },
})

export const loadMissionData = async (): Promise<MissionData> => {
  const db = await dbPromise
  const [logs, revenue, restarts, pipeline] = await Promise.all([
    db.getAll('dailyLogs'),
    db.getAll('revenue'),
    db.getAll('restarts'),
    db.getAll('pipeline'),
  ])
  return sortMissionData({
    logs: logs.map((log) => normalizeDailyLog(log, log.syncStatus ?? 'local')),
    revenue: revenue.map((entry) => normalizeRevenueEntry(entry, entry.syncStatus ?? 'local')),
    restarts: restarts.map((restart) => normalizeRestartEvent(restart, restart.syncStatus ?? 'local')),
    pipeline: pipeline.map((item) => normalizePipelineItem(item, item.syncStatus ?? 'local')),
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

export const savePipelineItem = async (item: BusinessPipelineItem) => {
  const db = await dbPromise
  await db.put('pipeline', {
    ...item,
    updatedAt: new Date().toISOString(),
    syncStatus: 'local',
  })
}

export const persistMissionData = async (data: MissionData) => {
  const db = await dbPromise
  const transaction = db.transaction(['dailyLogs', 'revenue', 'restarts', 'pipeline'], 'readwrite')
  const dailyStore = transaction.objectStore('dailyLogs')
  const revenueStore = transaction.objectStore('revenue')
  const restartStore = transaction.objectStore('restarts')
  const pipelineStore = transaction.objectStore('pipeline')

  dailyStore.clear()
  revenueStore.clear()
  restartStore.clear()
  pipelineStore.clear()

  data.logs.forEach((log) => dailyStore.put(normalizeDailyLog(log, log.syncStatus)))
  data.revenue.forEach((entry) => revenueStore.put(normalizeRevenueEntry(entry, entry.syncStatus)))
  data.restarts.forEach((restart) => restartStore.put(normalizeRestartEvent(restart, restart.syncStatus)))
  data.pipeline.forEach((item) => pipelineStore.put(normalizePipelineItem(item, item.syncStatus)))

  await transaction.done
}

export const sortMissionData = (data: MissionData): MissionData => ({
  logs: data.logs.slice().sort((a, b) => b.date.localeCompare(a.date)),
  revenue: data.revenue.slice().sort((a, b) => b.date.localeCompare(a.date)),
  restarts: data.restarts.slice().sort((a, b) => b.date.localeCompare(a.date)),
  pipeline: data.pipeline.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
})

export const mergeMissionData = (local: MissionData, cloud: MissionData): MissionData => {
  return sortMissionData({
    logs: mergeDailyLogs(local.logs, cloud.logs),
    revenue: mergeByKey(local.revenue, cloud.revenue, (entry) => entry.id),
    restarts: mergeByKey(local.restarts, cloud.restarts, (restart) => restart.id),
    pipeline: mergeByKey(local.pipeline, cloud.pipeline, (item) => item.id),
  })
}

export const hasUnsyncedMissionData = (data: MissionData) => {
  return [...data.logs, ...data.revenue, ...data.restarts, ...data.pipeline].some(
    (item) => item.syncStatus === 'local' || item.syncStatus === 'error',
  )
}

export const markMissionDataSynced = (data: MissionData): MissionData => {
  return sortMissionData({
    logs: data.logs.map((log) => normalizeDailyLog(log, 'synced')),
    revenue: data.revenue.map((entry) => normalizeRevenueEntry(entry, 'synced')),
    restarts: data.restarts.map((restart) => normalizeRestartEvent(restart, 'synced')),
    pipeline: data.pipeline.map((item) => normalizePipelineItem(item, 'synced')),
  })
}

export const normalizeDailyLog = (log: DailyLog, syncStatus: SyncStatus = 'local'): DailyLog => {
  const businessProofs = log.businessProofs ?? {
    tera: emptyProof('tera'),
    lensr: emptyProof('lensr'),
    job: emptyProof('job'),
  }

  return {
    ...log,
    businessProofs: (['tera', 'lensr', 'job'] as BusinessArea[]).reduce(
      (proofs, area) => ({ ...proofs, [area]: businessProofs[area] ?? emptyProof(area) }),
      {} as DailyLog['businessProofs'],
    ),
    dayMode: log.dayMode ?? 'standard',
    lockedAt: log.lockedAt ?? '',
    energyLevel: log.energyLevel ?? 5,
    mentalClarity: log.mentalClarity ?? 5,
    focusSessions: log.focusSessions ?? [],
    proofAttachments: log.proofAttachments ?? [],
    updatedAt: log.updatedAt || new Date().toISOString(),
    syncStatus,
  }
}

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

export const normalizePipelineItem = (
  item: BusinessPipelineItem,
  syncStatus: SyncStatus = 'local',
): BusinessPipelineItem => ({
  ...item,
  value: Number(item.value || 0),
  createdAt: item.createdAt || new Date().toISOString(),
  updatedAt: item.updatedAt || new Date().toISOString(),
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
      log.lockedAt ||
      log.energyLevel !== 5 ||
      log.mentalClarity !== 5 ||
      log.focusSessions.length > 0 ||
      log.proofAttachments.length > 0 ||
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
