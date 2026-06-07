import type { RoomTheme } from '@/types'

/** MS-DOS terminal — зелёный по умолчанию */
export const DEFAULT_THEME: RoomTheme = {
  blue: '#33ff33',
  gold: '#33ff33',
  bg: '#000000',
  variant: 'default',
}

/** Премиальный dark mode — стекло, яркий акцент, швейцарская сетка */
export const PRO_MAX_THEME: RoomTheme = {
  blue: '#e8eaed',
  gold: '#00f0ff',
  bg: '#0d1117',
  variant: 'premium',
}

const HEX6 = /^#([0-9a-fA-F]{6})$/

export function normalizeThemeHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const t = value.trim()
  const m = HEX6.exec(t.startsWith('#') ? t : `#${t}`)
  return m ? `#${m[1].toLowerCase()}` : fallback
}

function parseRgb(hex: string): [number, number, number] | null {
  const m = HEX6.exec(normalizeThemeHex(hex, ''))
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Смешивание двух цветов (t=0 → a, t=1 → b). */
export function mixColors(a: string, b: string, t: number): string {
  const A = parseRgb(a)
  const B = parseRgb(b)
  if (!A || !B) return a
  return rgbToHex(
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t
  )
}

export function mergeTheme(global: RoomTheme, personal?: RoomTheme | null): RoomTheme {
  if (!personal) return { ...global, variant: 'default' }
  return {
    blue: personal.blue || global.blue,
    gold: personal.gold || global.gold,
    bg: personal.bg || global.bg,
    variant: 'default',
  }
}

export function resolveTheme(theme: RoomTheme): RoomTheme {
  const fg = normalizeThemeHex(theme.blue, DEFAULT_THEME.blue)
  const bg = normalizeThemeHex(theme.bg, DEFAULT_THEME.bg)
  const gold = normalizeThemeHex(theme.gold, fg)
  const variant = theme.variant === 'premium' ? 'premium' : 'default'
  return { blue: fg, gold, bg, variant }
}

/** Применить палитру комнаты к оболочке (CSS-переменные DOS + Tailwind). */
export function applyThemeVars(el: HTMLElement, theme: RoomTheme) {
  const { blue: fg, gold: accent, bg, variant } = resolveTheme(theme)
  const muted = mixColors(fg, bg, 0.55)
  const border = mixColors(fg, bg, 0.35)
  const isPremium = variant === 'premium'
  const surface = isPremium ? mixColors(bg, '#ffffff', 0.06) : bg
  const elevated = isPremium ? mixColors(bg, '#ffffff', 0.1) : bg

  el.dataset.vngThemeVariant = variant
  el.style.setProperty('--vng-dos-bg', bg)
  el.style.setProperty('--vng-dos-fg', fg)
  el.style.setProperty('--vng-dos-accent', accent)
  el.style.setProperty('--vng-dos-muted', muted)
  el.style.setProperty('--vng-dos-border', border)

  el.style.setProperty('--color-vng-bg', bg)
  el.style.setProperty('--color-vng-surface', surface)
  el.style.setProperty('--color-vng-elevated', elevated)
  el.style.setProperty('--color-vng-retro-bg', bg)
  el.style.setProperty('--color-vng-retro-panel', bg)
  el.style.setProperty('--color-vng-text', fg)
  el.style.setProperty('--color-vng-blue', fg)
  el.style.setProperty('--color-vng-blue-soft', fg)
  el.style.setProperty('--color-vng-blue-dim', muted)
  el.style.setProperty('--color-vng-amber', accent)
  el.style.setProperty('--color-vng-amber-dim', muted)
  el.style.setProperty('--color-vng-gold', accent)
  el.style.setProperty('--color-vng-purple', fg)
  el.style.setProperty('--color-vng-purple-dim', muted)
  el.style.setProperty('--color-vng-green', fg)
  el.style.setProperty('--color-vng-danger', accent)
  el.style.setProperty('--color-vng-muted', muted)
  el.style.setProperty('--color-vng-border', border)
  el.style.setProperty('--color-vng-retro-border', fg)
  el.style.setProperty('--color-vng-retro-phosphor', fg)
  el.style.setProperty('--color-vng-retro-gold', accent)
  el.style.setProperty('--color-vng-retro-dim', muted)
}

export function resetThemeVars(el: HTMLElement) {
  applyThemeVars(el, DEFAULT_THEME)
}
