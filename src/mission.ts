import type {
  BusinessArea,
  BusinessProof,
  DailyLog,
  MissionData,
  RestartEvent,
  RevenueEntry,
} from './types'

export const START_DATE = '2026-06-02'
export const TOTAL_DAYS = 75
export const DEFAULT_WATER_GOAL = 3000
export const MONTHLY_REVENUE_GOAL = 200000

export const disciplineMessages = [
  'Sun will rise and I will do it again.',
  'Potential is nothing until it has proof.',
  'Calm mind. Extreme execution.',
  'Do the work before the mood arrives.',
  'You are not negotiating with the old version today.',
  'Proof over promise. Movement over fantasy.',
]

export const dailyQuotes = [
  {
    quote: 'Waste no more time arguing what a good man should be. Be one.',
    author: 'Marcus Aurelius',
  },
  {
    quote: 'We suffer more often in imagination than in reality.',
    author: 'Seneca',
  },
  {
    quote: 'First say to yourself what you would be; and then do what you have to do.',
    author: 'Epictetus',
  },
  {
    quote: 'Great things come from hard work and perseverance. No excuses.',
    author: 'Kobe Bryant',
  },
  {
    quote: 'You are in danger of living a life so comfortable and soft that you will die without ever realizing your true potential.',
    author: 'David Goggins',
  },
  {
    quote: 'The direction you are heading in matters more than how fast you are moving.',
    author: 'James Clear',
  },
  {
    quote: 'Play long-term games with long-term people.',
    author: 'Naval Ravikant',
  },
  {
    quote: 'Focus is about saying no.',
    author: 'Steve Jobs',
  },
  {
    quote: 'You do not need more time. You need fewer distractions.',
    author: 'Alex Hormozi',
  },
  {
    quote: 'Sun will rise and I will do it again.',
    author: 'Heytt Satra',
  },
]

const localDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const emptyProof = (area: BusinessArea): BusinessProof => ({
  area,
  workedOn: '',
  movedForward: '',
  output: '',
  nextStep: '',
  blocker: '',
})

export const todayKey = () => localDateKey(new Date())

export const missionDateKey = () => {
  const today = todayKey()
  return today < START_DATE ? START_DATE : today
}

export const createDailyLog = (date = todayKey()): DailyLog => ({
  id: crypto.randomUUID(),
  date,
  wakeTime: '',
  workoutDone: false,
  workoutMode: 'indoor',
  workoutNote: '',
  readingDone: false,
  readingTitle: '',
  readingLearned: '',
  writingDone: false,
  writingNote: '',
  waterMl: 0,
  waterGoalMl: DEFAULT_WATER_GOAL,
  foodClean: false,
  bodyWeightKg: '',
  bodyNote: '',
  progressPhotoUrl: '',
  progressPhotoLocal: '',
  dailyReviewDone: false,
  mood: '',
  lessons: '',
  felt: '',
  cannotQuitReason: '',
  paused: false,
  pauseReason: '',
  failed: false,
  failureNote: '',
  businessProofs: {
    tera: emptyProof('tera'),
    lensr: emptyProof('lensr'),
    job: emptyProof('job'),
  },
  updatedAt: new Date().toISOString(),
  syncStatus: 'local',
})

export const coreTaskStatus = (log: DailyLog) => {
  const proofComplete = (area: BusinessArea) => {
    const proof = log.businessProofs[area]
    return Boolean(proof.workedOn && proof.movedForward && proof.output && proof.nextStep)
  }

  return [
    {
      id: 'wake',
      label: 'Wake by 6:30 AM',
      done: Boolean(log.wakeTime && log.wakeTime <= '06:30'),
    },
    {
      id: 'workout',
      label: 'One workout complete',
      done: log.workoutDone && Boolean(log.workoutNote),
    },
    {
      id: 'reading',
      label: 'Read 30 minutes and capture learning',
      done: log.readingDone && Boolean(log.readingTitle && log.readingLearned),
    },
    {
      id: 'water',
      label: 'Hit water goal',
      done: log.waterMl >= log.waterGoalMl,
    },
    {
      id: 'food',
      label: 'Homemade or clean outside food',
      done: log.foodClean,
    },
    {
      id: 'writing',
      label: 'Focused writing session',
      done: log.writingDone && Boolean(log.writingNote),
    },
    {
      id: 'tera',
      label: 'Tera proof of work',
      done: proofComplete('tera'),
    },
    {
      id: 'lensr',
      label: 'Lensr proof of work',
      done: proofComplete('lensr'),
    },
    {
      id: 'job',
      label: 'Internship/job proof of work',
      done: proofComplete('job'),
    },
    {
      id: 'review',
      label: 'Daily review complete',
      done:
        log.dailyReviewDone &&
        Boolean(log.lessons && log.felt && log.cannotQuitReason),
    },
  ]
}

export const completionPercent = (log: DailyLog) => {
  const tasks = coreTaskStatus(log)
  const done = tasks.filter((task) => task.done).length
  return Math.round((done / tasks.length) * 100)
}

export const dayNumberFor = (date: string, restarts: RestartEvent[]) => {
  const activeStart = restarts.length
    ? restarts
        .map((restart) => restart.date)
        .sort()
        .at(-1)!
    : START_DATE
  const diff = Date.parse(`${date}T00:00:00`) - Date.parse(`${activeStart}T00:00:00`)
  return Math.max(1, Math.floor(diff / 86_400_000) + 1)
}

export const activeStreak = (data: MissionData) => {
  return data.logs
    .filter((log) => !log.paused && completionPercent(log) === 100)
    .sort((a, b) => a.date.localeCompare(b.date)).length
}

export const quoteForDate = (date: string) => {
  const daySeed = Math.abs(Math.floor(Date.parse(`${date}T00:00:00`) / 86_400_000))
  return dailyQuotes[daySeed % dailyQuotes.length]
}

export const taskCountsForLog = (log: DailyLog) => {
  const tasks = coreTaskStatus(log)
  const completed = tasks.filter((task) => task.done)
  const open = tasks.filter((task) => !task.done)
  return {
    completed,
    open,
    completedCount: completed.length,
    openCount: open.length,
    totalCount: tasks.length,
  }
}

const textFromLog = (log: DailyLog, revenue: RevenueEntry[]) => {
  return [
    log.date,
    log.wakeTime,
    log.workoutMode,
    log.workoutNote,
    log.readingTitle,
    log.readingLearned,
    log.writingNote,
    log.bodyWeightKg,
    log.bodyNote,
    log.lessons,
    log.felt,
    log.cannotQuitReason,
    log.pauseReason,
    log.failureNote,
    ...Object.values(log.businessProofs).flatMap((proof) => [
      proof.workedOn,
      proof.movedForward,
      proof.output,
      proof.nextStep,
      proof.blocker,
    ]),
    ...revenue.flatMap((entry) => [
      entry.source,
      entry.type,
      entry.status,
      entry.amount,
      entry.followUpDate,
      entry.notes,
    ]),
  ]
    .join(' ')
    .toLowerCase()
}

export type HistoryFilters = {
  date?: string
  status: 'all' | 'complete' | 'incomplete' | 'paused' | 'failed'
  query: string
}

export const historyEntries = (data: MissionData, filters: HistoryFilters) => {
  const query = filters.query.trim().toLowerCase()

  return data.logs
    .map((log) => {
      const revenue = data.revenue.filter((entry) => entry.date === log.date)
      const restarts = data.restarts.filter((restart) => restart.date === log.date)
      const percent = completionPercent(log)
      return {
        log,
        revenue,
        restarts,
        percent,
        counts: taskCountsForLog(log),
      }
    })
    .filter((entry) => {
      if (filters.date && entry.log.date !== filters.date) return false
      if (filters.status === 'complete' && entry.percent !== 100) return false
      if (filters.status === 'incomplete' && entry.percent === 100) return false
      if (filters.status === 'paused' && !entry.log.paused) return false
      if (filters.status === 'failed' && !entry.log.failed && entry.restarts.length === 0) return false
      if (query && !textFromLog(entry.log, entry.revenue).includes(query)) return false
      return true
    })
    .sort((a, b) => b.log.date.localeCompare(a.log.date))
}

export const bestStreak = (data: MissionData) => {
  const completeDates = new Set(
    data.logs
      .filter((log) => !log.paused && completionPercent(log) === 100)
      .map((log) => log.date),
  )
  const dates = [...completeDates].sort()
  let best = 0
  let current = 0
  let previous = ''

  for (const date of dates) {
    const expectedPrevious = new Date(`${date}T00:00:00`)
    expectedPrevious.setDate(expectedPrevious.getDate() - 1)
    const expectedPreviousKey = localDateKey(expectedPrevious)
    current = previous && previous === expectedPreviousKey ? current + 1 : 1
    best = Math.max(best, current)
    previous = date
  }

  return best
}

const numericWeights = (logs: DailyLog[]) => {
  return logs
    .map((log) => ({
      date: log.date,
      value: Number.parseFloat(String(log.bodyWeightKg).replace(/[^\d.]/g, '')),
    }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export const improvementMetrics = (data: MissionData) => {
  const logs = data.logs.slice().sort((a, b) => a.date.localeCompare(b.date))
  const completeLogs = logs.filter((log) => completionPercent(log) === 100)
  const businessDays = logs.filter((log) =>
    (['tera', 'lensr', 'job'] as BusinessArea[]).every((area) => {
      const proof = log.businessProofs[area]
      return Boolean(proof.workedOn && proof.movedForward && proof.output && proof.nextStep)
    }),
  )
  const weights = numericWeights(logs)
  const firstWeight = weights.at(0)?.value
  const lastWeight = weights.at(-1)?.value
  const totalRevenueWon = data.revenue
    .filter((entry) => entry.status === 'won')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)

  const completionAverage = logs.length
    ? Math.round(logs.reduce((sum, log) => sum + completionPercent(log), 0) / logs.length)
    : 0

  return {
    completionAverage,
    cleanDays: completeLogs.length,
    bestStreak: bestStreak(data),
    workouts: logs.filter((log) => log.workoutDone).length,
    readingDays: logs.filter((log) => log.readingDone).length,
    writingDays: logs.filter((log) => log.writingDone).length,
    businessProofDays: businessDays.length,
    totalRevenueWon,
    bodyWeightChange:
      firstWeight !== undefined && lastWeight !== undefined
        ? Number((lastWeight - firstWeight).toFixed(1))
        : null,
    completionChart: logs.map((log) => ({
      date: log.date,
      completion: completionPercent(log),
    })),
    waterChart: logs.map((log) => ({
      date: log.date,
      water: log.waterMl,
      goal: log.waterGoalMl,
    })),
    weightChart: weights,
  }
}
