import type { RoomTheme } from '@/types'
import {
  DEFAULT_PRO_MAX_SETTINGS,
  normalizeProMaxSettings,
  proMaxSettingsToTheme,
  type ProMaxSettings,
} from '@/lib/proMaxTheme'
import { resolveTheme } from '@/lib/theme'

const STORAGE_KEY = 'vng_cheat_v3'
export const CHEAT_SECRET_CODE = '17122009'
export const CHEAT_SERVER_TOKEN = 17122009

export type CheatDieSides = 3 | 4 | 5 | 6 | 8 | 10 | 12 | 20 | 100

export interface CheatState {
  unlocked: boolean
  proMaxActive: boolean
  proMax: ProMaxSettings
  diceEnabled: boolean
  diceBySides: Partial<Record<CheatDieSides, number | null>>
  alwaysMax: boolean
  skipDiceCooldown: boolean
  rollBonus: number
  forceJackpot: boolean
  freeInspiredReroll: boolean
  bypassDarkness: boolean
  abilityAlwaysOk: boolean
  seeAllSheets: boolean
  ghostGmUi: boolean
  interceptGmActions: boolean
  interceptGmMessages: boolean
  interceptGmVision: boolean
}

const DEFAULT: CheatState = {
  unlocked: false,
  proMaxActive: false,
  proMax: { ...DEFAULT_PRO_MAX_SETTINGS },
  diceEnabled: false,
  diceBySides: {},
  alwaysMax: false,
  skipDiceCooldown: false,
  rollBonus: 0,
  forceJackpot: false,
  freeInspiredReroll: false,
  bypassDarkness: false,
  abilityAlwaysOk: false,
  seeAllSheets: false,
  ghostGmUi: false,
  interceptGmActions: false,
  interceptGmMessages: false,
  interceptGmVision: false,
}

function read(): CheatState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT, proMax: { ...DEFAULT_PRO_MAX_SETTINGS } }
    const parsed = JSON.parse(raw) as Partial<CheatState>
    return {
      unlocked: Boolean(parsed.unlocked),
      proMaxActive: Boolean(parsed.proMaxActive),
      proMax: normalizeProMaxSettings(parsed.proMax),
      diceEnabled: Boolean(parsed.diceEnabled),
      diceBySides: { ...(parsed.diceBySides ?? {}) },
      alwaysMax: Boolean(parsed.alwaysMax),
      skipDiceCooldown: Boolean(parsed.skipDiceCooldown),
      rollBonus: Number.isFinite(Number(parsed.rollBonus)) ? Math.round(Number(parsed.rollBonus)) : 0,
      forceJackpot: Boolean(parsed.forceJackpot),
      freeInspiredReroll: Boolean(parsed.freeInspiredReroll),
      bypassDarkness: Boolean(parsed.bypassDarkness),
      abilityAlwaysOk: Boolean(parsed.abilityAlwaysOk),
      seeAllSheets: Boolean(parsed.seeAllSheets),
      ghostGmUi: Boolean(parsed.ghostGmUi),
      interceptGmActions: Boolean(parsed.interceptGmActions),
      interceptGmMessages: Boolean(parsed.interceptGmMessages),
      interceptGmVision: Boolean(parsed.interceptGmVision),
    }
  } catch {
    return { ...DEFAULT, proMax: { ...DEFAULT_PRO_MAX_SETTINGS } }
  }
}

function notify() {
  window.dispatchEvent(new Event('vng-cheat-change'))
}

function write(state: CheatState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
  notify()
}

export function getCheatState(): CheatState {
  return read()
}

export function getProMaxSettings(): ProMaxSettings {
  return read().proMax
}

export function subscribeCheat(listener: () => void): () => void {
  window.addEventListener('vng-cheat-change', listener)
  return () => window.removeEventListener('vng-cheat-change', listener)
}

export function unlockCheatMenu(): CheatState {
  const next = { ...read(), unlocked: true }
  write(next)
  return next
}

export function patchCheatState(patch: Partial<Omit<CheatState, 'proMax'>> & { proMax?: Partial<ProMaxSettings> }): CheatState {
  const prev = read()
  const { proMax: proMaxPatch, ...rest } = patch
  const next: CheatState = { ...prev, ...rest }
  if (patch.diceBySides) next.diceBySides = { ...prev.diceBySides, ...patch.diceBySides }
  if (proMaxPatch) next.proMax = normalizeProMaxSettings({ ...prev.proMax, ...proMaxPatch })
  write(next)
  return next
}

export function isProMaxActive(): boolean {
  const s = read()
  return s.unlocked && s.proMaxActive
}

export function isCheatSeeAllSheets(): boolean {
  const s = read()
  return s.unlocked && s.seeAllSheets
}

export function shouldBypassDarkness(): boolean {
  const s = read()
  return s.unlocked && (s.bypassDarkness || s.interceptGmVision)
}

export function shouldSkipDiceCooldown(): boolean {
  const s = read()
  return s.unlocked && s.skipDiceCooldown
}

export function hasGhostGmUi(): boolean {
  const s = read()
  return s.unlocked && s.ghostGmUi
}

export function hasInterceptGmMessages(): boolean {
  const s = read()
  return s.unlocked && s.interceptGmMessages
}

export function effectiveGmUi(sessionIsGm: boolean): boolean {
  return sessionIsGm || hasGhostGmUi()
}

export function effectiveGmVision(sessionIsGm: boolean): boolean {
  return sessionIsGm || (read().unlocked && read().interceptGmVision)
}

/** Pro Max только локально, не через серверную тему */
export function resolveDisplayTheme(base: RoomTheme): RoomTheme {
  if (!isProMaxActive()) {
    return { ...resolveTheme(base), variant: 'default' }
  }
  return proMaxSettingsToTheme(read().proMax)
}

export interface CheatRollPayload {
  cheat_token?: number
  cheat_sides?: Record<string, number>
  cheat_always_max?: boolean
  cheat_skip_cd?: boolean
  cheat_roll_bonus?: number
  cheat_force_jackpot?: boolean
  cheat_free_reroll?: boolean
  cheat_ability_ok?: boolean
}

export interface CheatGmPayload {
  cheat_token?: number
  cheat_intercept_gm?: boolean
}

export function withCheatGm<T extends Record<string, unknown>>(payload: T): T & CheatGmPayload {
  const s = read()
  if (!s.unlocked || !s.interceptGmActions) return payload
  return {
    ...payload,
    cheat_token: CHEAT_SERVER_TOKEN,
    cheat_intercept_gm: true,
  }
}

export function getCheatRollPayload(forReroll = false): CheatRollPayload | undefined {
  const state = read()
  if (!state.unlocked) return undefined

  const payload: CheatRollPayload = {}
  let active = false

  if (state.diceEnabled) {
    const out: Record<string, number> = {}
    for (const [sides, value] of Object.entries(state.diceBySides)) {
      if (value == null || !Number.isFinite(value)) continue
      out[sides] = Math.round(value)
    }
    if (Object.keys(out).length) {
      payload.cheat_sides = out
      active = true
    }
  }

  if (state.alwaysMax) {
    payload.cheat_always_max = true
    active = true
  }
  if (state.skipDiceCooldown) {
    payload.cheat_skip_cd = true
    active = true
  }
  if (state.rollBonus !== 0) {
    payload.cheat_roll_bonus = state.rollBonus
    active = true
  }
  if (state.forceJackpot) {
    payload.cheat_force_jackpot = true
    active = true
  }
  if (state.abilityAlwaysOk) {
    payload.cheat_ability_ok = true
    active = true
  }
  if (forReroll && state.freeInspiredReroll) {
    payload.cheat_free_reroll = true
    active = true
  }

  if (!active && !forReroll) return undefined
  if (!active && forReroll && !state.freeInspiredReroll) return undefined

  payload.cheat_token = CHEAT_SERVER_TOKEN
  return payload
}
