import type { RoomTheme } from '@/types'
import { normalizeThemeHex, PRO_MAX_THEME, resolveTheme } from '@/lib/theme'

export type ProMaxMotion = 'off' | 'low' | 'full'
export type ProMaxRadius = 'sharp' | 'soft' | 'round'
export type ProMaxSceneShape = 'torus' | 'sphere' | 'knot' | 'dodecahedron' | 'octahedron' | 'box' | 'particles'

export interface ProMaxSettings {
  text: string
  accent: string
  bg: string
  glassOpacity: number
  blurPx: number
  glow: number
  grid: boolean
  scene3d: boolean
  sceneShape: ProMaxSceneShape
  motion: ProMaxMotion
  radius: ProMaxRadius
}

export const PRO_MAX_SCENE_SHAPES: { id: ProMaxSceneShape; label: string }[] = [
  { id: 'torus', label: 'Пончик' },
  { id: 'sphere', label: 'Сфера' },
  { id: 'knot', label: 'Узел' },
  { id: 'dodecahedron', label: '12-гранник' },
  { id: 'octahedron', label: '8-гранник' },
  { id: 'box', label: 'Куб' },
  { id: 'particles', label: 'Частицы' },
]

export const DEFAULT_PRO_MAX_SETTINGS: ProMaxSettings = {
  text: PRO_MAX_THEME.blue,
  accent: PRO_MAX_THEME.gold,
  bg: PRO_MAX_THEME.bg,
  glassOpacity: 58,
  blurPx: 16,
  glow: 48,
  grid: true,
  scene3d: true,
  sceneShape: 'torus',
  motion: 'full',
  radius: 'soft',
}

export const PRO_MAX_PRESETS: { name: string; settings: Partial<ProMaxSettings> }[] = [
  { name: 'Pro Max', settings: {} },
  {
    name: 'Aurora',
    settings: { text: '#f4f4f5', accent: '#a78bfa', bg: '#09090f', glow: 62 },
  },
  {
    name: 'Cyber',
    settings: { text: '#e2e8f0', accent: '#22d3ee', bg: '#020617', glow: 55 },
  },
  {
    name: 'Sunset',
    settings: { text: '#fff1e6', accent: '#fb7185', bg: '#1a0c0c', glow: 40 },
  },
  {
    name: 'Mono',
    settings: { text: '#fafafa', accent: '#ffffff', bg: '#111111', glow: 22, grid: false },
  },
]

export function normalizeProMaxSettings(raw?: Partial<ProMaxSettings> | null): ProMaxSettings {
  const d = DEFAULT_PRO_MAX_SETTINGS
  const motion = raw?.motion === 'off' || raw?.motion === 'low' || raw?.motion === 'full' ? raw.motion : d.motion
  const radius =
    raw?.radius === 'sharp' || raw?.radius === 'soft' || raw?.radius === 'round' ? raw.radius : d.radius
  return {
    text: normalizeThemeHex(raw?.text, d.text),
    accent: normalizeThemeHex(raw?.accent, d.accent),
    bg: normalizeThemeHex(raw?.bg, d.bg),
    glassOpacity: clampNum(raw?.glassOpacity, d.glassOpacity, 20, 90),
    blurPx: clampNum(raw?.blurPx, d.blurPx, 4, 32),
    glow: clampNum(raw?.glow, d.glow, 0, 100),
    grid: raw?.grid ?? d.grid,
    scene3d: raw?.scene3d ?? d.scene3d,
    sceneShape: PRO_MAX_SCENE_SHAPES.some((s) => s.id === raw?.sceneShape) ? (raw!.sceneShape as ProMaxSceneShape) : d.sceneShape,
    motion,
    radius,
  }
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function proMaxSettingsToTheme(settings: ProMaxSettings): RoomTheme {
  const s = normalizeProMaxSettings(settings)
  return resolveTheme({ blue: s.text, gold: s.accent, bg: s.bg, variant: 'premium' })
}

export function clearProMaxStyleVars(el: HTMLElement) {
  delete el.dataset.vngPremiumMotion
  delete el.dataset.vngPremiumRadius
  delete el.dataset.vngPremiumGrid
  delete el.dataset.vngPremiumShape
  el.style.removeProperty('--vng-premium-glass')
  el.style.removeProperty('--vng-premium-blur')
  el.style.removeProperty('--vng-premium-glow')
  el.style.removeProperty('--vng-premium-radius-sm')
  el.style.removeProperty('--vng-premium-radius-md')
  el.style.removeProperty('--vng-premium-radius-lg')
}

export function applyProMaxStyleVars(el: HTMLElement, settings: ProMaxSettings) {
  const s = normalizeProMaxSettings(settings)
  const radiusSm = s.radius === 'sharp' ? '6px' : s.radius === 'round' ? '16px' : '10px'
  const radiusMd = s.radius === 'sharp' ? '8px' : s.radius === 'round' ? '20px' : '14px'
  const radiusLg = s.radius === 'sharp' ? '10px' : s.radius === 'round' ? '26px' : '18px'

  el.dataset.vngPremiumMotion = s.motion
  el.dataset.vngPremiumRadius = s.radius
  el.dataset.vngPremiumGrid = s.grid ? '1' : '0'
  el.dataset.vngPremiumShape = s.sceneShape
  el.style.setProperty('--vng-premium-glass', String(s.glassOpacity))
  el.style.setProperty('--vng-premium-blur', `${s.blurPx}px`)
  el.style.setProperty('--vng-premium-glow', String(s.glow))
  el.style.setProperty('--vng-premium-radius-sm', radiusSm)
  el.style.setProperty('--vng-premium-radius-md', radiusMd)
  el.style.setProperty('--vng-premium-radius-lg', radiusLg)
}
