import { useEffect, useState, type ReactNode } from 'react'
import type { RoomTheme } from '@/types'
import { DEFAULT_THEME, resolveTheme } from '@/lib/theme'
import { Button } from '@/components/ui/Button'

const PRESETS: { name: string; theme: RoomTheme }[] = [
  { name: 'DOS', theme: DEFAULT_THEME },
  { name: 'Янтарь', theme: { blue: '#ffaa00', gold: '#ffcc44', bg: '#1a0a00' } },
  { name: 'Голубой', theme: { blue: '#44ccff', gold: '#88eeff', bg: '#000818' } },
  { name: 'Розовый', theme: { blue: '#ff66cc', gold: '#ffaadd', bg: '#120008' } },
  { name: 'Белый', theme: { blue: '#eeeeee', gold: '#ffffff', bg: '#111111' } },
]

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 flex-1 min-w-[88px]">
      <span className="text-xs uppercase text-vng-muted tracking-wide">{label}</span>
      {hint && <span className="text-[10px] text-vng-muted normal-case leading-tight">{hint}</span>}
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 cursor-pointer border border-vng-border bg-transparent"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-vng-bg border border-vng-border"
          maxLength={7}
          spellCheck={false}
        />
      </div>
    </label>
  )
}

interface ThemeColorEditorProps {
  title: string
  initial: RoomTheme
  /** Что подставить в черновик по кнопке «По умолчанию» */
  defaultDraft?: RoomTheme
  onApply: (theme: RoomTheme) => void
  onReset?: () => void
  showTargetSelect?: ReactNode
  extraActions?: ReactNode
}

export function ThemeColorEditor({
  title,
  initial,
  defaultDraft,
  onApply,
  onReset,
  showTargetSelect,
  extraActions,
}: ThemeColorEditorProps) {
  const draftDefault = defaultDraft ?? DEFAULT_THEME
  const [draft, setDraft] = useState<RoomTheme>(() => resolveTheme(initial))

  useEffect(() => {
    setDraft(resolveTheme(initial))
  }, [initial.blue, initial.gold, initial.bg])

  const preview = resolveTheme(draft)

  return (
    <section className="vng-panel p-3 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-vng-muted">{title}</h3>
      {showTargetSelect}
      <div
        className="border border-vng-border p-2 text-xs font-mono uppercase"
        style={{ background: preview.bg, color: preview.blue, borderColor: preview.blue }}
      >
        <span style={{ color: preview.gold }}>Превью</span> — текст и рамки
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="vng-tui-btn vng-tui-btn--ghost text-xs"
            onClick={() => setDraft(resolveTheme(p.theme))}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <ColorField
          label="Текст"
          hint="Основной цвет интерфейса"
          value={draft.blue}
          onChange={(blue) => setDraft((t) => ({ ...t, blue }))}
        />
        <ColorField
          label="Акцент"
          hint="Таймер, активные вкладки"
          value={draft.gold}
          onChange={(gold) => setDraft((t) => ({ ...t, gold }))}
        />
        <ColorField
          label="Фон"
          value={draft.bg}
          onChange={(bg) => setDraft((t) => ({ ...t, bg }))}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onApply(resolveTheme(draft))}>
          Применить
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(resolveTheme(draftDefault))}>
          По умолчанию
        </Button>
        {onReset && (
          <Button type="button" size="sm" variant="ghost" onClick={onReset}>
            Сбросить мои
          </Button>
        )}
        {extraActions}
      </div>
    </section>
  )
}
