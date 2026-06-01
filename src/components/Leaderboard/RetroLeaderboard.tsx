import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Crown,
  Plus,
  Trash2,
  Trophy,
} from 'lucide-react'
import type { HallOfFame, HallOfFameEntry } from '@/types'
import { DEFAULT_HALL_TITLE, moveEntry } from '@/lib/hallOfFame'
import { generateId } from '@/lib/utils'

interface RetroLeaderboardProps {
  hall: HallOfFame
  isGm: boolean
  fillHeight?: boolean
  onUpdate?: (hall: HallOfFame, password: string) => void
}

const LEADERBOARD_PASSWORD = 'скибиди дания швеция'

function normalizePassword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function RankBadge({ rank }: { rank: number }) {
  const label = rank === 1 ? 'I' : rank === 2 ? 'II' : rank === 3 ? 'III' : String(rank)
  const style =
    rank === 1
      ? 'vng-retro-rank--gold'
      : rank === 2
        ? 'vng-retro-rank--silver'
        : rank === 3
          ? 'vng-retro-rank--bronze'
          : 'vng-retro-rank--plain'

  return <span className={`vng-retro-rank ${style}`}>{label}</span>
}

function HallRowView({ entry, rank }: { entry: HallOfFameEntry; rank: number }) {
  return (
    <li className={`vng-retro-row ${rank === 1 ? 'vng-retro-row--first' : ''}`}>
      <RankBadge rank={rank} />
      <div className="vng-retro-row__name min-w-0">
        <span className="block truncate uppercase tracking-wide">{entry.name}</span>
        {entry.label ? (
          <span className="block text-sm text-vng-retro-dim truncate normal-case">{entry.label}</span>
        ) : null}
      </div>
      <span className="vng-retro-row__pixel" aria-hidden>
        {rank === 1 ? '★' : '·'}
      </span>
    </li>
  )
}

export function RetroLeaderboard({ hall, isGm, fillHeight, onUpdate }: RetroLeaderboardProps) {
  const [draft, setDraft] = useState(hall)
  const [newName, setNewName] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlockedPassword, setUnlockedPassword] = useState<string | null>(null)

  useEffect(() => {
    setDraft(hall)
  }, [hall])

  const push = useCallback(
    (next: HallOfFame) => {
      setDraft(next)
      if (unlockedPassword) onUpdate?.(next, unlockedPassword)
    },
    [onUpdate, unlockedPassword]
  )

  const gmUnlocked = isGm && Boolean(unlockedPassword)

  function handleTitleBlur() {
    const title = draft.title.trim().slice(0, 80) || DEFAULT_HALL_TITLE
    if (title !== hall.title) push({ ...draft, title })
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    const label = newLabel.trim()
    const entry: HallOfFameEntry = {
      id: generateId(),
      name: name.slice(0, 48),
      ...(label ? { label: label.slice(0, 80) } : {}),
    }
    push({ ...draft, entries: [...draft.entries, entry] })
    setNewName('')
    setNewLabel('')
  }

  function updateEntry(id: string, patch: Partial<HallOfFameEntry>) {
    push({
      ...draft,
      entries: draft.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
  }

  function removeEntry(id: string) {
    push({ ...draft, entries: draft.entries.filter((e) => e.id !== id) })
  }

  function shift(id: string, dir: -1 | 1) {
    push({ ...draft, entries: moveEntry(draft.entries, id, dir) })
  }

  function unlockEditing() {
    if (normalizePassword(passwordInput) !== normalizePassword(LEADERBOARD_PASSWORD)) {
      setPasswordError('Неверный пароль')
      return
    }
    setPasswordError(null)
    setUnlockedPassword(passwordInput)
  }

  const display = gmUnlocked ? draft : hall
  const title = display.title || DEFAULT_HALL_TITLE

  return (
    <section
      className={`vng-retro-panel vng-retro-panel--arcade flex flex-col ${fillHeight ? 'h-full min-h-0' : ''}`}
      aria-label="Зал славы"
    >
      <header className="vng-retro-panel__hero shrink-0">
        <div className="flex items-start gap-2">
          <Trophy size={22} className="text-vng-retro-gold shrink-0 vng-retro-icon-pulse" />
          <div className="min-w-0 flex-1">
            {gmUnlocked ? (
              <input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                onBlur={handleTitleBlur}
                maxLength={80}
                className="vng-retro-input vng-retro-title w-full text-sm sm:text-base"
                aria-label="Название зала славы"
              />
            ) : (
              <h2 className="vng-retro-title text-sm sm:text-base tracking-wider">{title}</h2>
            )}
            <p className="text-xs sm:text-sm text-vng-retro-dim font-mono mt-1 vng-retro-blink-sub">
              ▮ ARCADE HALL · {gmUnlocked ? 'GM EDIT' : isGm ? 'LOCKED' : 'PLAYER VIEW'}
            </p>
          </div>
          {isGm ? <Crown size={16} className="text-vng-retro-gold shrink-0 mt-1" aria-hidden /> : null}
        </div>
        {gmUnlocked ? (
          <p className="text-sm text-vng-retro-phosphor/90 mt-2 leading-relaxed">
            Введите имена вручную и расставьте места стрелками. Все игроки видят тот же список.
          </p>
        ) : isGm ? (
          <p className="text-sm text-vng-retro-phosphor/90 mt-2 leading-relaxed">
            Редактирование заблокировано паролем.
          </p>
        ) : (
          <p className="text-sm text-vng-retro-phosphor/80 mt-2">
            Рейтинг расставил мастер игры.
          </p>
        )}
      </header>

      <div className={`vng-retro-panel__body flex-1 min-h-0 ${fillHeight ? 'overflow-y-auto' : ''}`}>
        {display.entries.length === 0 ? (
          <div className="vng-retro-empty">
            <p className="vng-retro-title text-xs mb-2">ПУСТОЙ ЗАЛ</p>
            <p className="text-xs text-vng-retro-dim font-mono">
              {isGm ? 'Добавьте первого героя ниже…' : 'Мастер ещё не заполнил таблицу.'}
            </p>
          </div>
        ) : gmUnlocked ? (
          <ol className="vng-retro-board__list">
            {draft.entries.map((entry, i) => {
              const rank = i + 1
              return (
                <li key={entry.id} className="vng-retro-edit-row">
                  <RankBadge rank={rank} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      value={entry.name}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          entries: d.entries.map((x) =>
                            x.id === entry.id ? { ...x, name: e.target.value } : x
                          ),
                        }))
                      }
                      onBlur={() => {
                        const row = draft.entries.find((x) => x.id === entry.id)
                        if (row?.name.trim()) updateEntry(entry.id, { name: row.name.trim().slice(0, 48) })
                      }}
                      placeholder="Имя героя"
                      maxLength={48}
                      className="vng-retro-input w-full"
                    />
                    <input
                      value={entry.label ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          entries: d.entries.map((x) =>
                            x.id === entry.id ? { ...x, label: e.target.value } : x
                          ),
                        }))
                      }
                      onBlur={() => {
                        const row = draft.entries.find((x) => x.id === entry.id)
                        const label = row?.label?.trim()
                        updateEntry(entry.id, { label: label || undefined })
                      }}
                      placeholder="Подпись (необязательно)"
                      maxLength={80}
                      className="vng-retro-input w-full text-sm opacity-90"
                    />
                  </div>
                  <div className="vng-retro-edit-actions shrink-0">
                    <button
                      type="button"
                      className="vng-retro-icon-btn"
                      onClick={() => shift(entry.id, -1)}
                      disabled={rank === 1}
                      aria-label="Выше"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="vng-retro-icon-btn"
                      onClick={() => shift(entry.id, 1)}
                      disabled={rank === draft.entries.length}
                      aria-label="Ниже"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="vng-retro-icon-btn vng-retro-icon-btn--danger"
                      onClick={() => removeEntry(entry.id)}
                      aria-label="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <ol className="vng-retro-board__list vng-retro-board--tall">
            {hall.entries.map((entry, i) => (
              <HallRowView key={entry.id} entry={entry} rank={i + 1} />
            ))}
          </ol>
        )}
      </div>

      {isGm ? (
        <footer className="vng-retro-panel__footer shrink-0 space-y-2">
          {!gmUnlocked && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Пароль для редактирования…"
                className="vng-retro-input flex-1"
              />
              <button type="button" className="vng-retro-btn shrink-0" onClick={unlockEditing}>
                Разблокировать
              </button>
            </div>
          )}
          {passwordError && <p className="text-xs text-vng-danger font-mono">{passwordError}</p>}
          {gmUnlocked && (
            <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Новое имя…"
                maxLength={48}
                className="vng-retro-input flex-1"
              />
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Подпись…"
                maxLength={80}
                className="vng-retro-input flex-1 sm:max-w-[40%]"
              />
              <button type="submit" className="vng-retro-btn shrink-0" disabled={!newName.trim()}>
                <Plus size={14} />
                <span>Добавить</span>
              </button>
            </form>
          )}
        </footer>
      ) : (
        <footer className="vng-retro-panel__footer shrink-0 text-center">
          <span className="text-xs font-mono text-vng-retro-dim uppercase tracking-[0.2em] vng-retro-blink-sub">
            ▮▯ PRESS START TO BELIEVE
          </span>
        </footer>
      )}
    </section>
  )
}
