/**
 * Analysis history — every run the signed-in user has executed, persisted in
 * the backend database.
 *
 * Guests get a sign-in prompt instead of data (history is per-account, so
 * there is nothing to show without a token). Selecting a row opens a detail
 * drawer with the decision prose and the stored dashboard snapshot — the same
 * numbers the Overview showed at the time of the run, read from the database
 * rather than recomputed.
 */

import { useCallback, useEffect, useState } from 'react'
import { FileText, History, Loader2, LogIn, RefreshCw, X } from 'lucide-react'
import { fetchAnalyses, fetchAnalysis } from '../lib/api'
import { authErrorMessage, useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { cn } from '../lib/cn'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { StatusBadge, sideIcon, sideTone } from './StatusBadge'
import type { AnalysisDetail, AnalysisSummary } from '../types'

/** Five-tier rating → badge tone, kept in sync with the backend's scale. */
function ratingTone(rating: string) {
  if (rating === 'Buy' || rating === 'Overweight') return 'positive' as const
  if (rating === 'Sell' || rating === 'Underweight') return 'negative' as const
  return 'neutral' as const
}

function formatWhen(iso: string): string {
  // Stored naive-UTC; render in the viewer's local time.
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

export function HistoryView() {
  const { t } = useI18n()
  const { user, requireAuth } = useAuth()
  const [rows, setRows] = useState<AnalysisSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AnalysisDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAnalyses(100)
      setRows(res.items)
    } catch (err) {
      setError(authErrorMessage(err, t('history.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [user, t])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = async (row: AnalysisSummary) => {
    setDetailLoading(true)
    setSelected({ ...row, strategy: '', note: '', provider: null, deep_think_llm: null, quick_think_llm: null, output_language: null, dashboard: null })
    try {
      setSelected(await fetchAnalysis(row.id))
    } catch (err) {
      setError(authErrorMessage(err, t('history.loadFailed')))
      setSelected(null)
    } finally {
      setDetailLoading(false)
    }
  }

  /* ---------------------------------------------------------------- guests */
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
        <Header count={null} onRefresh={() => requireAuth()} refreshDisabled />
        <div className="mt-4 rounded-xl border border-line bg-surface">
          <EmptyState
            icon={LogIn}
            title={t('history.signInTitle')}
            description={t('history.signInDesc')}
            actionLabel={t('auth.loginAction')}
            onAction={() => requireAuth()}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-6">
      <Header count={rows.length} onRefresh={() => void load()} refreshDisabled={loading} />

      <div className="mt-4 rounded-xl border border-line bg-surface p-5">
        {error && (
          <div className="mb-4">
            <ErrorState description={error} onRetry={() => void load()} />
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-ink-muted">
            <Loader2 size={14} className="animate-spin" />
            {t('history.loading')}
          </div>
        ) : rows.length === 0 && !error ? (
          <EmptyState
            icon={History}
            title={t('history.emptyTitle')}
            description={t('history.emptyDesc')}
          />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['ticker', 'rating', 'side', 'confidence', 'range', 'when'].map((col) => (
                    <th
                      key={col}
                      className="pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wide text-ink-muted"
                    >
                      {t(`history.col.${col}`)}
                    </th>
                  ))}
                  <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t('history.col.detail')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line/50 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-4 text-xs font-semibold text-ink">{row.ticker}</td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge tone={ratingTone(row.rating)} label={row.rating} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge tone={sideTone(row.side)} label={row.side} icon={sideIcon(row.side)} />
                    </td>
                    <td className="tabular py-2.5 pr-4 text-xs text-ink-secondary">
                      {row.confidence != null ? `${Math.round(row.confidence * 100)}%` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-ink-secondary">{row.range ?? '—'}</td>
                    <td className="tabular py-2.5 pr-4 text-xs text-ink-muted">{formatWhen(row.created_at)}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => void openDetail(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-ink-secondary/40 hover:text-ink"
                      >
                        <FileText size={12} />
                        {t('history.view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetailDrawer
        detail={selected}
        loading={detailLoading}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

function Header({
  count,
  onRefresh,
  refreshDisabled,
}: {
  count: number | null
  onRefresh: () => void
  refreshDisabled: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t('history.title')}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {count === null ? t('history.subtitle') : t('history.count', { count })}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshDisabled}
        title={t('history.refresh')}
        aria-label={t('history.refresh')}
        className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-2.5 py-2 text-ink-secondary transition-colors hover:border-ink-secondary/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RefreshCw size={14} className={cn(refreshDisabled && 'animate-spin')} />
      </button>
    </div>
  )
}

function DetailDrawer({
  detail,
  loading,
  onClose,
}: {
  detail: AnalysisDetail | null
  loading: boolean
  onClose: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    if (!detail) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [detail, onClose])

  if (!detail) return null

  const metrics = detail.dashboard?.metrics ?? []
  const indicators = detail.dashboard?.indicators ?? []

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('history.detailTitle', { ticker: detail.ticker })}
        className="absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in-right flex-col border-l border-line bg-app shadow-drawer"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">{detail.ticker}</h2>
              <StatusBadge tone={ratingTone(detail.rating)} label={detail.rating} />
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {detail.trade_date} · {detail.range ?? '—'} · {formatWhen(detail.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <Loader2 size={13} className="animate-spin" />
              {t('history.loading')}
            </div>
          ) : (
            <>
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('history.decision')}
                </h3>
                <p className="whitespace-pre-wrap text-xs leading-5 text-ink-secondary">
                  {detail.note || t('history.noNote')}
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('history.runConfig')}
                </h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <Row label={t('config.model')} value={detail.deep_think_llm ?? '—'} />
                  <Row label={t('model.quick')} value={detail.quick_think_llm ?? '—'} />
                  <Row label={t('model.provider')} value={detail.provider ?? '—'} />
                  <Row label={t('config.language')} value={detail.output_language ?? '—'} />
                </dl>
              </section>

              {metrics.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t('history.snapshot')}
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    {metrics.slice(0, 4).map((m) => (
                      <Row key={m.id} label={m.label} value={m.value} />
                    ))}
                  </dl>
                </section>
              )}

              {indicators.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t('monitor.indicators')}
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    {indicators.map((ind) => (
                      <Row key={ind.name} label={ind.name} value={String(ind.value ?? '—')} />
                    ))}
                  </dl>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line/40 pb-1.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular font-medium text-ink">{value}</dd>
    </div>
  )
}
