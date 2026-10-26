import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ARCADE_ALPHABET, normalizeArcadeNick } from '@/lib/arcadeNick'

function shiftArcadeChar(current: string, step: 1 | -1): string {
  const idx = ARCADE_ALPHABET.indexOf(current)
  const base = idx >= 0 ? idx : 0
  const next = (base + step + ARCADE_ALPHABET.length) % ARCADE_ALPHABET.length
  return ARCADE_ALPHABET[next]
}

export function ArcadeNickPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const chars = normalizeArcadeNick(value).split('')
  const [typed, setTyped] = useState('')
  return (
    <div className="vng-card vng-home-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-vng-muted mb-2">Ник игрока (3 символа)</p>
      <div className="grid grid-cols-3 gap-2">
        {chars.map((ch, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const next = [...chars]
                next[idx] = shiftArcadeChar(next[idx], 1)
                onChange(next.join(''))
              }}
            >
              ▲
            </Button>
            <div className="w-full text-center py-2 border border-vng-border bg-vng-bg font-bold text-lg vng-mono">
              {ch}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const next = [...chars]
                next[idx] = shiftArcadeChar(next[idx], -1)
                onChange(next.join(''))
              }}
            >
              ▼
            </Button>
          </div>
        ))}
      </div>
      <input
        value={typed}
        onChange={(e) => {
          const clean = [...e.target.value.toUpperCase()].filter((ch) => ARCADE_ALPHABET.includes(ch)).slice(0, 3).join('')
          setTyped(clean)
          if (clean) onChange(normalizeArcadeNick(clean))
        }}
        maxLength={3}
        aria-label="Ник с клавиатуры"
        placeholder="Или напечатайте: ABC"
        className="vng-tui-input vng-home-input w-full text-sm uppercase mt-2 text-center vng-mono"
      />
      <p className="text-[11px] text-vng-muted mt-2 uppercase">Итоговый ник: <span className="text-vng-amber">{chars.join('')}</span></p>
    </div>
  )
}
