import type { BusinessArea, BusinessProof, DailyLog, MissionData, RestartEvent } from './types'

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
