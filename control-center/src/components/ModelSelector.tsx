import { useMemo } from 'react'
import { useI18n } from '../lib/i18n'
import type { ModelOption, ProviderOption } from '../types'
import { Select, type SelectOption } from './Select'

interface ModelSelectorProps {
  providers: ProviderOption[]
  provider: string
  deepModel: string
  quickModel: string
  onChange: (patch: { provider?: string; deepModel?: string; quickModel?: string }) => void
}

type TFunc = (key: string, vars?: Record<string, string | number>) => string

function firstModel(models: ModelOption[] | undefined): string {
  return models?.find((m) => m.value !== 'custom')?.value ?? ''
}

function toOptions(models: ModelOption[] | undefined, current: string, t: TFunc): SelectOption[] {
  const opts = (models ?? [])
    .filter((m) => m.value !== 'custom')
    .map((m) => ({ label: m.label, value: m.value }))
  if (current && !opts.some((o) => o.value === current)) {
    opts.unshift({ label: t('model.current', { name: current }), value: current })
  }
  return opts
}

/** Provider + deep (thinking) + quick (fast) model pickers. */
export function ModelSelector({ providers, provider, deepModel, quickModel, onChange }: ModelSelectorProps) {
  const { t } = useI18n()
  const providerOptions: SelectOption[] = useMemo(
    () =>
      providers.map((p) => {
        const hint = p.needsSetup ? t('model.needsSetup') : p.hasKey ? '' : t('model.noKey')
        return {
          label: hint ? `${p.label} · ${hint}` : p.label,
          value: p.id,
          disabled: !p.hasKey || p.needsSetup,
        }
      }),
    [providers, t],
  )

  const active = providers.find((p) => p.id === provider)
  const deepOptions = useMemo(() => toOptions(active?.models.deep, deepModel, t), [active, deepModel, t])
  const quickOptions = useMemo(() => toOptions(active?.models.quick, quickModel, t), [active, quickModel, t])

  return (
    <div className="flex items-center gap-1.5">
      <Select
        ariaLabel={t('model.providerAria')}
        value={provider}
        options={providerOptions}
        onChange={(id) => {
          const p = providers.find((x) => x.id === id)
          onChange({ provider: id, deepModel: firstModel(p?.models.deep), quickModel: firstModel(p?.models.quick) })
        }}
      />
      <span className="text-[11px] text-ink-muted">·</span>
      <Select
        ariaLabel={t('model.deepAria')}
        value={deepModel}
        options={deepOptions}
        onChange={(v) => onChange({ deepModel: v })}
      />
      <span className="text-[11px] text-ink-muted">·</span>
      <Select
        ariaLabel={t('model.quickAria')}
        value={quickModel}
        options={quickOptions}
        onChange={(v) => onChange({ quickModel: v })}
      />
    </div>
  )
}
