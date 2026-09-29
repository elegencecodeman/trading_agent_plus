import { FlaskConical } from 'lucide-react'
import { cn } from '../lib/cn'
import { useI18n } from '../lib/i18n'

interface DemoModeBadgeProps {
  className?: string
}

/**
 * Prominent "Demo Mode" marker — appears in the top bar and key data surfaces
 * so simulated data is never mistaken for real positions or advice.
 */
export function DemoModeBadge({ className }: DemoModeBadgeProps) {
  const { t } = useI18n()
  return (
    <span
      title={t('demo.tooltip')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-warning',
        className,
      )}
    >
      <FlaskConical className="h-3.5 w-3.5" size={14} />
      {t('demo.demoMode')}
    </span>
  )
}
