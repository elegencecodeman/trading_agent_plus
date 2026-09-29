import { Languages } from 'lucide-react'
import { Select } from './Select'

interface LanguageSelectorProps {
  languages: string[]
  value: string
  onChange: (language: string) => void
}

/** Output-language picker (full list, mirrors the CLI). */
export function LanguageSelector({ languages, value, onChange }: LanguageSelectorProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Languages className="h-3.5 w-3.5 text-ink-muted" size={14} />
      <Select
        ariaLabel="Output language"
        value={value}
        options={languages.map((l) => ({ label: l, value: l }))}
        onChange={onChange}
      />
    </div>
  )
}
