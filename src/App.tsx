import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  DEFAULT_WATER_GOAL,
  MONTHLY_REVENUE_GOAL,
  TOTAL_DAYS,
  activeStreak,
  completionPercent,
  coreTaskStatus,
  createDailyLog,
  dayNumberFor,
  disciplineMessages,
  missionDateKey,
  todayKey,
} from './mission'
import {
  loadMissionData,
  saveDailyLog,
  saveRestart,
  saveRevenueEntry,
} from './storage'
import {
  isSupabaseConfigured,
  syncDailyLog,
  syncRestartEvent,
  syncRevenueEntry,
  uploadProgressPhoto,
} from './supabase'
import type {
  BusinessArea,
  BusinessProof,
  DailyLog,
  MissionData,
  RestartEvent,
  RevenueEntry,
  RevenueSource,
  RevenueStatus,
  RevenueType,
} from './types'

type View = 'today' | 'body' | 'mind' | 'business' | 'money' | 'review'

const initialData: MissionData = { logs: [], revenue: [], restarts: [] }

const views: Array<{ id: View; label: string; signal: string }> = [
  { id: 'today', label: 'Today', signal: 'Core' },
  { id: 'body', label: 'Body', signal: 'Workout' },
  { id: 'mind', label: 'Mind', signal: 'Read + write' },
  { id: 'business', label: 'Business', signal: 'Proof' },
  { id: 'money', label: 'Money', signal: 'INR 2L' },
  { id: 'review', label: 'Review', signal: 'Close day' },
]

const taskView: Record<string, View> = {
  wake: 'today',
  water: 'today',
  food: 'today',
  workout: 'body',
  reading: 'mind',
  writing: 'mind',
  tera: 'business',
  lensr: 'business',
  job: 'business',
  review: 'review',
}

const areaLabels: Record<BusinessArea, string> = {
  tera: 'Tera Industries',
  lensr: 'Lensr',
  job: 'Internship / job hunt',
}

const areaDescriptions: Record<BusinessArea, string> = {
  tera: 'Clients, positioning, offers, proposals, delivery assets.',
  lensr: 'Production bookings, shoot pipeline, outreach, partner moves.',
  job: 'Applications, referrals, interview prep, cold email, follow-up.',
}

function App() {
  const [data, setData] = useState<MissionData>(initialData)
  const [selectedDate, setSelectedDate] = useState(missionDateKey())
  const [saving, setSaving] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [activeView, setActiveView] = useState<View>('today')

  const currentLog = useMemo(() => {
    return data.logs.find((log) => log.date === selectedDate) ?? createDailyLog(selectedDate)
  }, [data.logs, selectedDate])

  const taskStatus = coreTaskStatus(currentLog)
  const percent = completionPercent(currentLog)
  const dayNumber = dayNumberFor(selectedDate, data.restarts)
  const currentMonthRevenue = data.revenue
    .filter((entry) => entry.date.slice(0, 7) === selectedDate.slice(0, 7) && entry.status === 'won')
    .reduce((total, entry) => total + Number(entry.amount || 0), 0)
  const revenuePercent = Math.min(100, Math.round((currentMonthRevenue / MONTHLY_REVENUE_GOAL) * 100))
  const waterPercent = Math.min(100, Math.round((currentLog.waterMl / currentLog.waterGoalMl) * 100))
  const message = disciplineMessages[dayNumber % disciplineMessages.length]
  const streak = activeStreak(data)
  const openTasks = taskStatus.filter((task) => !task.done)

  useEffect(() => {
    loadMissionData().then((stored) => {
      if (stored.logs.length === 0) {
        const firstLog = createDailyLog(missionDateKey())
        setData({ ...stored, logs: [firstLog] })
        saveDailyLog(firstLog)
        return
      }
      setData(stored)
    })
  }, [])

  const updateLog = async (patch: Partial<DailyLog>) => {
    const nextLog: DailyLog = {
      ...currentLog,
      ...patch,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    }
    setData((prev) => ({
      ...prev,
      logs: [nextLog, ...prev.logs.filter((log) => log.date !== nextLog.date)].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    }))
    await saveDailyLog(nextLog)
  }

  const updateBusinessProof = async (area: BusinessArea, patch: Partial<BusinessProof>) => {
    await updateLog({
      businessProofs: {
        ...currentLog.businessProofs,
        [area]: {
          ...currentLog.businessProofs[area],
          ...patch,
        },
      },
    })
  }

  const addWater = (ml: number) => updateLog({ waterMl: currentLog.waterMl + ml })

  const addRevenue = async (entry: RevenueEntry) => {
    setData((prev) => ({
      ...prev,
      revenue: [entry, ...prev.revenue].sort((a, b) => b.date.localeCompare(a.date)),
    }))
    await saveRevenueEntry(entry)
  }

  const markRestart = async () => {
    const failedTask =
      taskStatus.find((task) => !task.done)?.label ?? 'Manual restart after failed standard'
    const restart: RestartEvent = {
      id: crypto.randomUUID(),
      date: selectedDate,
      reason: currentLog.failureNote || 'Core non-negotiable missed',
      failedTask,
    }
    setData((prev) => ({ ...prev, restarts: [restart, ...prev.restarts] }))
    await saveRestart(restart)
    await syncRestartEvent(restart)
    await updateLog({ failed: true })
  }

  const syncNow = async () => {
    setSaving(true)
    const logResult = await syncDailyLog(currentLog)
    const revenueResults = await Promise.all(data.revenue.map((entry) => syncRevenueEntry(entry)))
    const restartResults = await Promise.all(data.restarts.map((restart) => syncRestartEvent(restart)))
    const failedRevenue = revenueResults.find((result) => !result.ok)
    const failedRestart = restartResults.find((result) => !result.ok)
    setSyncMessage(failedRevenue?.message ?? failedRestart?.message ?? logResult.message)
    setSaving(false)
  }

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return
    const preview = URL.createObjectURL(file)
    await updateLog({ progressPhotoLocal: preview })
    const result = await uploadProgressPhoto(currentLog.date, file)
    if (result.ok) {
      await updateLog({ progressPhotoUrl: result.url })
    }
    setSyncMessage(result.message)
  }

  const exportJson = () => {
    downloadFile(
      `mission-75-export-${todayKey()}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    )
  }

  const exportCsv = () => {
    const rows = [
      [
        'date',
        'completion',
        'water_ml',
        'workout',
        'reading',
        'writing',
        'tera',
        'lensr',
        'job',
        'paused',
        'failed',
      ],
      ...data.logs.map((log) => [
        log.date,
        completionPercent(log),
        log.waterMl,
        log.workoutNote,
        log.readingTitle,
        log.writingNote,
        log.businessProofs.tera.output,
        log.businessProofs.lensr.output,
        log.businessProofs.job.output,
        log.paused,
        log.failed,
      ]),
    ]
    downloadFile(
      `mission-75-daily-${todayKey()}.csv`,
      rows.map((row) => row.map(csvCell).join(',')).join('\n'),
      'text/csv',
    )
  }

  return (
    <main className="app-shell">
      <section className={percent === 100 ? 'cockpit complete' : 'cockpit'}>
        <div className="cockpit-bg" />
        <div className="cockpit-copy">
          <p className="eyebrow">Mission 75 / Heytt OS</p>
          <h1>Operate the day.</h1>
          <p className="mission-line">{message}</p>
          <div className="hero-controls">
            <label className="date-control">
              <span>Active date</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
            <button className="primary-action" onClick={syncNow} disabled={saving}>
              {saving ? 'Syncing' : 'Sync Supabase'}
            </button>
          </div>
          {syncMessage && <p className="sync-message">{syncMessage}</p>}
        </div>

        <div className="mission-gauge">
          <div className="gauge-ring" style={{ '--percent': `${percent}%` } as React.CSSProperties}>
            <div>
              <strong>{percent}%</strong>
              <span>core</span>
            </div>
          </div>
          <div className="day-readout">
            <span>Day</span>
            <strong>{Math.min(dayNumber, TOTAL_DAYS)}</strong>
            <span>of {TOTAL_DAYS}</span>
          </div>
        </div>
      </section>

      <section className="live-strip">
        <Signal label="Open tasks" value={openTasks.length.toString()} />
        <Signal label="Clean streak" value={streak.toString()} />
        <Signal label="Water" value={`${waterPercent}%`} />
        <Signal label="Revenue" value={`${revenuePercent}%`} />
        <Signal label="Supabase" value={isSupabaseConfigured ? 'Ready' : 'Local'} />
      </section>

      <nav className="mission-nav" aria-label="Mission sections">
        {views.map((view) => (
          <button
            key={view.id}
            className={activeView === view.id ? 'nav-card active' : 'nav-card'}
            onClick={() => setActiveView(view.id)}
          >
            <span>{view.signal}</span>
            {view.label}
          </button>
        ))}
      </nav>

      <section className="task-command">
        {taskStatus.map((task) => (
          <button
            key={task.id}
            className={task.done ? 'task-tile done' : 'task-tile'}
            onClick={() => setActiveView(taskView[task.id] ?? 'today')}
          >
            <span>{task.done ? 'Done' : 'Open'}</span>
            <strong>{task.label}</strong>
          </button>
        ))}
      </section>

      <section className="workspace">
        {activeView === 'today' && (
          <div className="view-grid">
            <Panel title="Start The Day" code="CORE">
              <div className="field-row two">
                <label>
                  Wake time
                  <input
                    type="time"
                    value={currentLog.wakeTime}
                    onChange={(event) => updateLog({ wakeTime: event.target.value })}
                  />
                </label>
                <label>
                  Body weight
                  <input
                    value={currentLog.bodyWeightKg}
                    onChange={(event) => updateLog({ bodyWeightKg: event.target.value })}
                    placeholder="85 kg"
                  />
                </label>
              </div>
              <div className="toggle-row">
                <Toggle
                  active={currentLog.foodClean}
                  label="Food stayed clean"
                  onClick={() => updateLog({ foodClean: !currentLog.foodClean })}
                />
                <Toggle
                  active={currentLog.paused}
                  label="Travel/sick pause"
                  onClick={() => updateLog({ paused: !currentLog.paused })}
                />
              </div>
              {currentLog.paused && (
                <TextArea
                  label="Pause reason"
                  value={currentLog.pauseReason}
                  onChange={(pauseReason) => updateLog({ pauseReason })}
                />
              )}
            </Panel>

            <Panel title="Hydration Control" code="H2O">
              <div className="meter-block">
                <div>
                  <span>Water logged</span>
                  <strong>{currentLog.waterMl} ml</strong>
                  <p>Goal: {currentLog.waterGoalMl} ml</p>
                </div>
                <div className="mini-meter">
                  <span style={{ width: `${waterPercent}%` }} />
                </div>
              </div>
              <div className="quick-actions">
                <button onClick={() => addWater(750)}>Add 750 ml</button>
                <button onClick={() => addWater(1000)}>Add 1 L</button>
                <button onClick={() => updateLog({ waterMl: 0 })}>Reset</button>
              </div>
              <label>
                Water goal
                <input
                  type="number"
                  value={currentLog.waterGoalMl}
                  onChange={(event) =>
                    updateLog({ waterGoalMl: Number(event.target.value || DEFAULT_WATER_GOAL) })
                  }
                />
              </label>
            </Panel>
          </div>
        )}

        {activeView === 'body' && (
          <div className="view-grid">
            <Panel title="Workout Protocol" code="BODY">
              <div className="segmented">
                <button
                  className={currentLog.workoutMode === 'indoor' ? 'selected' : ''}
                  onClick={() => updateLog({ workoutMode: 'indoor' })}
                >
                  Indoor protocol
                </button>
                <button
                  className={currentLog.workoutMode === 'outdoor' ? 'selected' : ''}
                  onClick={() => updateLog({ workoutMode: 'outdoor' })}
                >
                  Outdoor protocol
                </button>
              </div>
              <div className="protocol-card">
                {currentLog.workoutMode === 'indoor'
                  ? '15 pushups / 50 squats / 50 crunches / 2 min skipping / 1 min plank'
                  : '3-5 km walk or run. No overthinking. Move.'}
              </div>
              <Toggle
                active={currentLog.workoutDone}
                label="Workout complete"
                onClick={() => updateLog({ workoutDone: !currentLog.workoutDone })}
              />
              <TextArea
                label="Workout proof"
                value={currentLog.workoutNote}
                onChange={(workoutNote) => updateLog({ workoutNote })}
              />
            </Panel>

            <Panel title="Progress Capture" code="PHOTO">
              <label className="upload-tile">
                Upload progress photo
                <input type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} />
              </label>
              {(currentLog.progressPhotoLocal || currentLog.progressPhotoUrl) ? (
                <img
                  className="photo-preview"
                  src={currentLog.progressPhotoLocal || currentLog.progressPhotoUrl}
                  alt="Progress"
                />
              ) : (
                <div className="empty-state">No photo captured for this day.</div>
              )}
              <TextArea
                label="Body note"
                value={currentLog.bodyNote}
                onChange={(bodyNote) => updateLog({ bodyNote })}
              />
            </Panel>
          </div>
        )}

        {activeView === 'mind' && (
          <div className="view-grid">
            <Panel title="Reading Block" code="READ">
              <Toggle
                active={currentLog.readingDone}
                label="30 minutes reading complete"
                onClick={() => updateLog({ readingDone: !currentLog.readingDone })}
              />
              <label>
                What did you read?
                <input
                  value={currentLog.readingTitle}
                  onChange={(event) => updateLog({ readingTitle: event.target.value })}
                  placeholder="Book, chapter, idea"
                />
              </label>
              <TextArea
                label="What did you learn?"
                value={currentLog.readingLearned}
                onChange={(readingLearned) => updateLog({ readingLearned })}
              />
            </Panel>

            <Panel title="Writing Block" code="WRITE">
              <Toggle
                active={currentLog.writingDone}
                label="Focused writing session complete"
                onClick={() => updateLog({ writingDone: !currentLog.writingDone })}
              />
              <TextArea
                label="What did you write?"
                value={currentLog.writingNote}
                onChange={(writingNote) => updateLog({ writingNote })}
              />
            </Panel>
          </div>
        )}

        {activeView === 'business' && (
          <div className="business-stage">
            <div className="section-heading">
              <span>OPS</span>
              <div>
                <h2>Business command</h2>
                <p>No hour counting. Complete all three proof blocks.</p>
              </div>
            </div>
            <div className="business-grid">
              {(['tera', 'lensr', 'job'] as BusinessArea[]).map((area) => (
                <BusinessProofCard
                  key={area}
                  area={area}
                  proof={currentLog.businessProofs[area]}
                  onChange={(patch) => updateBusinessProof(area, patch)}
                />
              ))}
            </div>
          </div>
        )}

        {activeView === 'money' && (
          <div className="view-grid">
            <Panel title="Revenue Ops" code="CASH">
              <RevenueForm onAdd={addRevenue} selectedDate={selectedDate} />
              <div className="meter-block">
                <div>
                  <span>Monthly cash received</span>
                  <strong>INR {formatMoney(currentMonthRevenue)}</strong>
                  <p>Target: INR {formatMoney(MONTHLY_REVENUE_GOAL)}</p>
                </div>
                <div className="mini-meter">
                  <span style={{ width: `${revenuePercent}%` }} />
                </div>
              </div>
            </Panel>

            <Panel title="Mission Analytics" code="DATA">
              <div className="charts">
                <div className="chart-box">
                  <h3>Last logs</h3>
                  <ResponsiveContainer width="100%" height={190}>
                    <BarChart data={data.logs.slice(0, 10).reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3240" />
                      <XAxis dataKey="date" tick={{ fill: '#aeb6c2', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#aeb6c2', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#10151f', border: '1px solid #343b4b' }} />
                      <Bar dataKey={(log) => completionPercent(log)} fill="#f4c95d" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-box">
                  <h3>Revenue source</h3>
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie
                        data={revenueBySource(data.revenue)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={4}
                      >
                        {revenueBySource(data.revenue).map((entry, index) => (
                          <Cell key={entry.name} fill={['#f4c95d', '#61d394', '#ff6b6b', '#8ea7ff'][index]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#10151f', border: '1px solid #343b4b' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {activeView === 'review' && (
          <div className="view-grid">
            <Panel title="Daily Closeout" code="LOG">
              <Toggle
                active={currentLog.dailyReviewDone}
                label="Review complete"
                onClick={() => updateLog({ dailyReviewDone: !currentLog.dailyReviewDone })}
              />
              <TextArea
                label="What did I learn today?"
                value={currentLog.lessons}
                onChange={(lessons) => updateLog({ lessons })}
              />
              <TextArea
                label="How did I feel after completing my tasks?"
                value={currentLog.felt}
                onChange={(felt) => updateLog({ felt })}
              />
              <TextArea
                label="Reason I cannot quit"
                value={currentLog.cannotQuitReason}
                onChange={(cannotQuitReason) => updateLog({ cannotQuitReason })}
              />
            </Panel>

            <Panel title="Restart / Export" code="RESET">
              <TextArea
                label="Failure note"
                value={currentLog.failureNote}
                onChange={(failureNote) => updateLog({ failureNote })}
              />
              <div className="quick-actions">
                <button className="danger" onClick={markRestart}>
                  Mark restart
                </button>
                <button onClick={exportJson}>Export JSON</button>
                <button onClick={exportCsv}>Export CSV</button>
              </div>
              <div className="empty-state">
                Restarts saved: {data.restarts.length}. Your data stays exportable.
              </div>
            </Panel>
          </div>
        )}
      </section>
    </main>
  )
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <article className="signal-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function Panel({
  title,
  code,
  children,
}: {
  title: string
  code: string
  children: React.ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <span>{code}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button className={active ? 'toggle active' : 'toggle'} onClick={onClick}>
      <span>{active ? 'Complete' : 'Mark'}</span>
      {label}
    </button>
  )
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label>
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />
    </label>
  )
}

function BusinessProofCard({
  area,
  proof,
  onChange,
}: {
  area: BusinessArea
  proof: BusinessProof
  onChange: (patch: Partial<BusinessProof>) => void
}) {
  const complete = Boolean(proof.workedOn && proof.movedForward && proof.output && proof.nextStep)

  return (
    <article className={complete ? 'business-card complete' : 'business-card'}>
      <div className="business-head">
        <div>
          <h3>{areaLabels[area]}</h3>
          <p>{areaDescriptions[area]}</p>
        </div>
        <span>{complete ? 'Cleared' : 'Open'}</span>
      </div>
      <TextArea
        label="What did I work on?"
        value={proof.workedOn}
        onChange={(workedOn) => onChange({ workedOn })}
      />
      <TextArea
        label="What moved forward?"
        value={proof.movedForward}
        onChange={(movedForward) => onChange({ movedForward })}
      />
      <TextArea
        label="What result/output did I create?"
        value={proof.output}
        onChange={(output) => onChange({ output })}
      />
      <TextArea
        label="What is the next step?"
        value={proof.nextStep}
        onChange={(nextStep) => onChange({ nextStep })}
      />
      <TextArea label="Any blocker?" value={proof.blocker} onChange={(blocker) => onChange({ blocker })} />
    </article>
  )
}

function RevenueForm({
  selectedDate,
  onAdd,
}: {
  selectedDate: string
  onAdd: (entry: RevenueEntry) => Promise<void>
}) {
  const [source, setSource] = useState<RevenueSource>('Tera')
  const [type, setType] = useState<RevenueType>('lead')
  const [status, setStatus] = useState<RevenueStatus>('open')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')

  const submit = async () => {
    await onAdd({
      id: crypto.randomUUID(),
      date: selectedDate,
      source,
      type,
      amount: Number(amount || 0),
      status,
      followUpDate,
      notes,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    })
    setAmount('')
    setNotes('')
    setFollowUpDate('')
  }

  return (
    <div className="revenue-form">
      <div className="field-row two">
        <label>
          Source
          <select value={source} onChange={(event) => setSource(event.target.value as RevenueSource)}>
            <option>Tera</option>
            <option>Lensr</option>
            <option>Internship</option>
            <option>Other</option>
          </select>
        </label>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as RevenueType)}>
            <option value="lead">Lead</option>
            <option value="outreach">Outreach</option>
            <option value="booking">Booking</option>
            <option value="invoice">Invoice</option>
            <option value="cash">Cash received</option>
          </select>
        </label>
      </div>
      <div className="field-row two">
        <label>
          Amount
          <input value={amount} type="number" onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as RevenueStatus)}>
            <option value="open">Open</option>
            <option value="follow-up">Follow-up</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </label>
      </div>
      <label>
        Follow-up date
        <input type="date" value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
      </label>
      <TextArea label="Notes" value={notes} onChange={setNotes} />
      <button className="primary-action" onClick={submit}>
        Add revenue item
      </button>
    </div>
  )
}

function revenueBySource(entries: RevenueEntry[]) {
  const sources: RevenueSource[] = ['Tera', 'Lensr', 'Internship', 'Other']
  return sources.map((source) => ({
    name: source,
    value: entries
      .filter((entry) => entry.source === source && entry.status === 'won')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  }))
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN').format(value)
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function downloadFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export default App
