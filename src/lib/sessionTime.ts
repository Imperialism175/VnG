/** Момент старта сессии комнаты (создание комнаты на сервере). */
export function getRoomSessionStartMs(createdAt?: string): number {
  if (!createdAt) return Date.now()
  const t = Date.parse(createdAt)
  return Number.isFinite(t) ? t : Date.now()
}

/** Формат: MM:SS или H:MM:SS при длинной сессии. */
export function formatSessionElapsed(startMs: number, nowMs = Date.now()): string {
  const totalSec = Math.max(0, Math.floor((nowMs - startMs) / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}
