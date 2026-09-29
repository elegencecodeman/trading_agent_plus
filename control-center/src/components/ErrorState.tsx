import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title,
  description,
  onRetry,
}: ErrorStateProps) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-negative/30 bg-negative/10 text-negative">
        <AlertTriangle className="h-5 w-5" size={20} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title ?? t('error.defaultTitle')}</p>
        <p className="mx-auto max-w-sm text-xs leading-5 text-ink-secondary">{description ?? t('error.defaultDesc')}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-app transition-colors hover:bg-accent/90"
        >
          <RotateCcw className="h-3.5 w-3.5" size={14} />
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}
