import type { HallOfFame, HallOfFameEntry } from '@/types'
import { generateId } from '@/lib/utils'

export const DEFAULT_HALL_TITLE = 'ЗАЛ СЛАВЫ'

export function normalizeHallOfFame(raw: unknown): HallOfFame {
  if (!raw || typeof raw !== 'object') {
    return { title: DEFAULT_HALL_TITLE, entries: [] }
  }
  const h = raw as Record<string, unknown>
  const title = String(h.title ?? DEFAULT_HALL_TITLE).trim().slice(0, 80) || DEFAULT_HALL_TITLE
  const entries: HallOfFameEntry[] = []
  if (Array.isArray(h.entries)) {
    for (const item of h.entries.slice(0, 24)) {
      if (!item || typeof item !== 'object') continue
      const e = item as Record<string, unknown>
      const name = String(e.name ?? '').trim().slice(0, 48)
      if (!name) continue
      const labelRaw = String(e.label ?? e.note ?? '').trim().slice(0, 80)
      entries.push({
        id: String(e.id ?? generateId()),
        name,
        ...(labelRaw ? { label: labelRaw } : {}),
      })
    }
  }
  return { title, entries }
}

export function moveEntry(entries: HallOfFameEntry[], id: string, dir: -1 | 1): HallOfFameEntry[] {
  const i = entries.findIndex((e) => e.id === id)
  if (i < 0) return entries
  const j = i + dir
  if (j < 0 || j >= entries.length) return entries
  const next = [...entries]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
