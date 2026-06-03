export type BusinessArea = 'tera' | 'lensr' | 'job'
export type WorkoutMode = 'indoor' | 'outdoor'
export type RevenueSource = 'Tera' | 'Lensr' | 'Internship' | 'Other'
export type RevenueType = 'lead' | 'outreach' | 'booking' | 'invoice' | 'cash'
export type RevenueStatus = 'open' | 'won' | 'lost' | 'follow-up'
export type DayMode = 'standard' | 'deep-work' | 'travel' | 'low-energy'
export type FocusArea = 'reading' | 'writing' | 'business' | 'fitness' | 'job'
export type BusinessPipelineStage =
  | 'lead'
  | 'outreach'
  | 'proposal'
  | 'booked'
  | 'delivered'
  | 'paid'
  | 'lost'

export type BusinessProof = {
  area: BusinessArea
  workedOn: string
  movedForward: string
  output: string
  nextStep: string
  blocker: string
}

export type FocusSession = {
  id: string
  area: FocusArea
  minutes: number
  note: string
  createdAt: string
}

export type ProofAttachment = {
  id: string
  area: BusinessArea | 'reading' | 'writing' | 'fitness' | 'review'
  label: string
  url: string
  note: string
  createdAt: string
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
  dayMode: DayMode
  lockedAt: string
  energyLevel: number
  mentalClarity: number
  focusSessions: FocusSession[]
  proofAttachments: ProofAttachment[]
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
  updatedAt: string
  syncStatus: 'local' | 'synced' | 'error'
}

export type BusinessPipelineItem = {
  id: string
  area: BusinessArea
  title: string
  stage: BusinessPipelineStage
  value: number
  nextAction: string
  followUpDate: string
  notes: string
  createdAt: string
  updatedAt: string
  syncStatus: 'local' | 'synced' | 'error'
}

export type DeviceStatus = {
  id: string
  name: string
  lastSeenAt: string
  syncState: 'local' | 'syncing' | 'synced' | 'offline' | 'error'
}

export type MissionData = {
  logs: DailyLog[]
  revenue: RevenueEntry[]
  restarts: RestartEvent[]
  pipeline: BusinessPipelineItem[]
}
