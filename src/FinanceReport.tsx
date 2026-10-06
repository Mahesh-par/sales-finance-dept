import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL } from './config'

type DailyBidCount = { id: string; date: string; totalBids: number }
type ClientRow = { id: string; client?: string | null; createdAt?: string | null }
type Bidder = {
  id: string
  name: string
  direct?: boolean | number
  rows?: ClientRow[]
  dailyBidCounts?: DailyBidCount[]
}
type Team = { id: string; name: string; bidders?: Bidder[] }
type DashboardData = {
  state?: { weekFrom?: string | null; weekTo?: string | null }
  teams?: Team[]
}
type FinanceUser = { name: string; role: string }
type FinanceBidder = {
  id: string
  name: string
  team: string
  dailyBidCounts: DailyBidCount[]
  rows: ClientRow[]
}
type BidderWeek = {
  bidder: FinanceBidder
  bids: number
  responses: number
  activeDays: number
  rate: number
  perDay: number
  entered: boolean
  rank: number
  tiedOnResponses: boolean
  deadHeat: boolean
}
type WeekReport = {
  days: string[]
  all: BidderWeek[]
  list: BidderWeek[]
  winner: BidderWeek | null
  contest: BidderWeek[]
  verdict: 'clear' | 'tiebreak' | 'unresolved' | 'none' | 'no responses'
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const keyFromDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const dateKey = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : keyFromDate(date)
}

const dateFromKey = (key: string) => new Date(`${key}T00:00:00`)
const addDays = (key: string, days: number) => {
  const date = dateFromKey(key)
  date.setDate(date.getDate() + days)
  return keyFromDate(date)
}
const weekStart = (key: string) => {
  const date = dateFromKey(key)
  date.setDate(date.getDate() - (date.getDay() + 6) % 7)
  return keyFromDate(date)
}
const weekDays = (start: string) => Array.from({ length: 7 }, (_, index) => addDays(start, index))
const weekLabel = (start: string) => {
  const end = dateFromKey(addDays(start, 6))
  const begin = dateFromKey(start)
  return `${begin.getDate()} ${MONTH_NAMES[begin.getMonth()]} to ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`
}
const shortDate = (key: string) => {
  const date = dateFromKey(key)
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`
}
const formatCount = (value: number) => value.toLocaleString('en-US')

const readStoredUser = () => {
  const rawUser = localStorage.getItem('user')
  if (!rawUser) return null
  try {
    return JSON.parse(rawUser) as FinanceUser
  } catch {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    return null
  }
}

const getBidders = (data: DashboardData): FinanceBidder[] =>
  (data.teams || []).flatMap((team) =>
    (team.bidders || []).map((bidder) => ({
      id: bidder.id,
      name: bidder.direct === true || bidder.direct === 1 ? 'Direct and repeat clients' : bidder.name,
      team: team.name,
      dailyBidCounts: bidder.dailyBidCounts || [],
      rows: bidder.rows || [],
    })),
  )

const getRecordedWeeks = (bidders: FinanceBidder[], activeWeek?: string | null) => {
  const weeks = new Set<string>()
  bidders.forEach((bidder) => {
    bidder.dailyBidCounts.forEach((record) => {
      if (record.date) weeks.add(weekStart(record.date))
    })
    bidder.rows.forEach((row) => {
      const key = dateKey(row.createdAt)
      if (key) weeks.add(weekStart(key))
    })
  })
  if (activeWeek) weeks.add(weekStart(activeWeek))
  if (weeks.size === 0) weeks.add(weekStart(keyFromDate(new Date())))
  return [...weeks].sort((a, b) => b.localeCompare(a))
}

const buildWeekReport = (bidders: FinanceBidder[], start: string): WeekReport => {
  const days = weekDays(start)
  const end = days[days.length - 1]
  const all = bidders.map((bidder) => {
    const dailyRecords = bidder.dailyBidCounts.filter((record) => record.date >= start && record.date <= end)
    const responseRows = bidder.rows.filter((row) => {
      const key = dateKey(row.createdAt)
      return Boolean(row.client?.trim()) && key >= start && key <= end
    })
    const activityDays = new Set<string>(dailyRecords.map((record) => record.date))
    responseRows.forEach((row) => {
      const key = dateKey(row.createdAt)
      if (key) activityDays.add(key)
    })
    const bids = dailyRecords.reduce((total, record) => total + Number(record.totalBids || 0), 0)
    const responses = responseRows.length
    return {
      bidder,
      bids,
      responses,
      activeDays: activityDays.size,
      rate: bids ? responses / bids : 0,
      perDay: activityDays.size ? bids / activityDays.size : 0,
      entered: activityDays.size > 0,
      rank: 0,
      tiedOnResponses: false,
      deadHeat: false,
    }
  })
  const list = all
    .filter((person) => person.entered)
    .sort((a, b) => b.responses - a.responses || a.bids - b.bids || a.bidder.name.localeCompare(b.bidder.name))
  list.forEach((person, index) => {
    person.rank = index + 1
    person.tiedOnResponses = list.filter((other) => other.responses === person.responses).length > 1
    person.deadHeat = list.filter((other) => other.responses === person.responses && other.bids === person.bids).length > 1
  })
  if (!list.length) return { days, all, list, winner: null, contest: [], verdict: 'none' }
  const top = list[0]
  if (top.responses === 0) return { days, all, list, winner: null, contest: [], verdict: 'no responses' }
  const tied = list.filter((person) => person.responses === top.responses)
  if (tied.length === 1) return { days, all, list, winner: top, contest: tied, verdict: 'clear' }
  const finalists = tied.filter((person) => person.bids === Math.min(...tied.map((entry) => entry.bids)))
  if (finalists.length === 1) return { days, all, list, winner: finalists[0], contest: tied, verdict: 'tiebreak' }
  return { days, all, list, winner: null, contest: finalists, verdict: 'unresolved' }
}

function FinanceLogin({ onLogin }: { onLogin: (user: FinanceUser) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    try {
      setSubmitting(true)
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(json.error || 'Invalid credentials')
        return
      }
      localStorage.setItem('token', json.token)
      localStorage.setItem('user', JSON.stringify(json.user))
      onLogin(json.user)
    } catch {
      setError('Failed to connect to server')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <img className="login-brand" src="/10turtle-wordmark.svg" alt="10turtle" />
        <div className="login-kicker">Finance department</div>
        <h1 className="login-title">Sign in</h1>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className="login-field"><span>Username or email</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label className="login-field"><span>Password</span><div className="password-row">
            <input autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className="show-password" type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Hide' : 'Show'}</button>
          </div></label>
          <button className="btn solid login-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in...' : 'Login'}</button>
        </form>
      </section>
    </main>
  )
}

function GridPair({ bids, responses, highlight = false, total = false }: { bids?: string; responses?: string; highlight?: boolean; total?: boolean }) {
  if (bids === undefined && responses === undefined) return <><th className="center sub-head">Bids</th><th className="center sub-head">Resp</th></>
  return <><td className={`center${total ? ' total-cell' : ''}`}>{bids}</td><td className={`center${highlight ? ' response-hit' : ''}${total ? ' total-cell' : ''}`}>{responses}</td></>
}

function App() {
  const [user, setUser] = useState<FinanceUser | null>(() => readStoredUser())
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!user) {
        setData(null)
        setLoading(false)
        return
      }
      const token = localStorage.getItem('token')
      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`${API_BASE_URL}/api/data/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) {
          const invalidToken =
            response.status === 403 &&
            typeof json.error === 'string' &&
            json.error.toLowerCase() === 'invalid token'

          if (response.status === 401 || invalidToken) {
            setUser(null)
            setData(null)
            setError('')
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            return
          }
          throw new Error(json.error || 'Failed to fetch finance dashboard data.')
        }
        setData(json)
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch finance dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    void fetchDashboard()
  }, [user])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setData(null)
    setError('')
  }

  if (!user) return <FinanceLogin onLogin={(nextUser) => { setLoading(true); setUser(nextUser) }} />
  if (loading) return <main className="finance-report"><div className="report-state">Loading finance dashboard...</div></main>
  if (error) return <main className="finance-report"><div className="report-toolbar"><img className="toolbar-brand" src="/10turtle-wordmark.svg" alt="10turtle" /><button className="btn ghost" type="button" onClick={handleLogout}>Logout</button></div><div className="report-state error">{error}</div></main>

  const bidders = getBidders(data || {})
  const weeks = getRecordedWeeks(bidders, data?.state?.weekFrom)
  const activeWeek = weeks.includes(selectedWeek) ? selectedWeek : weeks[0]
  const report = buildWeekReport(bidders, activeWeek)
  const totals = report.list.reduce((result, person) => ({ bids: result.bids + person.bids, responses: result.responses + person.responses }), { bids: 0, responses: 0 })
  const noEntry = report.all.filter((person) => !person.entered)
  const partial = report.list.filter((person) => person.activeDays > 0 && person.activeDays < 5)
  const maxResponses = Math.max(1, ...report.list.map((person) => person.responses))
  const handleWeekChange = (week: string) => {
    setSelectedWeek(week)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const responseCountForDay = (bidder: FinanceBidder, day: string) => bidder.rows.filter((row) => row.client?.trim() && dateKey(row.createdAt) === day).length

  const winner = report.winner
  let verdictTitle = 'No responses recorded'
  let verdictExplanation = 'Nothing logged for this week yet.'
  if (report.verdict === 'clear' && winner) {
    verdictTitle = 'Clear winner on responses'
    verdictExplanation = `${winner.bidder.name} leads on responses outright. No tie-break needed.`
  } else if (report.verdict === 'tiebreak' && winner) {
    const others = report.contest.filter((person) => person !== winner)
    verdictTitle = 'Decided on the tie-break'
    verdictExplanation = `${report.contest.length} bidders tied on ${winner.responses} responses. ${winner.bidder.name} sent the fewest bids (${formatCount(winner.bids)} against ${others.map((person) => formatCount(person.bids)).join(' and ')}), so the reward goes there.`
  } else if (report.verdict === 'unresolved') {
    verdictTitle = 'No automatic winner'
    verdictExplanation = `${report.contest.map((person) => person.bidder.name).join(' and ')} are level on ${report.contest[0]?.responses ?? 0} responses and ${report.contest[0]?.bids ?? 0} bids. Finance decides this one.`
  }

  const history = weeks.map((week) => ({ week, report: buildWeekReport(bidders, week) }))
  const allTime = bidders.map((bidder) => {
    const bids = bidder.dailyBidCounts.reduce((total, record) => total + Number(record.totalBids || 0), 0)
    const responses = bidder.rows.filter((row) => Boolean(row.client?.trim())).length
    const days = new Set([...bidder.dailyBidCounts.map((record) => record.date), ...bidder.rows.map((row) => dateKey(row.createdAt)).filter(Boolean)]).size
    const wins = history.filter(({ report: historyReport }) => historyReport.winner?.bidder.id === bidder.id).length
    return { bidder, bids, responses, days, wins, rate: bids ? responses / bids : 0 }
  }).sort((a, b) => b.rate - a.rate || b.responses - a.responses)

  return (
    <main className="finance-report">
      <div className="report-toolbar">
        <button className="btn solid" type="button" onClick={() => window.print()}>Print / save PDF</button>
        <label className="week-picker">Week<select value={activeWeek} onChange={(event) => handleWeekChange(event.target.value)}>{weeks.map((week) => <option key={week} value={week}>{weekLabel(week)}</option>)}</select></label>
        <span className="role-badge">View only</span><span className="toolbar-spacer" /><span className="saved-label">Live data · read only</span>
        <button className="btn ghost" type="button" onClick={handleLogout}>Logout</button>
      </div>
      <header className="report-masthead">
        <div className="report-masthead-top"><span className="brand-mark"><img src="/10turtle-wordmark.svg" alt="10turtle" /></span><div className="report-meta">Finance view<br />Weekly reward</div></div>
        <div className="report-kicker">Bidder responses and bids · all teams</div><h1 className="report-title">Bidder performance</h1><div className="accent-rule" />
        <div className="report-meta-row"><div><span className="meta-label">Reward week</span><span className="meta-value">{weekLabel(activeWeek)}</span></div><div><span className="meta-label">Bidders tracked</span><span className="meta-value light">{bidders.length}</span></div><div><span className="meta-label">Ranking rule</span><span className="meta-value light">most responses, then fewest bids</span></div></div>
      </header>

      <section className="report-section">
        <div className="section-head"><span className="section-number">01</span><span className="section-label">The reward</span></div><h2 className="section-title">Who wins this week</h2>
        <p className="section-note">Most responses takes it. On a tie, the fewest bids wins, because the same result from less volume is the better week. The working is shown so nobody has to take it on trust.</p>
        <div className={`verdict-box${report.verdict === 'unresolved' ? ' warn' : ''}`}><div className="verdict-label">{verdictTitle}</div><div className="verdict-name">{winner?.bidder.name || (report.verdict === 'unresolved' ? report.contest.map((person) => person.bidder.name).join(' / ') : '-')}</div>{winner && <div className="verdict-sub">{winner.bidder.team} team · {formatCount(winner.responses)} responses from {formatCount(winner.bids)} bids · {(winner.rate * 100).toFixed(1)}% hit rate</div>}<div className="verdict-why">{verdictExplanation}</div></div>
        <div className="report-stats"><div className="report-stat"><div className="stat-label">Responses, all bidders</div><div className="stat-value">{formatCount(totals.responses)}</div></div><div className="report-stat"><div className="stat-label">Bids sent</div><div className="stat-value">{formatCount(totals.bids)}</div></div><div className="report-stat"><div className="stat-label">Team hit rate</div><div className="stat-value">{totals.bids ? `${(totals.responses / totals.bids * 100).toFixed(1)}%` : '0.0%'}</div></div><div className="report-stat"><div className="stat-label">Days marked off</div><div className="stat-value">-</div></div></div>
        {(noEntry.length > 0 || partial.length > 0) && <div className="data-flags"><div className="flag-label">Worth knowing about this week’s data</div>{noEntry.length > 0 && <p><b>{noEntry.length} bidder{noEntry.length === 1 ? '' : 's'}</b> logged nothing this week ({noEntry.map((person) => person.bidder.name).join(', ')}), so they are absent from the ranking rather than scored zero.</p>}{partial.length > 0 && <p><b>{partial.length}</b> ranked on fewer than 5 logged days ({partial.map((person) => `${person.bidder.name} ${person.activeDays}d`).join(', ')}); the ranking rule does not adjust for days logged.</p>}</div>}
      </section>

      <section className="report-section">
        <div className="section-head"><span className="section-number">02</span><span className="section-label">The leaderboard</span></div><h2 className="section-title">Every bidder, every team</h2>
        <p className="section-note">Sorted by responses, then by fewest bids. Hit rate and bids per day are context for finance; they do not affect the ranking.</p>
        <div className="table-scroll"><table className="report-table leaderboard-table"><thead><tr><th className="center">#</th><th>Bidder</th><th>Team</th><th className="center">Responses</th><th /><th className="center">Bids</th><th className="center">Hit rate</th><th className="center">Bids / day</th><th className="center">Days logged</th></tr></thead><tbody>
          {report.list.length === 0 ? <tr><td colSpan={9} className="empty-row">Nothing logged for this week.</td></tr> : report.list.map((person) => {
            const isWinner = winner?.bidder.id === person.bidder.id
            const unresolved = report.verdict === 'unresolved' && report.contest.includes(person)
            return <tr className={isWinner ? 'winner-row' : unresolved ? 'alert-row' : ''} key={person.bidder.id}><td className="center rank-cell">{isWinner ? <span className="winner-crown">1</span> : person.rank}</td><td><span className="bidder-name">{person.bidder.name}</span>{person.deadHeat ? <span className="small-tag ink">dead heat</span> : person.tiedOnResponses ? <span className="small-tag">tied</span> : null}</td><td className="muted-cell">{person.bidder.team}</td><td className="center numeric strong">{formatCount(person.responses)}</td><td className="bar-cell"><span className="response-bar"><i style={{ width: `${Math.round(person.responses / maxResponses * 100)}%` }} /></span></td><td className="center numeric">{formatCount(person.bids)}</td><td className="center numeric">{(person.rate * 100).toFixed(1)}%</td><td className="center numeric">{person.perDay.toFixed(0)}</td><td className="center numeric">{person.activeDays}</td></tr>
          })}
        </tbody></table></div>
        <div className="rule-box"><div><div className="rule-number">RULE 1</div><div className="rule-title">Most responses</div><p>The count of client rows recorded in the week. Highest wins outright.</p></div><div><div className="rule-number">RULE 2</div><div className="rule-title">Fewest bids breaks a tie</div><p>Level on responses, so the one who got there on less volume takes it. Rewards aim, not spray.</p></div><div><div className="rule-number">RULE 3</div><div className="rule-title">Still level, finance decides</div><p>Same responses and the same bids. The rule stops here rather than guessing, and the week is flagged.</p></div></div>
      </section>

      <section className="report-section">
        <div className="section-head"><span className="section-number">03</span><span className="section-label">Day by day</span></div><h2 className="section-title">The daily log this all comes from</h2>
        <p className="section-note">Bids sent and client rows recorded, per bidder, per day. Response counts use actual client rows in the sales data. Missing daily values show as a dash.</p>
        <div className="table-scroll"><table className="report-table daily-grid"><thead><tr><th className="day-column">Day</th>{report.list.map((person) => <th className="center bidder-pair" colSpan={2} key={person.bidder.id}>{person.bidder.name}</th>)}<th className="center bidder-pair" colSpan={2}>All</th></tr><tr><th />{report.list.map((person) => <GridPair key={person.bidder.id} />)}<GridPair /></tr></thead><tbody>
          {report.days.map((day) => {
            let dailyBids = 0
            let dailyResponses = 0
            const date = dateFromKey(day)
            const weekend = date.getDay() === 0 || date.getDay() === 6
            return <tr className={weekend ? 'weekend-row' : ''} key={day}><td className="day-cell">{shortDate(day)}</td>{report.list.map((person) => {
              const bidRecord = person.bidder.dailyBidCounts.find((record) => record.date === day)
              const responses = responseCountForDay(person.bidder, day)
              const hasDayData = Boolean(bidRecord) || responses > 0
              const bids = bidRecord ? Number(bidRecord.totalBids || 0) : null
              if (bids !== null) dailyBids += bids
              if (responses > 0) dailyResponses += responses
              return <GridPair key={person.bidder.id} bids={hasDayData && bids !== null ? formatCount(bids) : '-'} responses={hasDayData ? formatCount(responses) : '-'} highlight={responses > 0} />
            })}<td className="center total-cell">{formatCount(dailyBids)}</td><td className="center total-cell">{formatCount(dailyResponses)}</td></tr>
          })}
        </tbody><tfoot><tr><td className="total-label">Week</td>{report.list.map((person) => <GridPair key={person.bidder.id} bids={formatCount(person.bids)} responses={formatCount(person.responses)} total />)}<td className="center total-cell">{formatCount(totals.bids)}</td><td className="center total-cell">{formatCount(totals.responses)}</td></tr></tfoot></table></div>
      </section>

      <section className="report-section">
        <div className="section-head"><span className="section-number">04</span><span className="section-label">On record</span></div><h2 className="section-title">Every week logged</h2>
        <p className="section-note">Select a week to open its results above. The decision column shows whether the tie-break was needed.</p>
        <div className="table-scroll"><table className="report-table history-table"><thead><tr><th>Week</th><th>Reward went to</th><th>Decided by</th><th className="center">Their responses</th><th className="center">Their bids</th><th className="center">All responses</th><th className="center">All bids</th><th className="center">Hit rate</th></tr></thead><tbody>
          {history.map(({ week, report: weekReport }) => {
            const historyWinner = weekReport.winner
            const responses = weekReport.list.reduce((sum, person) => sum + person.responses, 0)
            const bids = weekReport.list.reduce((sum, person) => sum + person.bids, 0)
            const decidedBy = weekReport.verdict === 'tiebreak' ? 'tie-break on bids' : weekReport.verdict === 'unresolved' ? 'needs a decision' : weekReport.verdict === 'clear' ? 'clear' : '-'
            return <tr className={`history-row${week === activeWeek ? ' selected' : ''}`} key={week}><td><button className="week-link" type="button" onClick={() => handleWeekChange(week)}>{weekLabel(week)}</button></td><td>{historyWinner?.bidder.name || <span className="quiet-cell">{weekReport.verdict === 'unresolved' ? 'not settled' : 'no winner'}</span>}</td><td className="muted-cell">{decidedBy}</td><td className="center numeric">{historyWinner ? formatCount(historyWinner.responses) : '-'}</td><td className="center numeric">{historyWinner ? formatCount(historyWinner.bids) : '-'}</td><td className="center numeric">{formatCount(responses)}</td><td className="center numeric">{formatCount(bids)}</td><td className="center numeric">{bids ? `${(responses / bids * 100).toFixed(1)}%` : '-'}</td></tr>
          })}
        </tbody></table></div>
        <h3 className="running-title">Running totals, all weeks</h3><p className="section-note compact-note">Sorted by hit rate, not responses, because over time that is the better measure of responses per bid.</p>
        <div className="table-scroll"><table className="report-table history-table"><thead><tr><th>Bidder</th><th>Team</th><th className="center">Responses</th><th className="center">Bids</th><th className="center">Hit rate</th><th className="center">Bids / day</th><th className="center">Days logged</th><th className="center">Weeks won</th></tr></thead><tbody>
          {allTime.map((person) => <tr key={person.bidder.id}><td><span className="bidder-name">{person.bidder.name}</span></td><td className="muted-cell">{person.bidder.team}</td><td className="center numeric">{formatCount(person.responses)}</td><td className="center numeric">{formatCount(person.bids)}</td><td className="center numeric strong">{(person.rate * 100).toFixed(2)}%</td><td className="center numeric">{person.days ? (person.bids / person.days).toFixed(0) : '-'}</td><td className="center numeric">{person.days}</td><td className="center numeric">{person.wins || '-'}</td></tr>)}
          {allTime.length === 0 && <tr><td colSpan={8} className="empty-row">No bidder data recorded.</td></tr>}
        </tbody></table></div>
      </section>
      <footer className="report-footer"><span>10turtle.com</span><span>Finance view · Weekly reward</span></footer>
    </main>
  )
}

export default App