import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL } from './config'

type DailyBidCount = {
  id: string
  date: string
  totalBids: number
}

type ClientRow = {
  id: string
  bidderId: string
  client?: string | null
  createdAt?: string | null
  convertedOn?: string | null
  budget?: string | null
  quoted?: string | null
  workedHours?: number | string | null
  status?: string | null
}

type Bidder = {
  id: string
  name: string
  direct?: boolean | number
  rows?: ClientRow[]
  dailyBidCounts?: DailyBidCount[]
}

type Team = {
  id: string
  name: string
  bidders?: Bidder[]
}

type DashboardData = {
  teams?: Team[]
  team?: Team
}

type FinanceUser = {
  name: string
  role: string
  teamId?: string | null
}

type ClientFinanceRow = {
  id: string
  bidderName: string
  dateKey: string
  date: string
  clientName: string
  convertedOn: string
  budget: string
  quotation: string
  hoursWeek: string
}

type BidderFinanceSummary = {
  id: string
  bidderName: string
  totalBids: number
  totalResponses: number
  totalClientConverted: number
}

type BidderSortKey = 'totalBids' | 'totalResponses' | 'totalClientConverted'

type SortDirection = 'asc' | 'desc'

const CLIENT_LEDGER_PAGE_SIZE = 25

const formatDate = (value?: string | null) => {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const dateKey = (value?: string | null) => {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isDateInRange = (key: string, from: string, to: string) => {
  if (!key) return false
  if (from && key < from) return false
  if (to && key > to) return false
  return true
}

const formatMoney = (value?: string | number | null) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) return '-'

  return `$${parsed.toLocaleString()}`
}

const renderValue = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

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
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
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
        <img
          className="login-brand"
          src="/10turtle-wordmark.svg"
          alt="10turtle"
        />
        <div className="login-kicker">Finance department</div>
        <h1 className="login-title">Sign in</h1>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Username or email</span>
            <input
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="login-field">
            <span>Password</span>
            <div className="password-row">
              <input
                autoComplete="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="show-password"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
          <button
            className="btn solid login-submit"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  )
}

function App() {
  const [user, setUser] = useState<FinanceUser | null>(() => readStoredUser())
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clientFromDate, setClientFromDate] = useState('')
  const [clientToDate, setClientToDate] = useState('')
  const [clientPage, setClientPage] = useState(1)
  const [bidderFromDate, setBidderFromDate] = useState('')
  const [bidderToDate, setBidderToDate] = useState('')
  const [bidderSort, setBidderSort] = useState<{
    key: BidderSortKey
    direction: SortDirection
  }>({ key: 'totalBids', direction: 'desc' })

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')
        const token = localStorage.getItem('token')

        if (!token) {
          setUser(null)
          setLoading(false)
          return
        }

        const res = await fetch(`${API_BASE_URL}/api/data/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json().catch(() => ({}))

        if (res.status === 401 || res.status === 403) {
          setError('Session expired or this account cannot view dashboard data.')
          return
        }

        if (!res.ok) {
          setError(json.error || 'Failed to fetch finance dashboard data.')
          return
        }

        setData(json)
      } catch {
        setError('Failed to fetch finance dashboard data.')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [user])

  const teams = useMemo(() => {
    if (!data) return []
    if (Array.isArray(data.teams)) return data.teams
    if (data.team) return [data.team]
    return []
  }, [data])

  const clientRows = useMemo<ClientFinanceRow[]>(() => {
    return teams
      .flatMap((team) =>
        (team.bidders || []).flatMap((bidder) =>
          (bidder.rows || []).map((row) => ({
            id: row.id,
            bidderName:
              bidder.direct === true || bidder.direct === 1
                ? 'Direct and repeat clients'
                : bidder.name,
            dateKey: dateKey(row.createdAt),
            date: formatDate(row.createdAt),
            clientName: renderValue(row.client),
            convertedOn:
              row.status === 'Converted' ? formatDate(row.convertedOn) : '-',
            budget: formatMoney(row.budget),
            quotation: formatMoney(row.quoted),
            hoursWeek: renderValue(row.workedHours),
          })),
        ),
      )
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  }, [teams])

  const filteredClientRows = useMemo(() => {
    return clientRows.filter((row) =>
      isDateInRange(row.dateKey, clientFromDate, clientToDate),
    )
  }, [clientFromDate, clientRows, clientToDate])

  const clientPageCount = Math.max(
    1,
    Math.ceil(filteredClientRows.length / CLIENT_LEDGER_PAGE_SIZE),
  )
  const currentClientPage = Math.min(clientPage, clientPageCount)
  const paginatedClientRows = filteredClientRows.slice(
    (currentClientPage - 1) * CLIENT_LEDGER_PAGE_SIZE,
    currentClientPage * CLIENT_LEDGER_PAGE_SIZE,
  )

  const bidderSummaries = useMemo<BidderFinanceSummary[]>(() => {
    return teams.flatMap((team) =>
      (team.bidders || []).map((bidder) => {
        const rows = (bidder.rows || []).filter((row) =>
          isDateInRange(dateKey(row.createdAt), bidderFromDate, bidderToDate),
        )
        const totalBids = (bidder.dailyBidCounts || [])
          .filter((record) =>
            isDateInRange(record.date, bidderFromDate, bidderToDate),
          )
          .reduce((sum, record) => sum + Number(record.totalBids || 0), 0)

        return {
          id: bidder.id,
          bidderName:
            bidder.direct === true || bidder.direct === 1
              ? 'Direct and repeat clients'
              : bidder.name,
          totalBids,
          totalResponses: rows.filter((row) => row.client?.trim()).length,
          totalClientConverted: rows.filter(
            (row) => row.status === 'Converted',
          ).length,
        }
      }),
    )
  }, [bidderFromDate, bidderToDate, teams])

  const sortedBidderSummaries = useMemo(() => {
    const direction = bidderSort.direction === 'asc' ? 1 : -1

    return [...bidderSummaries].sort((a, b) => {
      const diff = a[bidderSort.key] - b[bidderSort.key]
      if (diff !== 0) return diff * direction
      return a.bidderName.localeCompare(b.bidderName)
    })
  }, [bidderSort, bidderSummaries])

  const totalBudget = filteredClientRows.reduce((sum, row) => {
    const parsed = Number(row.budget.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? sum + parsed : sum
  }, 0)
  const totalQuotation = filteredClientRows.reduce((sum, row) => {
    const parsed = Number(row.quotation.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? sum + parsed : sum
  }, 0)
  const totalBids = bidderSummaries.reduce(
    (sum, bidder) => sum + bidder.totalBids,
    0,
  )
  const totalConverted = bidderSummaries.reduce(
    (sum, bidder) => sum + bidder.totalClientConverted,
    0,
  )

  const changeBidderSort = (key: BidderSortKey) => {
    setBidderSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }))
  }

  const sortArrow = (key: BidderSortKey) => {
    if (bidderSort.key !== key) return '↕'
    return bidderSort.direction === 'desc' ? '↓' : '↑'
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setData(null)
    setError('')
  }

  if (!user) {
    return <FinanceLogin onLogin={setUser} />
  }

  if (loading) {
    return (
      <main className="sheet">
        <div className="toolbar">
          <img
            className="toolbar-brand"
            src="/10turtle-wordmark.svg"
            alt="10turtle"
          />
        </div>
        <div className="state-panel">Loading finance dashboard...</div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="sheet">
        <div className="toolbar">
          <img
            className="toolbar-brand"
            src="/10turtle-wordmark.svg"
            alt="10turtle"
          />
        </div>
        <div className="state-panel error">{error}</div>
      </main>
    )
  }

  return (
    <main className="sheet">
      <div className="toolbar">
        <img
          className="toolbar-brand"
          src="/10turtle-wordmark.svg"
          alt="10turtle"
        />
        <button className="btn ghost" type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <header className="masthead">
        <span className="kicker">Finance department</span>
        <h1 className="report-title">Finance Dashboard</h1>
        <p className="report-sub">
          Client billing rows and bidder totals from existing sales data.
        </p>
        <div className="accent-rule"></div>
      </header>

      <section>
        <div className="sec-head">
          <span className="sec-num">01</span>
          <span className="sec-label">Snapshot</span>
        </div>
        <h2 className="sec-title">Finance overview</h2>
        <div className="stats grid-4">
          <div className="stat">
            <div className="s-lab">Client rows</div>
            <div className="s-row">
              <div className="big">{filteredClientRows.length}</div>
            </div>
            <div className="s-sub">All visible client entries</div>
          </div>
          <div className="stat">
            <div className="s-lab">Total bids</div>
            <div className="s-row">
              <div className="big">{totalBids.toLocaleString()}</div>
            </div>
            <div className="s-sub">From daily bid counts</div>
          </div>
          <div className="stat">
            <div className="s-lab">Quotation</div>
            <div className="s-row">
              <span className="cur">$</span>
              <div className="big">{totalQuotation.toLocaleString()}</div>
            </div>
            <div className="s-sub">Quoted value on rows</div>
          </div>
          <div className="stat accent">
            <div className="s-lab">Converted</div>
            <div className="s-row">
              <div className="big">{totalConverted}</div>
            </div>
            <div className="s-sub">
              Budget ${totalBudget.toLocaleString()}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="sec-head">
          <span className="sec-num">02</span>
          <span className="sec-label">Client ledger</span>
        </div>
        <h2 className="sec-title">Client billing overview</h2>
        <p className="sec-note">
          Every client row with finance-facing billing and conversion fields.
        </p>
        <div className="finance-filter">
          <label className="date-filter-field">
            <span className="f-lab">From</span>
            <input
              className="dt"
              type="date"
              value={clientFromDate}
              onChange={(event) => {
                setClientFromDate(event.target.value)
                setClientPage(1)
              }}
            />
          </label>
          <label className="date-filter-field">
            <span className="f-lab">To</span>
            <input
              className="dt"
              type="date"
              value={clientToDate}
              onChange={(event) => {
                setClientToDate(event.target.value)
                setClientPage(1)
              }}
            />
          </label>
          <button
            className="btn mini ghost"
            type="button"
            onClick={() => {
              setClientFromDate('')
              setClientToDate('')
              setClientPage(1)
            }}
          >
            Clear
          </button>
        </div>
        <div className="wrapscroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: '16%' }}>Bidder name</th>
                <th style={{ width: '11%' }}>Date</th>
                <th style={{ width: '18%' }}>Client name</th>
                <th style={{ width: '12%' }}>Converted on</th>
                <th className="r" style={{ width: '11%' }}>
                  Budget
                </th>
                <th className="r" style={{ width: '11%' }}>
                  Quotation
                </th>
                <th className="r" style={{ width: '11%' }}>
                  Hours/week
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedClientRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.bidderName}</td>
                  <td>{row.date}</td>
                  <td>{row.clientName}</td>
                  <td>{row.convertedOn}</td>
                  <td className="r">{row.budget}</td>
                  <td className="r">{row.quotation}</td>
                  <td className="r">{row.hoursWeek}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <div className="pagination-meta">
            Showing {filteredClientRows.length === 0 ? 0 : (currentClientPage - 1) * CLIENT_LEDGER_PAGE_SIZE + 1}
            -
            {Math.min(
              currentClientPage * CLIENT_LEDGER_PAGE_SIZE,
              filteredClientRows.length,
            )}{' '}
            of {filteredClientRows.length}
          </div>
          <div className="pagination-actions">
            <button
              className="btn mini ghost"
              type="button"
              onClick={() => setClientPage((page) => Math.max(1, page - 1))}
              disabled={currentClientPage === 1}
            >
              Prev
            </button>
            <span className="pagination-page">
              Page {currentClientPage} of {clientPageCount}
            </span>
            <button
              className="btn mini ghost"
              type="button"
              onClick={() =>
                setClientPage((page) => Math.min(clientPageCount, page + 1))
              }
              disabled={currentClientPage === clientPageCount}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section>
        <div className="sec-head">
          <span className="sec-num">03</span>
          <span className="sec-label">Bidder totals</span>
        </div>
        <h2 className="sec-title">Bidder finance summary</h2>
        <p className="sec-note">
          Bid counts, responses, and converted client totals by bidder.
        </p>
        <div className="finance-filter">
          <label className="date-filter-field">
            <span className="f-lab">From</span>
            <input
              className="dt"
              type="date"
              value={bidderFromDate}
              onChange={(event) => setBidderFromDate(event.target.value)}
            />
          </label>
          <label className="date-filter-field">
            <span className="f-lab">To</span>
            <input
              className="dt"
              type="date"
              value={bidderToDate}
              onChange={(event) => setBidderToDate(event.target.value)}
            />
          </label>
          <button
            className="btn mini ghost"
            type="button"
            onClick={() => {
              setBidderFromDate('')
              setBidderToDate('')
            }}
          >
            Clear
          </button>
        </div>
        <div className="wrapscroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Bidder name</th>
                <th className="c" style={{ width: '20%' }}>
                  <button
                    className="sort-btn"
                    type="button"
                    onClick={() => changeBidderSort('totalBids')}
                  >
                    Total bids <span>{sortArrow('totalBids')}</span>
                  </button>
                </th>
                <th className="c" style={{ width: '20%' }}>
                  <button
                    className="sort-btn"
                    type="button"
                    onClick={() => changeBidderSort('totalResponses')}
                  >
                    Total response <span>{sortArrow('totalResponses')}</span>
                  </button>
                </th>
                <th className="c" style={{ width: '20%' }}>
                  <button
                    className="sort-btn"
                    type="button"
                    onClick={() => changeBidderSort('totalClientConverted')}
                  >
                    Total client converted{' '}
                    <span>{sortArrow('totalClientConverted')}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedBidderSummaries.map((bidder) => (
                <tr key={bidder.id}>
                  <td>{bidder.bidderName}</td>
                  <td className="c">{bidder.totalBids.toLocaleString()}</td>
                  <td className="c">
                    {bidder.totalResponses.toLocaleString()}
                  </td>
                  <td className="c">
                    {bidder.totalClientConverted.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export default App
