export type BusinessArea = 'tera' | 'lensr' | 'job'
export type WorkoutMode = 'indoor' | 'outdoor'
export type RevenueSource = 'Tera' | 'Lensr' | 'Internship' | 'Other'
export type RevenueType = 'lead' | 'outreach' | 'booking' | 'invoice' | 'cash'
export type RevenueStatus = 'open' | 'won' | 'lost' | 'follow-up'

export type BusinessProof = {
  area: BusinessArea
  workedOn: string
  movedForward: string
  output: string
  nextStep: string
  blocker: string
}

export type DailyLog = {
  id: string
  date: string
  wakeTime: string
  workoutDone: boolean
  workoutMode: WorkoutMode
  workoutNote: string
  readingDone: boolean
  readingTitle: string
  readingLearned: string
  writingDone: boolean
  writingNote: string
  waterMl: number
  waterGoalMl: number
  foodClean: boolean
  bodyWeightKg: string
  bodyNote: string
  progressPhotoUrl: string
  progressPhotoLocal: string
  dailyReviewDone: boolean
  mood: string
  lessons: string
  felt: string
  cannotQuitReason: string
  paused: boolean
  pauseReason: string
  failed: boolean
  failureNote: string
  businessProofs: Record<BusinessArea, BusinessProof>
  updatedAt: string
  syncStatus: 'local' | 'synced' | 'error'
}

export type RevenueEntry = {
  id: string
  date: string
  source: RevenueSource
  type: RevenueType
  amount: number
  status: RevenueStatus
  followUpDate: string
  notes: string
  updatedAt: string
  syncStatus: 'local' | 'synced' | 'error'
}

export type RestartEvent = {
  id: string
  date: string
  reason: string
  failedTask: string
}

export type MissionData = {
  logs: DailyLog[]
  revenue: RevenueEntry[]
  restarts: RestartEvent[]
}
