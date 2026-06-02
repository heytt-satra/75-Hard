import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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
  historyEntries,
  improvementMetrics,
  missionDateKey,
  quoteForDate,
  todayKey,
  type HistoryFilters,
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

type View = 'today' | 'body' | 'mind' | 'business' | 'money' | 'history' | 'progress' | 'review'
type Task = ReturnType<typeof coreTaskStatus>[number]

const initialData: MissionData = { logs: [], revenue: [], restarts: [] }

const views: Array<{ id: View; label: string; signal: string }> = [
  { id: 'today', label: 'Today', signal: 'Core' },
  { id: 'body', label: 'Body', signal: 'Workout' },
  { id: 'mind', label: 'Mind', signal: 'Read + write' },
  { id: 'business', label: 'Business', signal: 'Proof' },
  { id: 'money', label: 'Money', signal: 'INR 2L' },
  { id: 'history', label: 'History', signal: 'Timeline' },
  { id: 'progress', label: 'Progress', signal: 'Growth' },
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
  const [showCompleted, setShowCompleted] = useState(false)
  const [historyDate, setHistoryDate] = useState('')
  const [historyStatus, setHistoryStatus] = useState<HistoryFilters['status']>('all')
  const [historyQuery, setHistoryQuery] = useState('')

  const currentLog = useMemo(() => {
    return data.logs.find((log) => log.date === selectedDate) ?? createDailyLog(selectedDate)
  }, [data.logs, selectedDate])

  const taskStatus = coreTaskStatus(currentLog)
  const openTasks = taskStatus.filter((task) => !task.done)
  const completedTasks = taskStatus.filter((task) => task.done)
  const percent = completionPercent(currentLog)
  const dayNumber = dayNumberFor(selectedDate, data.restarts)
  const currentMonthRevenue = data.revenue
    .filter((entry) => entry.date.slice(0, 7) === selectedDate.slice(0, 7) && entry.status === 'won')
    .reduce((total, entry) => total + Number(entry.amount || 0), 0)
  const revenuePercent = Math.min(100, Math.round((currentMonthRevenue / MONTHLY_REVENUE_GOAL) * 100))
  const waterPercent = Math.min(100, Math.round((currentLog.waterMl / currentLog.waterGoalMl) * 100))
  const quote = quoteForDate(selectedDate)
  const streak = activeStreak(data)
  const metrics = improvementMetrics(data)
  const history = historyEntries(data, {
    date: historyDate,
    status: historyStatus,
    query: historyQuery,
  })

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
      <header className="app-header">
        <div className="header-main">
          <p className="eyebrow">Mission 75 / Heytt OS</p>
          <h1>Day {Math.min(dayNumber, TOTAL_DAYS)} command.</h1>
          <blockquote>
            "{quote.quote}"
            <cite>{quote.author}</cite>
          </blockquote>
        </div>

        <div className="header-panel">
          <div className="progress-orb" style={{ '--percent': `${percent}%` } as React.CSSProperties}>
            <strong>{percent}%</strong>
            <span>core complete</span>
          </div>
          <div className="header-controls">
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
      </header>

      <section className="signal-grid">
        <Signal label="Open tasks" value={openTasks.length.toString()} />
        <Signal label="Completed" value={completedTasks.length.toString()} />
        <Signal label="Clean streak" value={streak.toString()} />
        <Signal label="Water" value={`${waterPercent}%`} />
        <Signal label="Revenue" value={`${revenuePercent}%`} />
        <Signal label="Supabase" value={isSupabaseConfigured ? 'Ready' : 'Local'} />
      </section>

      <TaskSummary
        openTasks={openTasks}
        completedTasks={completedTasks}
        showCompleted={showCompleted}
        onToggleCompleted={() => setShowCompleted((value) => !value)}
        onTaskClick={(task) => setActiveView(taskView[task.id] ?? 'today')}
      />

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

      <section className="workspace">
        {activeView === 'today' && (
          <TodayView
            log={currentLog}
            waterPercent={waterPercent}
            updateLog={updateLog}
            addWater={addWater}
          />
        )}
        {activeView === 'body' && (
          <BodyView log={currentLog} updateLog={updateLog} handlePhoto={handlePhoto} />
        )}
        {activeView === 'mind' && <MindView log={currentLog} updateLog={updateLog} />}
        {activeView === 'business' && (
          <BusinessView log={currentLog} updateBusinessProof={updateBusinessProof} />
        )}
        {activeView === 'money' && (
          <MoneyView
            data={data}
            selectedDate={selectedDate}
            currentMonthRevenue={currentMonthRevenue}
            revenuePercent={revenuePercent}
            addRevenue={addRevenue}
          />
        )}
        {activeView === 'history' && (
          <HistoryView
            data={data}
            history={history}
            filters={{ date: historyDate, status: historyStatus, query: historyQuery }}
            setHistoryDate={setHistoryDate}
            setHistoryStatus={setHistoryStatus}
            setHistoryQuery={setHistoryQuery}
          />
        )}
        {activeView === 'progress' && <ProgressView data={data} metrics={metrics} />}
        {activeView === 'review' && (
          <ReviewView
            log={currentLog}
            restarts={data.restarts.length}
            updateLog={updateLog}
            markRestart={markRestart}
            exportJson={exportJson}
            exportCsv={exportCsv}
          />
        )}
      </section>
    </main>
  )
}

function TaskSummary({
  openTasks,
  completedTasks,
  showCompleted,
  onToggleCompleted,
  onTaskClick,
}: {
  openTasks: Task[]
  completedTasks: Task[]
  showCompleted: boolean
  onToggleCompleted: () => void
  onTaskClick: (task: Task) => void
}) {
  return (
    <section className="task-summary">
      <div className="summary-head">
        <div>
          <p className="eyebrow">Task flow</p>
          <h2>Finish what is open. Hide what is done.</h2>
        </div>
        <button className="ghost-action" onClick={onToggleCompleted}>
          {showCompleted ? 'Hide completed' : `Show completed (${completedTasks.length})`}
        </button>
      </div>

      <div className="open-task-row">
        {openTasks.length ? (
          openTasks.map((task) => (
            <button className="task-chip" key={task.id} onClick={() => onTaskClick(task)}>
              <span>Open</span>
              {task.label}
            </button>
          ))
        ) : (
          <div className="all-clear">All core tasks are complete for this day.</div>
        )}
      </div>

      {showCompleted && (
        <div className="completed-row">
          {completedTasks.length ? (
            completedTasks.map((task) => (
              <div className="completed-chip" key={task.id}>
                <span>Done</span>
                {task.label}
              </div>
            ))
          ) : (
            <div className="empty-state">Nothing completed yet.</div>
          )}
        </div>
      )}
    </section>
  )
}

function TodayView({
  log,
  waterPercent,
  updateLog,
  addWater,
}: {
  log: DailyLog
  waterPercent: number
  updateLog: (patch: Partial<DailyLog>) => Promise<void>
  addWater: (ml: number) => Promise<void>
}) {
  return (
    <div className="view-grid">
      <Panel title="Start The Day" code="CORE">
        <div className="field-row two">
          <label>
            Wake time
            <input
              type="time"
              value={log.wakeTime}
              onChange={(event) => updateLog({ wakeTime: event.target.value })}
            />
          </label>
          <label>
            Body weight
            <input
              value={log.bodyWeightKg}
              onChange={(event) => updateLog({ bodyWeightKg: event.target.value })}
              placeholder="85 kg"
            />
          </label>
        </div>
        <div className="toggle-row">
          <Toggle
            active={log.foodClean}
            label="Food stayed clean"
            onClick={() => updateLog({ foodClean: !log.foodClean })}
          />
          <Toggle
            active={log.paused}
            label="Travel/sick pause"
            onClick={() => updateLog({ paused: !log.paused })}
          />
        </div>
        {log.paused && (
          <TextArea
            label="Pause reason"
            value={log.pauseReason}
            onChange={(pauseReason) => updateLog({ pauseReason })}
          />
        )}
      </Panel>

      <Panel title="Hydration Control" code="H2O">
        <MeterBlock
          label="Water logged"
          value={`${log.waterMl} ml`}
          detail={`Goal: ${log.waterGoalMl} ml`}
          percent={waterPercent}
        />
        <div className="quick-actions">
          <button onClick={() => addWater(750)}>Add 750 ml</button>
          <button onClick={() => addWater(1000)}>Add 1 L</button>
          <button onClick={() => updateLog({ waterMl: 0 })}>Reset</button>
        </div>
        <label>
          Water goal
          <input
            type="number"
            value={log.waterGoalMl}
            onChange={(event) =>
              updateLog({ waterGoalMl: Number(event.target.value || DEFAULT_WATER_GOAL) })
            }
          />
        </label>
      </Panel>
    </div>
  )
}

function BodyView({
  log,
  updateLog,
  handlePhoto,
}: {
  log: DailyLog
  updateLog: (patch: Partial<DailyLog>) => Promise<void>
  handlePhoto: (file: File | undefined) => Promise<void>
}) {
  return (
    <div className="view-grid">
      <Panel title="Workout Protocol" code="BODY">
        <div className="segmented">
          <button
            className={log.workoutMode === 'indoor' ? 'selected' : ''}
            onClick={() => updateLog({ workoutMode: 'indoor' })}
          >
            Indoor protocol
          </button>
          <button
            className={log.workoutMode === 'outdoor' ? 'selected' : ''}
            onClick={() => updateLog({ workoutMode: 'outdoor' })}
          >
            Outdoor protocol
          </button>
        </div>
        <div className="protocol-card">
          {log.workoutMode === 'indoor'
            ? '15 pushups / 50 squats / 50 crunches / 2 min skipping / 1 min plank'
            : '3-5 km walk or run. No overthinking. Move.'}
        </div>
        <Toggle
          active={log.workoutDone}
          label="Workout complete"
          onClick={() => updateLog({ workoutDone: !log.workoutDone })}
        />
        <TextArea
          label="Workout proof"
          value={log.workoutNote}
          onChange={(workoutNote) => updateLog({ workoutNote })}
        />
      </Panel>

      <Panel title="Progress Capture" code="PHOTO">
        <label className="upload-tile">
          Upload progress photo
          <input type="file" accept="image/*" onChange={(event) => handlePhoto(event.target.files?.[0])} />
        </label>
        {log.progressPhotoLocal || log.progressPhotoUrl ? (
          <img
            className="photo-preview"
            src={log.progressPhotoLocal || log.progressPhotoUrl}
            alt="Progress"
          />
        ) : (
          <div className="empty-state">No photo captured for this day.</div>
        )}
        <TextArea
          label="Body note"
          value={log.bodyNote}
          onChange={(bodyNote) => updateLog({ bodyNote })}
        />
      </Panel>
    </div>
  )
}

function MindView({
  log,
  updateLog,
}: {
  log: DailyLog
  updateLog: (patch: Partial<DailyLog>) => Promise<void>
}) {
  return (
    <div className="view-grid">
      <Panel title="Reading Block" code="READ">
        <Toggle
          active={log.readingDone}
          label="30 minutes reading complete"
          onClick={() => updateLog({ readingDone: !log.readingDone })}
        />
        <label>
          What did you read?
          <input
            value={log.readingTitle}
            onChange={(event) => updateLog({ readingTitle: event.target.value })}
            placeholder="Book, chapter, idea"
          />
        </label>
        <TextArea
          label="What did you learn?"
          value={log.readingLearned}
          onChange={(readingLearned) => updateLog({ readingLearned })}
        />
      </Panel>

      <Panel title="Writing Block" code="WRITE">
        <Toggle
          active={log.writingDone}
          label="Focused writing session complete"
          onClick={() => updateLog({ writingDone: !log.writingDone })}
        />
        <TextArea
          label="What did you write?"
          value={log.writingNote}
          onChange={(writingNote) => updateLog({ writingNote })}
        />
      </Panel>
    </div>
  )
}

function BusinessView({
  log,
  updateBusinessProof,
}: {
  log: DailyLog
  updateBusinessProof: (area: BusinessArea, patch: Partial<BusinessProof>) => Promise<void>
}) {
  return (
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
            proof={log.businessProofs[area]}
            onChange={(patch) => updateBusinessProof(area, patch)}
          />
        ))}
      </div>
    </div>
  )
}

function MoneyView({
  data,
  selectedDate,
  currentMonthRevenue,
  revenuePercent,
  addRevenue,
}: {
  data: MissionData
  selectedDate: string
  currentMonthRevenue: number
  revenuePercent: number
  addRevenue: (entry: RevenueEntry) => Promise<void>
}) {
  return (
    <div className="view-grid">
      <Panel title="Revenue Ops" code="CASH">
        <RevenueForm onAdd={addRevenue} selectedDate={selectedDate} />
        <MeterBlock
          label="Monthly cash received"
          value={`INR ${formatMoney(currentMonthRevenue)}`}
          detail={`Target: INR ${formatMoney(MONTHLY_REVENUE_GOAL)}`}
          percent={revenuePercent}
        />
      </Panel>

      <Panel title="Revenue Source" code="DATA">
        <div className="chart-box compact-chart">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie
                data={revenueBySource(data.revenue)}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={86}
                paddingAngle={4}
              >
                {revenueBySource(data.revenue).map((entry, index) => (
                  <Cell key={entry.name} fill={['#4f46e5', '#10b981', '#f97316', '#64748b'][index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  )
}

function HistoryView({
  data,
  history,
  filters,
  setHistoryDate,
  setHistoryStatus,
  setHistoryQuery,
}: {
  data: MissionData
  history: ReturnType<typeof historyEntries>
  filters: HistoryFilters
  setHistoryDate: (date: string) => void
  setHistoryStatus: (status: HistoryFilters['status']) => void
  setHistoryQuery: (query: string) => void
}) {
  return (
    <div className="history-shell">
      <Panel title="History Timeline" code="HIST">
        <div className="history-filters">
          <label>
            Specific date
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setHistoryDate(event.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => setHistoryStatus(event.target.value as HistoryFilters['status'])}
            >
              <option value="all">All</option>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
              <option value="paused">Paused</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label>
            Search notes
            <input
              value={filters.query}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search proof, notes, reading..."
            />
          </label>
          <button
            className="ghost-action"
            onClick={() => {
              setHistoryDate('')
              setHistoryStatus('all')
              setHistoryQuery('')
            }}
          >
            Clear filters
          </button>
        </div>
      </Panel>

      <div className="history-list">
        {history.length ? (
          history.map((entry) => (
            <HistoryCard
              key={entry.log.date}
              entry={entry}
              dayNumber={dayNumberFor(entry.log.date, data.restarts)}
            />
          ))
        ) : (
          <div className="empty-state large">No history found for this filter.</div>
        )}
      </div>
    </div>
  )
}

function HistoryCard({
  entry,
  dayNumber,
}: {
  entry: ReturnType<typeof historyEntries>[number]
  dayNumber: number
}) {
  const { log, revenue, restarts, percent, counts } = entry
  return (
    <article className="history-card">
      <div className="history-card-head">
        <div>
          <p className="eyebrow">{formatDate(log.date)}</p>
          <h3>Day {dayNumber}</h3>
        </div>
        <div className="history-percent">{percent}%</div>
      </div>

      <div className="history-stats">
        <span>{counts.completedCount} done</span>
        <span>{counts.openCount} open</span>
        <span>{log.waterMl}/{log.waterGoalMl} ml</span>
        <span>{log.foodClean ? 'Clean food' : 'Food open'}</span>
      </div>

      <div className="history-sections">
        <HistoryBlock title="Body" lines={[log.workoutNote, log.bodyWeightKg && `Weight: ${log.bodyWeightKg}`, log.bodyNote]} />
        <HistoryBlock title="Mind" lines={[log.readingTitle, log.readingLearned, log.writingNote]} />
        <HistoryBlock
          title="Business"
          lines={[
            log.businessProofs.tera.output && `Tera: ${log.businessProofs.tera.output}`,
            log.businessProofs.lensr.output && `Lensr: ${log.businessProofs.lensr.output}`,
            log.businessProofs.job.output && `Job: ${log.businessProofs.job.output}`,
          ]}
        />
        <HistoryBlock title="Review" lines={[log.lessons, log.felt, log.cannotQuitReason]} />
      </div>

      {(log.progressPhotoLocal || log.progressPhotoUrl) && (
        <img
          className="history-photo"
          src={log.progressPhotoLocal || log.progressPhotoUrl}
          alt={`Progress for ${log.date}`}
        />
      )}

      {revenue.length > 0 && (
        <div className="revenue-history">
          <h4>Revenue</h4>
          {revenue.map((entry) => (
            <p key={entry.id}>
              {entry.source} / {entry.type} / {entry.status} / INR {formatMoney(entry.amount)}
              {entry.notes ? ` - ${entry.notes}` : ''}
            </p>
          ))}
        </div>
      )}

      {(log.paused || log.failed || restarts.length > 0) && (
        <div className="alert-strip">
          {log.paused && <span>Paused: {log.pauseReason || 'No note'}</span>}
          {log.failed && <span>Failed: {log.failureNote || 'No note'}</span>}
          {restarts.map((restart) => (
            <span key={restart.id}>Restart: {restart.failedTask}</span>
          ))}
        </div>
      )}
    </article>
  )
}

function ProgressView({
  data,
  metrics,
}: {
  data: MissionData
  metrics: ReturnType<typeof improvementMetrics>
}) {
  const summary =
    data.logs.length === 0
      ? 'Start logging daily proof and this section will turn into your transformation record.'
      : `Since Day 1, you have logged ${data.logs.length} days, completed ${metrics.cleanDays} clean days, finished ${metrics.workouts} workouts, and recorded INR ${formatMoney(metrics.totalRevenueWon)} won.`

  return (
    <div className="progress-shell">
      <section className="progress-score-grid">
        <ScoreCard label="Avg completion" value={`${metrics.completionAverage}%`} />
        <ScoreCard label="Best streak" value={metrics.bestStreak.toString()} />
        <ScoreCard label="Clean days" value={metrics.cleanDays.toString()} />
        <ScoreCard label="Workouts" value={metrics.workouts.toString()} />
        <ScoreCard label="Reading days" value={metrics.readingDays.toString()} />
        <ScoreCard label="Writing days" value={metrics.writingDays.toString()} />
        <ScoreCard label="Business proof" value={metrics.businessProofDays.toString()} />
        <ScoreCard label="Revenue won" value={`INR ${formatMoney(metrics.totalRevenueWon)}`} />
        <ScoreCard
          label="Weight change"
          value={metrics.bodyWeightChange === null ? 'No data' : `${metrics.bodyWeightChange} kg`}
        />
      </section>

      <Panel title="Since Day 1" code="GROW">
        <p className="narrative">{summary}</p>
      </Panel>

      <div className="progress-charts">
        <ChartPanel title="Completion Over Time">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={metrics.completionChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="completion" fill="#4f46e5" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Water Intake">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={metrics.waterChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="water" stroke="#0891b2" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="goal" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Revenue By Source">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={revenueBySource(data.revenue)}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={88}
                paddingAngle={4}
              >
                {revenueBySource(data.revenue).map((entry, index) => (
                  <Cell key={entry.name} fill={['#4f46e5', '#10b981', '#f97316', '#64748b'][index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Body Weight Trend">
          {metrics.weightChart.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics.weightChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">Add body weight logs to see this trend.</div>
          )}
        </ChartPanel>
      </div>
    </div>
  )
}

function ReviewView({
  log,
  restarts,
  updateLog,
  markRestart,
  exportJson,
  exportCsv,
}: {
  log: DailyLog
  restarts: number
  updateLog: (patch: Partial<DailyLog>) => Promise<void>
  markRestart: () => Promise<void>
  exportJson: () => void
  exportCsv: () => void
}) {
  return (
    <div className="view-grid">
      <Panel title="Daily Closeout" code="LOG">
        <Toggle
          active={log.dailyReviewDone}
          label="Review complete"
          onClick={() => updateLog({ dailyReviewDone: !log.dailyReviewDone })}
        />
        <TextArea
          label="What did I learn today?"
          value={log.lessons}
          onChange={(lessons) => updateLog({ lessons })}
        />
        <TextArea
          label="How did I feel after completing my tasks?"
          value={log.felt}
          onChange={(felt) => updateLog({ felt })}
        />
        <TextArea
          label="Reason I cannot quit"
          value={log.cannotQuitReason}
          onChange={(cannotQuitReason) => updateLog({ cannotQuitReason })}
        />
      </Panel>

      <Panel title="Restart / Export" code="RESET">
        <TextArea
          label="Failure note"
          value={log.failureNote}
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
          Restarts saved: {restarts}. Your data stays exportable.
        </div>
      </Panel>
    </div>
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

function ScoreCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="score-card">
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

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="chart-panel">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function MeterBlock({
  label,
  value,
  detail,
  percent,
}: {
  label: string
  value: string
  detail: string
  percent: number
}) {
  return (
    <div className="meter-block">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
      <div className="mini-meter">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
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

function HistoryBlock({ title, lines }: { title: string; lines: Array<string | false> }) {
  const visible = lines.filter(Boolean)
  return (
    <div className="history-block">
      <h4>{title}</h4>
      {visible.length ? visible.map((line, index) => <p key={`${title}-${index}`}>{line}</p>) : <p>No entry.</p>}
    </div>
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

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
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
