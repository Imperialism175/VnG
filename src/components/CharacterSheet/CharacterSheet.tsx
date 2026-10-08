import { useCallback, useEffect, useRef, useState } from 'react'
import { Lock, RotateCw, Scroll, Trash2, Unlock, PlusCircle } from 'lucide-react'
import type { Character, CounterField, StatField, TextField } from '@/types'
import { generateId } from '@/lib/utils'
import { StatIcon } from '@/lib/statIcons'
import { Panel } from '@/components/ui/Panel'
import { SegmentedHpBar } from '@/components/ui/SegmentedHpBar'
import { Button, Input } from '@/components/ui/Button'
import {
  applySheetPreset,
  getStatEffectForCharacterSheet,
  getThresholdEffectsForCharacter,
  isCoreSpecialField,
  isSkillPointCounter,
  isResearcherSheet,
  SKILL_POINTS_COUNTER_NAME,
  resolveCharacterPresetId,
  SHEET_PRESETS,
  type StatEffectValue,
  type SheetPresetId,
} from '@/lib/characterSheets'

interface CharacterSheetProps {
  character: Character
  onChange: (character: Character) => void
  readOnly?: boolean
  gmEditing?: boolean
  /** Игрок не может менять HP/счётчики здоровья (только ГМ) */
  lockHp?: boolean
  /** Краткий просмотр — скрыты статы и особые поля */
  restrictedView?: boolean
}

const PRETTY_ASCII_TOP = '/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\/\\ '
const PRETTY_ASCII_SIDE = '||/\\\\||//\\\\||/\\\\||//\\\\||/\\\\||//\\\\||/\\\\||//\\\\'
const PRETTY_ASCII_SIDE_BLOCK = Array.from({ length: 80 }, () => PRETTY_ASCII_SIDE).join('\n')

function isHealthCounter(name: string) {
  return /здор|хп|hp/i.test(name)
}

function isInspirationCounter(name: string) {
  return /вдох|inspir/i.test(name)
}

function buildThresholdDisplayRows(
  rows: Array<{ threshold: number; effect: StatEffectValue }>,
  presetId: SheetPresetId | null
): Array<{ threshold: number; effect: StatEffectValue }> {
  if (!rows.length) return []
  if (presetId === 'casual') return rows

  const effectsByThreshold = new Map<number, StatEffectValue>()
  for (const row of rows) {
    effectsByThreshold.set(row.threshold, row.effect)
  }

  const numericThresholds = rows.map((row) => row.threshold).filter((n) => Number.isFinite(n) && n >= 1)
  if (!numericThresholds.length) return rows

  const minThreshold = Math.max(1, Math.min(...numericThresholds))
  const maxThreshold = Math.max(...numericThresholds)
  const result: Array<{ threshold: number; effect: StatEffectValue }> = []
  for (let value = minThreshold; value <= maxThreshold; value++) {
    result.push({ threshold: value, effect: effectsByThreshold.get(value) ?? 0 })
  }
  return result
}

function formatThresholdEffect(effect: StatEffectValue): string {
  if (typeof effect !== 'number' || !Number.isFinite(effect)) return String(effect)
  if (effect >= 0) return `+${effect}`
  return String(effect)
}

function isHpStat(name: string) {
  return /^(хп|здоровье|здоровье\.?)$/i.test(String(name ?? '').trim())
}

function isAbilitiesField(name: string): boolean {
  return name.trim().toLowerCase() === 'способности'
}

 function getTextFieldMaxLength(
   presetId: SheetPresetId | null,
   fieldName: string
 ): number | null {
   const normalized = String(fieldName ?? '').trim().toLowerCase()
   if (presetId === 'engineer' && normalized === 'кпк') return 45
   if (presetId === 'overcomer' && normalized === 'кузница вдохновения') return 25
   return null
 }

function isEnergyStat(name: string): boolean {
  return String(name ?? '').trim().toLowerCase() === 'энергия'
}

function isEnergyCounter(name: string): boolean {
  return String(name ?? '').trim().toLowerCase() === 'энергия'
}

function isIntellectStat(name: string): boolean {
  const normalized = String(name ?? '').trim().toLowerCase()
  return normalized === 'интеллект' || normalized === 'интелект' || normalized === 'int'
}

function isHintCounter(name: string): boolean {
  return String(name ?? '').trim().toLowerCase() === 'подсказки'
}

function getFinalStatValueForCounters(
  stat: StatField,
  sheetPresetId: string | null | undefined,
  classStatus: string
): number {
  const base = Math.round(Number(stat.value) || 0)
  const effect = getStatEffectForCharacterSheet(sheetPresetId, classStatus, base)
  const numericEffect = typeof effect === 'number' && Number.isFinite(effect) ? effect : 0
  return Math.max(0, Math.round(base + numericEffect))
}

function getHpCounterMaxFromHpStat(
  hpStatRaw: number,
  sheetPresetId: string | null | undefined,
  classStatus: string
): number {
  const spent = Math.max(0, Math.round(hpStatRaw))
  const effect = getStatEffectForCharacterSheet(sheetPresetId, classStatus, spent)
  const numericEffect = typeof effect === 'number' && Number.isFinite(effect) ? effect : 0
  return Math.max(0, Math.round(spent + numericEffect))
}

function inferBaseHpStatFromFinalMax(
  finalMax: number,
  sheetPresetId: string | null | undefined,
  classStatus: string,
  searchLimit = 2000
): number {
  const target = Math.max(0, Math.round(finalMax))
  let best = 0
  let bestDiff = Number.POSITIVE_INFINITY
  for (let spent = 0; spent <= searchLimit; spent++) {
    const candidate = getHpCounterMaxFromHpStat(spent, sheetPresetId, classStatus)
    const diff = Math.abs(candidate - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = spent
      if (diff === 0) break
    }
  }
  return best
}

function syncHintCounter(
  stats: StatField[],
  counters: CounterField[],
  sheetPresetId: string | null | undefined,
  classStatus: string
): CounterField[] {
  const intellect = stats.find((s) => isIntellectStat(s.name))
  if (!intellect) return counters
  const intellectValue = getFinalStatValueForCounters(intellect, sheetPresetId, classStatus)
  const hintMax = Math.floor(intellectValue / 5)
  const hintsIdx = counters.findIndex((c) => isHintCounter(c.name))
  if (hintsIdx >= 0) {
    return counters.map((c, i) =>
      i === hintsIdx ? { ...c, max: hintMax, current: Math.min(c.current, hintMax) } : c
    )
  }
  return [...counters, { id: generateId(), name: 'Подсказки', current: hintMax, max: hintMax }]
}

function toRoundedNumberOrNull(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

function parseAbilityLevels(value: string): Record<number, string> {
  const result: Record<number, string> = { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: '' }
  const src = String(value ?? '')
  const headerRe = /(?:^|\n)[ \t]*(?:ур(?:овень)?\.?[ \t]*)([1-7])[ \t]*:[ \t]*/gi
  const matches: Array<{ level: number; start: number; contentStart: number }> = []
  let m: RegExpExecArray | null = null
  while ((m = headerRe.exec(src)) !== null) {
    const level = Number(m[1])
    if (level < 1 || level > 7) continue
    matches.push({ level, start: m.index, contentStart: headerRe.lastIndex })
  }

  if (matches.length === 0) {
    const lines = src.split(/\r?\n/)
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      const legacy = line.match(/^(?:ур(?:овень)?\.?\s*)([1-7])\s*:\s*(.*)$/i)
      if (!legacy) continue
      const level = Number(legacy[1])
      if (level >= 1 && level <= 7) result[level] = legacy[2] ?? ''
    }
    return result
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const end = next ? next.start : src.length
    let chunk = src.slice(current.contentStart, end)
    if (chunk.startsWith('\n')) chunk = chunk.slice(1)
    if (chunk.endsWith('\n')) chunk = chunk.slice(0, -1)
    result[current.level] = chunk
  }
  return result
}

function buildAbilityLevelsTextWithMax(levels: Record<number, string>, maxLevel: number): string {
  const rows: string[] = []
  for (let i = 1; i <= maxLevel; i++) {
    rows.push(`Уровень ${i}:\n${String(levels[i] ?? '')}`)
  }
  return rows.join('\n\n')
}

const DAREDEVIL_ABILITY_KEYS = [
  'Уровень 7-1',
  'Уровень 7-2',
  'Уровень 7-3',
  'Уровень 7-4',
  'Уровень 7-5',
  'Уровень 7-6',
  'Уровень 20',
] as const

function parseDaredevilAbilityLevels(value: string): Record<string, string> {
  const src = String(value ?? '')
  const result = Object.fromEntries(DAREDEVIL_ABILITY_KEYS.map((k) => [k, ''])) as Record<string, string>
  const hasLegacyTemplate = (text: string) =>
    /ур(?:овень)?\s*1\s*:/i.test(text) &&
    /ур(?:овень)?\s*2\s*:/i.test(text) &&
    /ур(?:овень)?\s*7\s*:/i.test(text)
  const headerRe = /(?:^|\n)[ \t]*(ур(?:овень)?\s*(?:7-[1-6]|20))[ \t]*:[ \t]*/gi
  const matches: Array<{ key: string; start: number; contentStart: number }> = []
  let m: RegExpExecArray | null = null
  while ((m = headerRe.exec(src)) !== null) {
    const rawKey = String(m[1] ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const normalized =
      rawKey.startsWith('уровень') ? `Уровень ${rawKey.slice('уровень'.length).trim()}` : null
    if (!normalized || !DAREDEVIL_ABILITY_KEYS.includes(normalized as (typeof DAREDEVIL_ABILITY_KEYS)[number])) {
      continue
    }
    matches.push({ key: normalized, start: m.index, contentStart: headerRe.lastIndex })
  }
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const end = next ? next.start : src.length
    let chunk = src.slice(current.contentStart, end)
    if (chunk.startsWith('\n')) chunk = chunk.slice(1)
    if (chunk.endsWith('\n')) chunk = chunk.slice(0, -1)
    if (hasLegacyTemplate(chunk)) chunk = ''
    result[current.key] = chunk
  }
  return result
}

function buildDaredevilAbilityLevelsText(levels: Record<string, string>): string {
  return DAREDEVIL_ABILITY_KEYS.map((key) => `${key}:\n${String(levels[key] ?? '')}`).join('\n\n')
}

const CONDEMNED_ABILITY_KEYS = [
  'Уровень 1',
  'Уровень 2',
  'Уровень 3',
  'Уровень 6',
  'Уровень ∞',
] as const

function parseCondemnedAbilityLevels(value: string): Record<string, string> {
  const src = String(value ?? '')
  const result = Object.fromEntries(CONDEMNED_ABILITY_KEYS.map((k) => [k, ''])) as Record<string, string>
  const headerRe = /(?:^|\n)[ \t]*(ур(?:овень)?\s*(?:1|2|3|6|∞|inf))[ \t]*:[ \t]*/gi
  const matches: Array<{ key: string; start: number; contentStart: number }> = []
  let m: RegExpExecArray | null = null
  while ((m = headerRe.exec(src)) !== null) {
    const raw = String(m[1] ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const rawSuffix = raw.startsWith('уровень') ? raw.slice('уровень'.length).trim() : ''
    const normalizedSuffix = rawSuffix === 'inf' ? '∞' : rawSuffix
    const normalized = `Уровень ${normalizedSuffix}`
    if (!CONDEMNED_ABILITY_KEYS.includes(normalized as (typeof CONDEMNED_ABILITY_KEYS)[number])) continue
    matches.push({ key: normalized, start: m.index, contentStart: headerRe.lastIndex })
  }
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const end = next ? next.start : src.length
    let chunk = src.slice(current.contentStart, end)
    if (chunk.startsWith('\n')) chunk = chunk.slice(1)
    if (chunk.endsWith('\n')) chunk = chunk.slice(0, -1)
    result[current.key] = chunk
  }
  return result
}

function buildCondemnedAbilityLevelsText(levels: Record<string, string>): string {
  return CONDEMNED_ABILITY_KEYS.map((key) => `${key}:\n${String(levels[key] ?? '')}`).join('\n\n')
}

const INTERLEAF_ABILITY_KEYS = [
  'Уровень 1',
  'Уровень 1+',
  'Уровень 2',
  'Уровень 2+',
  'Уровень 3',
  'Уровень 3+',
  'Уровень 4',
  'Уровень 4+',
  'Уровень 5',
  'Уровень 5+',
  'Уровень 6',
  'Уровень 6+',
  'Уровень 7',
] as const

function parseInterleafAbilityLevels(value: string): Record<string, string> {
  const src = String(value ?? '')
  const result = Object.fromEntries(INTERLEAF_ABILITY_KEYS.map((k) => [k, ''])) as Record<string, string>
  const headerRe = /(?:^|\n)[ \t]*(ур(?:овень)?\s*(?:[1-7]\+?))[ \t]*:[ \t]*/gi
  const matches: Array<{ key: string; start: number; contentStart: number }> = []
  let m: RegExpExecArray | null = null
  while ((m = headerRe.exec(src)) !== null) {
    const raw = String(m[1] ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const rawSuffix = raw.startsWith('уровень') ? raw.slice('уровень'.length).trim() : ''
    const normalized = `Уровень ${rawSuffix}`
    if (!INTERLEAF_ABILITY_KEYS.includes(normalized as (typeof INTERLEAF_ABILITY_KEYS)[number])) continue
    matches.push({ key: normalized, start: m.index, contentStart: headerRe.lastIndex })
  }
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const end = next ? next.start : src.length
    let chunk = src.slice(current.contentStart, end)
    if (chunk.startsWith('\n')) chunk = chunk.slice(1)
    if (chunk.endsWith('\n')) chunk = chunk.slice(0, -1)
    result[current.key] = chunk
  }
  return result
}

function buildInterleafAbilityLevelsText(levels: Record<string, string>): string {
  return INTERLEAF_ABILITY_KEYS.map((key) => `${key}:\n${String(levels[key] ?? '')}`).join('\n\n')
}

const VESSEL_ABILITY_KEYS = [
  'Способность 1',
  'Способность 2',
  'Способность 3',
  'Способность 4',
  'Способность 5',
] as const

function parseVesselAbilityLevels(value: string): Record<string, string> {
  const src = String(value ?? '')
  const result = Object.fromEntries(VESSEL_ABILITY_KEYS.map((k) => [k, ''])) as Record<string, string>
  const headerRe = /(?:^|\n)[ \t]*(способность)[ \t]*:[ \t]*/gi
  const matches: Array<{ index: number; start: number; contentStart: number }> = []
  let m: RegExpExecArray | null = null
  while ((m = headerRe.exec(src)) !== null) {
    matches.push({ index: matches.length, start: m.index, contentStart: headerRe.lastIndex })
  }
  if (matches.length === 0) return result
  for (let i = 0; i < matches.length && i < VESSEL_ABILITY_KEYS.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]
    const end = next ? next.start : src.length
    let chunk = src.slice(current.contentStart, end)
    if (chunk.startsWith('\n')) chunk = chunk.slice(1)
    if (chunk.endsWith('\n')) chunk = chunk.slice(0, -1)
    result[VESSEL_ABILITY_KEYS[i]] = chunk
  }
  return result
}

function buildVesselAbilityLevelsText(levels: Record<string, string>): string {
  return VESSEL_ABILITY_KEYS.map((key) => `Способность:\n${String(levels[key] ?? '')}`).join('\n\n')
}

type SheetExportPayload = {
  type: 'vng-character-sheet'
  version: 1
  exported_at: string
  character: Partial<Character>
}

type EncryptedSheetEnvelope = {
  type: 'vng-character-sheet-encrypted'
  version: 2
  encrypted_at: string
  iv_b64: string
  data_b64: string
}

const SHEET_SECRET_STORAGE_KEY = 'vng_sheet_secret_v1'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function getOrCreateSheetSecret(): Uint8Array {
  const existing = window.localStorage.getItem(SHEET_SECRET_STORAGE_KEY)
  if (existing) {
    try {
      const parsed = base64ToBytes(existing)
      if (parsed.length === 32) return parsed
    } catch {
      /* ignore corrupted value */
    }
  }
  const next = new Uint8Array(32)
  window.crypto.getRandomValues(next)
  window.localStorage.setItem(SHEET_SECRET_STORAGE_KEY, bytesToBase64(next))
  return next
}

async function encryptSheetPayload(payload: SheetExportPayload): Promise<EncryptedSheetEnvelope> {
  const keyBytes = getOrCreateSheetSecret()
  const key = await window.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = new Uint8Array(12)
  window.crypto.getRandomValues(iv)
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return {
    type: 'vng-character-sheet-encrypted',
    version: 2,
    encrypted_at: new Date().toISOString(),
    iv_b64: bytesToBase64(iv),
    data_b64: bytesToBase64(new Uint8Array(encrypted)),
  }
}

async function decryptSheetPayload(envelope: EncryptedSheetEnvelope): Promise<SheetExportPayload> {
  const keyBytes = getOrCreateSheetSecret()
  const key = await window.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'])
  const iv = base64ToBytes(envelope.iv_b64)
  const data = base64ToBytes(envelope.data_b64)
  const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  const text = new TextDecoder().decode(new Uint8Array(decrypted))
  return JSON.parse(text) as SheetExportPayload
}

function toTextFields(src: unknown): TextField[] {
  if (!Array.isArray(src)) return []
  return src.map((f) => {
    const row = (f ?? {}) as Record<string, unknown>
    return {
      id: typeof row.id === 'string' && row.id.trim() ? row.id : generateId(),
      name: String(row.name ?? 'Поле'),
      value: String(row.value ?? ''),
    }
  })
}

function toStats(src: unknown): StatField[] {
  if (!Array.isArray(src)) return []
  return src.map((s) => {
    const row = (s ?? {}) as Record<string, unknown>
    return {
      id: typeof row.id === 'string' && row.id.trim() ? row.id : generateId(),
      name: String(row.name ?? 'Параметр'),
      value: String(row.value ?? '0'),
    }
  })
}

function toCounters(src: unknown): CounterField[] {
  if (!Array.isArray(src)) return []
  return src.map((c) => {
    const row = (c ?? {}) as Record<string, unknown>
    const current = Math.max(0, Math.round(Number(row.current) || 0))
    const max = Math.max(0, Math.round(Number(row.max) || 0))
    return {
      id: typeof row.id === 'string' && row.id.trim() ? row.id : generateId(),
      name: String(row.name ?? 'Счётчик'),
      current: Math.min(current, max),
      max,
    }
  })
}

function syncHpCounterFromImportedStats(character: Character): Character {
  const isDaredevil = resolveCharacterPresetId(character.sheet_preset_id ?? null, character.class_status) === 'daredevil'
  if (isDaredevil) return character

  const hpStat = character.stats.find((s) => isHpStat(s.name))
  const hpIdx = character.counters.findIndex((c) => isHealthCounter(c.name))
  if (!hpStat || hpIdx < 0) return character

  const spent = Math.max(0, Math.round(Number(hpStat.value) || 0))
  const hpMax = getHpCounterMaxFromHpStat(
    spent,
    character.sheet_preset_id ?? null,
    character.class_status
  )
  const counters = character.counters.map((c, i) =>
    i === hpIdx ? { ...c, max: hpMax, current: hpMax } : c
  )
  return { ...character, counters }
}

function buildCharacterFromImportedJson(raw: unknown, base: Character): Character | null {
  const root = (raw ?? {}) as Record<string, unknown>
  const fromWrapped =
    root.type === 'vng-character-sheet' && root.character && typeof root.character === 'object'
      ? (root.character as Record<string, unknown>)
      : root
  if (!fromWrapped || typeof fromWrapped !== 'object') return null

  const next: Character = {
    ...base,
    name: String(fromWrapped.name ?? base.name ?? ''),
    sheet_preset_id:
      typeof fromWrapped.sheet_preset_id === 'string' || fromWrapped.sheet_preset_id === null
        ? (fromWrapped.sheet_preset_id as string | null)
        : base.sheet_preset_id ?? null,
    class_status: String(fromWrapped.class_status ?? base.class_status ?? ''),
    description: String(fromWrapped.description ?? base.description ?? ''),
    text_fields: toTextFields(fromWrapped.text_fields ?? base.text_fields),
    special_field_locks: Array.isArray(fromWrapped.special_field_locks)
      ? (fromWrapped.special_field_locks as unknown[]).map((v) => String(v))
      : (base.special_field_locks ?? []),
    stat_points_locked: Boolean(fromWrapped.stat_points_locked ?? base.stat_points_locked),
    sheet_preset_locked: Boolean(fromWrapped.sheet_preset_locked ?? base.sheet_preset_locked),
    stats: toStats(fromWrapped.stats ?? base.stats),
    counters: toCounters(fromWrapped.counters ?? base.counters),
  }

  return next
}

export function CharacterSheet({
  character,
  onChange,
  readOnly,
  gmEditing,
  lockHp,
  restrictedView,
}: CharacterSheetProps) {
  const viewOnly = readOnly || restrictedView
  const canEdit = !viewOnly || Boolean(gmEditing)
  /** Игроки никогда не редактируют HP; ГМ — только без lockHp */
  const healthLocked = !gmEditing || Boolean(lockHp)
  const [local, setLocal] = useState(character)
  const canDownloadSheet = !(restrictedView && Boolean(local.is_npc) && !gmEditing)
  const [showThresholdTable, setShowThresholdTable] = useState(false)
  const [rotationStep, setRotationStep] = useState<0 | 1 | 2>(0)
  const [swapTargets, setSwapTargets] = useState<Record<string, string>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const researcherMode = isResearcherSheet(local.sheet_preset_id ?? null, local.class_status)
  const specialFieldLocks = new Set(local.special_field_locks ?? [])
  const statPointsLocked = Boolean(local.stat_points_locked)
  const sheetPresetLocked = Boolean(local.sheet_preset_locked)

  useEffect(() => {
    setLocal({
      ...character,
      counters: syncHintCounter(
        character.stats,
        character.counters,
        character.sheet_preset_id ?? null,
        character.class_status
      ),
    })
  }, [character.id, character.updated_at])

  const scheduleSave = useCallback(
    (updated: Character) => {
      setLocal(updated)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => onChange(updated), 600)
    },
    [onChange]
  )

  function updateField<K extends keyof Character>(key: K, value: Character[K]) {
    scheduleSave({ ...local, [key]: value })
  }

  async function downloadSheet() {
    try {
      const payload: SheetExportPayload = {
        type: 'vng-character-sheet',
        version: 1,
        exported_at: new Date().toISOString(),
        character: {
          name: local.name,
          sheet_preset_id: local.sheet_preset_id ?? null,
          class_status: local.class_status,
          description: local.description,
          text_fields: local.text_fields ?? [],
          special_field_locks: local.special_field_locks ?? [],
          stat_points_locked: Boolean(local.stat_points_locked),
          sheet_preset_locked: Boolean(local.sheet_preset_locked),
          stats: local.stats ?? [],
          counters: local.counters ?? [],
        },
      }
      const encrypted = await encryptSheetPayload(payload)
      const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = (local.name || local.player_name || 'sheet').replace(/[\\/:*?"<>|]/g, '_')
      a.download = `${safeName}.vng-sheet.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      window.alert('Не удалось зашифровать листик для экспорта.')
    }
  }

  function openImportPicker() {
    importInputRef.current?.click()
  }

  async function handleImportFile(file: File | null) {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      let source: unknown = parsed
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as Record<string, unknown>).type === 'vng-character-sheet-encrypted'
      ) {
        source = await decryptSheetPayload(parsed as EncryptedSheetEnvelope)
      }
      const imported = buildCharacterFromImportedJson(source, local)
      if (!imported) {
        window.alert('Не удалось прочитать листик. Проверьте формат файла.')
        return
      }
      imported.stat_points_locked = local.stat_points_locked
      imported.sheet_preset_locked = local.sheet_preset_locked
      imported.special_field_locks = local.special_field_locks ?? imported.special_field_locks ?? []
      scheduleSave(syncHpCounterFromImportedStats(imported))
    } catch {
      window.alert('Ошибка загрузки листика. Неверный/чужой зашифрованный файл или повреждённый JSON.')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  function addStat() {
    if (statPointsLocked && !gmEditing) return
    const stat: StatField = { id: generateId(), name: 'Параметр', value: '0' }
    scheduleSave({ ...local, stats: [...local.stats, stat] })
  }

  function updateStat(id: string, patch: Partial<StatField>) {
    if (statPointsLocked && !gmEditing) return
    const isDaredevil = resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status) === 'daredevil'
    const prevStat = local.stats.find((s) => s.id === id)
    const nextStats = local.stats.map((s) => (s.id === id ? { ...s, ...patch } : s))
    const updatedStat = nextStats.find((s) => s.id === id)
    if (!updatedStat) return
    let finalStats = nextStats
    let finalCounters = [...local.counters]
    const roundedPrev = prevStat ? toRoundedNumberOrNull(prevStat.value) : null
    const roundedNext = patch.value === undefined ? null : toRoundedNumberOrNull(updatedStat.value)
    const pointsIdx = finalCounters.findIndex((c) => isSkillPointCounter(c.name))

    if (patch.value !== undefined && roundedPrev !== null && roundedNext !== null && pointsIdx >= 0) {
      const pointsCounter = finalCounters[pointsIdx]
      const maxPoints = Math.max(0, Math.round(Number(pointsCounter.max) || 0))
      const prevValueForPoints = isHpStat(updatedStat.name) ? Math.max(0, roundedPrev) : roundedPrev
      let targetValueForPoints = isHpStat(updatedStat.name) ? Math.max(0, roundedNext) : roundedNext
      const delta = targetValueForPoints - prevValueForPoints

      if (delta > 0) {
        const spendable = Math.max(0, Math.round(Number(pointsCounter.current) || 0))
        if (delta > spendable) {
          targetValueForPoints = prevValueForPoints + spendable
        }
      }

      const pointsDelta = targetValueForPoints - prevValueForPoints
      const nextPointsCurrent = Math.min(
        maxPoints,
        Math.max(0, Math.round(Number(pointsCounter.current) || 0) - pointsDelta)
      )

      finalCounters = finalCounters.map((c, i) =>
        i === pointsIdx ? { ...c, current: nextPointsCurrent } : c
      )
      finalStats = finalStats.map((s) =>
        s.id === id ? { ...s, value: String(targetValueForPoints) } : s
      )
    }

    const patchedStat = finalStats.find((s) => s.id === id)
    if (patchedStat && isDaredevil && isHpStat(patchedStat.name)) {
      finalStats = finalStats.map((s) => (s.id === id ? { ...s, value: '1' } : s))
      const hpIdx = finalCounters.findIndex((c) => isHealthCounter(c.name))
      if (hpIdx >= 0) {
        finalCounters = finalCounters.map((c, i) => (i === hpIdx ? { ...c, current: 1, max: 1 } : c))
      }
    }
    if (!isDaredevil && patchedStat && isHpStat(patchedStat.name) && patch.value !== undefined) {
      const hpSpent = Number(patchedStat.value)
      if (Number.isFinite(hpSpent)) {
        const normalizedSpent = Math.max(0, Math.round(hpSpent))
        const hpMax = getHpCounterMaxFromHpStat(
          normalizedSpent,
          local.sheet_preset_id ?? null,
          local.class_status
        )
        const hpIdx = finalCounters.findIndex((c) => isHealthCounter(c.name))
        finalStats = finalStats.map((s) => (s.id === id ? { ...s, value: String(normalizedSpent) } : s))
        if (hpIdx >= 0) {
          finalCounters = finalCounters.map((c, i) =>
            i === hpIdx ? { ...c, max: hpMax, current: hpMax } : c
          )
        }
      }
    }

    const isMolchun = resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status) === 'molchun'
    if (isMolchun) {
      const energyStat = finalStats.find((s) => isEnergyStat(s.name))
      if (energyStat) {
        const energyMax = getFinalStatValueForCounters(
          energyStat,
          local.sheet_preset_id ?? null,
          local.class_status
        )
        const energyCounterIdx = finalCounters.findIndex((c) => isEnergyCounter(c.name))
        if (energyCounterIdx >= 0) {
          finalCounters = finalCounters.map((c, i) =>
            i === energyCounterIdx
              ? { ...c, max: energyMax, current: Math.min(c.current, energyMax) }
              : c
          )
        } else {
          finalCounters = [...finalCounters, { id: generateId(), name: 'Энергия', current: energyMax, max: energyMax }]
        }
      }
    }
    finalCounters = syncHintCounter(
      finalStats,
      finalCounters,
      local.sheet_preset_id ?? null,
      local.class_status
    )

    scheduleSave({
      ...local,
      stats: finalStats,
      counters: finalCounters,
    })
  }

  function removeStat(id: string) {
    scheduleSave({ ...local, stats: local.stats.filter((s) => s.id !== id) })
  }

  function addCounter() {
    const counter: CounterField = { id: generateId(), name: 'Ресурс', current: 5, max: 5 }
    scheduleSave({ ...local, counters: [...local.counters, counter] })
  }

  function updateCounter(id: string, patch: Partial<CounterField>) {
    const isDaredevil = resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status) === 'daredevil'
    const nextCounters = local.counters.map((c) => {
      if (c.id !== id) return c
      if (isDaredevil && isHealthCounter(c.name)) {
        return { ...c, current: 1, max: 1 }
      }
      const rawCurrent = patch.current ?? c.current
      const rawMax = patch.max ?? c.max
      const safeMax = isHealthCounter(c.name)
        ? Math.max(0, Math.round(Number(rawMax) || 0))
        : Math.max(1, Math.round(Number(rawMax) || 1))
      const safeCurrent = Math.max(0, Math.min(safeMax, Math.round(Number(rawCurrent) || 0)))
      return { ...c, ...patch, current: safeCurrent, max: safeMax }
    })
    const changed = nextCounters.find((c) => c.id === id)
    if (!changed || !isHealthCounter(changed.name)) {
      const syncedCounters = syncHintCounter(
        local.stats,
        nextCounters,
        local.sheet_preset_id ?? null,
        local.class_status
      )
      scheduleSave({
        ...local,
        counters: syncedCounters,
      })
      return
    }
    const nextHpBase = inferBaseHpStatFromFinalMax(
      Math.max(0, Math.round(Number(changed.max) || 0)),
      local.sheet_preset_id ?? null,
      local.class_status
    )
    const nextHpStatValue = String(nextHpBase)
    const nextStats = local.stats.map((s) => (isHpStat(s.name) ? { ...s, value: nextHpStatValue } : s))
    const syncedCounters = syncHintCounter(
      nextStats,
      nextCounters,
      local.sheet_preset_id ?? null,
      local.class_status
    )
    scheduleSave({
      ...local,
      counters: syncedCounters,
      stats: nextStats,
    })
  }

  function removeCounter(id: string) {
    scheduleSave({ ...local, counters: local.counters.filter((c) => c.id !== id) })
  }

  function spendSkillPointOnStat(statId: string, delta: 1 | -1) {
    if (statPointsLocked && !gmEditing) return
    const isDaredevil = resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status) === 'daredevil'
    const pointsIdx = local.counters.findIndex((c) => isSkillPointCounter(c.name))
    if (pointsIdx < 0) return
    const hpIdx = local.counters.findIndex((c) => isHealthCounter(c.name))
    const pointsCounter = local.counters[pointsIdx]
    const stat = local.stats.find((s) => s.id === statId)
    if (!stat) return
    if (isDaredevil && isHpStat(stat.name)) return

    const currentStat = Number(stat.value)
    if (!Number.isFinite(currentStat)) return
    if (delta === 1 && pointsCounter.current <= 0) return

    if (isHpStat(stat.name) && hpIdx >= 0) {
      const currentSpent = Math.max(0, Math.round(currentStat))
      const nextSpent = Math.max(0, currentSpent + delta)
      const nextHpMax = getHpCounterMaxFromHpStat(
        nextSpent,
        local.sheet_preset_id ?? null,
        local.class_status
      )
      const nextStats = local.stats.map((s) =>
        s.id === statId ? { ...s, value: String(nextSpent) } : s
      )
      const nextCounters = syncHintCounter(
        nextStats,
        local.counters.map((c, i) => {
          if (i === pointsIdx) return { ...c, current: Math.max(0, c.current - delta) }
          if (i === hpIdx) return { ...c, max: nextHpMax, current: nextHpMax }
          return c
        }),
        local.sheet_preset_id ?? null,
        local.class_status
      )

      scheduleSave({
        ...local,
        counters: nextCounters,
        stats: nextStats,
      })
      return
    }

    let nextCounters = local.counters.map((c, i) =>
      i === pointsIdx ? { ...c, current: Math.max(0, c.current - delta) } : c
    )
    const nextStats = local.stats.map((s) =>
      s.id === statId ? { ...s, value: String(currentStat + delta) } : s
    )
    const isMolchun = resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status) === 'molchun'
    if (isMolchun) {
      const energyStat = nextStats.find((s) => isEnergyStat(s.name))
      if (energyStat) {
        const energyMax = getFinalStatValueForCounters(
          energyStat,
          local.sheet_preset_id ?? null,
          local.class_status
        )
        const energyCounterIdx = nextCounters.findIndex((c) => isEnergyCounter(c.name))
        if (energyCounterIdx >= 0) {
          nextCounters = nextCounters.map((c, i) =>
            i === energyCounterIdx
              ? { ...c, max: energyMax, current: Math.min(c.current, energyMax) }
              : c
          )
        }
      }
    }
    nextCounters = syncHintCounter(
      nextStats,
      nextCounters,
      local.sheet_preset_id ?? null,
      local.class_status
    )
    scheduleSave({
      ...local,
      counters: nextCounters,
      stats: nextStats,
    })
  }

  function adjustSkillPoints(delta: 1 | -1) {
    if (!gmEditing) return
    const pointsIdx = local.counters.findIndex((c) => isSkillPointCounter(c.name))
    if (pointsIdx < 0) {
      if (delta < 0) return
      scheduleSave({
        ...local,
        counters: [...local.counters, { id: generateId(), name: SKILL_POINTS_COUNTER_NAME, current: 1, max: 999 }],
      })
      return
    }
    scheduleSave({
      ...local,
      counters: local.counters.map((c, i) =>
        i === pointsIdx ? { ...c, current: Math.max(0, c.current + delta) } : c
      ),
    })
  }

  function updateTextField(id: string, patch: Partial<TextField>) {
    if (specialFieldLocks.has(id) && !gmEditing) return
    const currentPresetId = resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status)
    scheduleSave({
      ...local,
      text_fields: (local.text_fields ?? []).map((f) => {
        if (f.id !== id) return f
        let nextPatch = patch
        const maxLen = getTextFieldMaxLength(currentPresetId, f.name)
        if (maxLen !== null && typeof patch.value === 'string') {
          nextPatch = { ...patch, value: patch.value.slice(0, maxLen) }
        }
        return { ...f, ...nextPatch }
      }),
    })
  }

  function toggleSpecialFieldLock(fieldId: string) {
    if (!gmEditing) return
    const next = new Set(local.special_field_locks ?? [])
    if (next.has(fieldId)) next.delete(fieldId)
    else next.add(fieldId)
    scheduleSave({
      ...local,
      special_field_locks: [...next],
    })
  }

  function addSpecialField() {
    if (!gmEditing) return
    const field: TextField = { id: generateId(), name: 'Особое поле', value: '' }
    scheduleSave({
      ...local,
      text_fields: [...(local.text_fields ?? []), field],
    })
  }

  function removeSpecialField(fieldId: string) {
    if (!gmEditing) return
    const field = (local.text_fields ?? []).find((f) => f.id === fieldId)
    if (!field || isCoreSpecialField(field)) return
    scheduleSave({
      ...local,
      text_fields: (local.text_fields ?? []).filter((f) => f.id !== fieldId),
      special_field_locks: (local.special_field_locks ?? []).filter((id) => id !== fieldId),
    })
  }

  function toggleStatPointsLock() {
    if (!gmEditing) return
    scheduleSave({
      ...local,
      stat_points_locked: !statPointsLocked,
    })
  }

  function toggleSheetPresetLock() {
    if (!gmEditing) return
    scheduleSave({
      ...local,
      sheet_preset_locked: !sheetPresetLocked,
    })
  }

  function swapCharacteristicWithReserve(reserveStatId: string, activeStatId: string) {
    if (statPointsLocked && !gmEditing) return
    const reserveIdx = local.stats.findIndex((s) => s.id === reserveStatId)
    const activeIdx = local.stats.findIndex((s) => s.id === activeStatId)
    if (reserveIdx < 0 || activeIdx < 0) return
    const isCharacteristicSheet =
      resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status) === 'characteristic-sheet'
    if (!isCharacteristicSheet) return
    if (activeIdx > 4 || reserveIdx < 5 || reserveIdx > 6) return
    const nextStats = [...local.stats]
    const tmp = nextStats[activeIdx]
    nextStats[activeIdx] = nextStats[reserveIdx]
    nextStats[reserveIdx] = tmp
    scheduleSave({ ...local, stats: nextStats })
  }

  const textFields = local.text_fields ?? []
  const templateSelected = Boolean(local.sheet_preset_id)
  const resolvedPresetId = resolveCharacterPresetId(local.sheet_preset_id ?? null, local.class_status)
  const thresholdRows = getThresholdEffectsForCharacter(local.sheet_preset_id ?? null, local.class_status)
  const thresholdDisplayRows = buildThresholdDisplayRows(thresholdRows, resolvedPresetId)
  const isPrettySheet = resolvedPresetId === 'pretty'
  const isCharacteristicSheet = resolvedPresetId === 'characteristic-sheet'
  const activeStats = isCharacteristicSheet ? local.stats.slice(0, 5) : local.stats
  const reserveStats = isCharacteristicSheet ? local.stats.slice(5, 7) : []
  const engineerGlitchActive =
    resolvedPresetId === 'engineer' &&
    local.stats.some((stat) => {
      const numeric = Number(stat.value)
      if (!Number.isFinite(numeric)) return false
      return getStatEffectForCharacterSheet(local.sheet_preset_id ?? null, local.class_status, numeric) === 'ошибка'
    })
  const activePresetLabel =
    SHEET_PRESETS.find((preset) => preset.id === (local.sheet_preset_id as SheetPresetId | undefined))?.label ??
    null
  const rotationLabel = rotationStep === 0 ? '0°' : rotationStep === 1 ? '90°' : '180°'
  const rotationStyle = {
    transform:
      rotationStep === 0
        ? 'none'
        : rotationStep === 1
          ? 'rotate(90deg) scale(0.84)'
          : 'rotate(180deg) scale(0.94)',
    transformOrigin: 'center center',
    transition: 'transform 220ms ease',
  }

  return (
    <Panel
      title={
        gmEditing
          ? `Лист: ${local.name || local.player_name || 'игрок'}`
          : restrictedView
            ? `Краткий лист: ${local.name || local.player_name || 'персонаж'}`
            : 'Лист персонажа'
      }
      icon={<Scroll size={16} />}
      fillHeight
      className={`h-full min-h-0 ${engineerGlitchActive ? 'vng-sheet-engineer-glitch' : ''}`}
      action={
        <div className="flex items-center gap-2">
          {resolvedPresetId === 'condemned' && (
            <button
              type="button"
              className="vng-tui-btn text-[10px]"
              title="Повернуть лист"
              onClick={() => setRotationStep((prev) => ((prev + 1) % 3) as 0 | 1 | 2)}
            >
              <RotateCw size={12} />
              ПОВОРОТ {rotationLabel}
            </button>
          )}
          {gmEditing && (
            <span className="text-xs uppercase tracking-wide text-vng-amber font-semibold px-2 py-0.5 rounded bg-vng-amber/10">
              Редактирует ГМ
            </span>
          )}
        </div>
      }
    >
      <div
        className="relative h-full min-h-0 overflow-hidden"
        style={resolvedPresetId === 'condemned' ? rotationStyle : undefined}
      >
        {isPrettySheet && (
          <>
            <pre
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 right-0 z-0 m-0 overflow-hidden px-0.5 sm:px-1 text-[8px] sm:text-[10px] leading-none text-vng-muted/55 whitespace-pre"
            >
              {PRETTY_ASCII_TOP.repeat(12)}
            </pre>
            <pre
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 m-0 overflow-hidden px-0.5 sm:px-1 text-[8px] sm:text-[10px] leading-none text-vng-muted/55 whitespace-pre"
            >
              {PRETTY_ASCII_TOP.repeat(12)}
            </pre>
            <pre
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 bottom-0 z-0 m-0 w-3 sm:w-4 overflow-hidden text-[8px] sm:text-[10px] leading-none text-vng-muted/55 whitespace-pre"
            >
              {PRETTY_ASCII_SIDE_BLOCK}
            </pre>
            <pre
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 bottom-0 z-0 m-0 w-3 sm:w-4 overflow-hidden text-[8px] sm:text-[10px] leading-none text-vng-muted/55 whitespace-pre"
            >
              {PRETTY_ASCII_SIDE_BLOCK}
            </pre>
          </>
        )}
      <div className="relative z-10 h-full min-h-0 overflow-y-auto px-3 sm:px-4 py-2 pr-3 sm:pr-4">
        <div className="flex flex-col gap-4 min-h-0">
        <Input
          label="Имя"
          value={local.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Имя персонажа"
          disabled={!canEdit}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={downloadSheet} disabled={!canDownloadSheet}>
            Скачать листик
          </Button>
          {canEdit && (
            <Button type="button" size="sm" variant="ghost" onClick={openImportPicker}>
              Загрузить листик
            </Button>
          )}
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.vng-sheet.json,application/json"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {canEdit && (
          <section>
            <label className="vng-tui-field">
              <span className="vng-tui-field__label">ШАБЛОН ЛИСТИКА:</span>
              <div className="vng-tui-field__row">
                <select
                  className="vng-tui-input"
                  defaultValue=""
                  disabled={sheetPresetLocked && !gmEditing}
                  onChange={(e) => {
                    if (sheetPresetLocked && !gmEditing) return
                    const id = e.target.value as SheetPresetId
                    if (!id) return
                    const keepClassStatus = local.class_status
                    const withPreset = applySheetPreset(local, id)
                    scheduleSave({
                      ...withPreset,
                      class_status: keepClassStatus,
                    })
                    e.currentTarget.value = ''
                  }}
                >
                  <option value="">Выбрать и применить…</option>
                  {SHEET_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label} — {preset.points}
                    </option>
                  ))}
                </select>
                {gmEditing && (
                  <button
                    type="button"
                    className={`vng-tui-btn text-[10px] ${sheetPresetLocked ? 'vng-tui-btn--active' : ''}`}
                    onClick={toggleSheetPresetLock}
                    title={sheetPresetLocked ? 'Разрешить игроку менять шаблон' : 'Запретить игроку менять шаблон'}
                  >
                    {sheetPresetLocked ? <Lock size={12} /> : <Unlock size={12} />}
                    {sheetPresetLocked ? 'ШАБЛОН ЗАКРЫТ' : 'ШАБЛОН ОТКРЫТ'}
                  </button>
                )}
              </div>
            </label>
            <p className="text-xs text-vng-amber mt-1">
              Текущий шаблон: {activePresetLabel ?? 'не выбран'}
            </p>
            <p className="text-xs text-vng-muted mt-1">
              Применение перезапишет базовые характеристики/счетчики под выбранный листик.
            </p>
          </section>
        )}

        {!templateSelected && (
          <p className="text-xs text-vng-muted border border-vng-border px-2 py-2 leading-relaxed">
            Сначала выберите шаблон листика. После этого откроются способности, счетчики и характеристики.
          </p>
        )}

        {/* Custom text blocks — особые поля листа */}
        {templateSelected && !restrictedView && (
        <section>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-vng-muted">
              Особые поля
            </h3>
            {gmEditing && (
              <Button variant="ghost" size="sm" type="button" onClick={addSpecialField}>
                <PlusCircle size={14} /> Добавить поле
              </Button>
            )}
          </div>
          <p className="text-xs text-vng-muted mb-3">
            {gmEditing
              ? 'Базовые поля листика + свои дополнительные. Замок скрывает редактирование у игрока.'
              : 'Можно менять содержимое открытых полей. Названия базовых полей заданы шаблоном.'}
          </p>
          <div className="flex flex-col gap-3">
            {textFields.map((field) => {
              const fieldLocked = specialFieldLocks.has(field.id)
              const coreField = isCoreSpecialField(field)
              const fieldReadOnly = !canEdit || (!gmEditing && fieldLocked)
              const canRenameField = gmEditing || (!coreField && canEdit && !fieldLocked)
              const fieldMaxLen = getTextFieldMaxLength(resolvedPresetId, field.name)
              return (
                <div
                  key={field.id}
                  className="rounded-lg border border-vng-border/80 bg-vng-bg/60 p-3 space-y-2"
                >
                <div className="flex items-center gap-2">
                  {!canRenameField ? (
                    <span className="text-xs font-semibold uppercase text-vng-amber">{field.name}</span>
                  ) : (
                    <input
                      className="flex-1 bg-transparent text-xs font-semibold uppercase text-vng-amber focus:outline-none border-b border-transparent focus:border-vng-amber/40"
                      value={field.name}
                      onChange={(e) => updateTextField(field.id, { name: e.target.value })}
                    />
                  )}
                  {gmEditing && (
                    <button
                      type="button"
                      className={`vng-tui-btn text-[10px] ${fieldLocked ? 'vng-tui-btn--active' : ''}`}
                      onClick={() => toggleSpecialFieldLock(field.id)}
                      title={fieldLocked ? 'Разблокировать поле для игрока' : 'Заблокировать поле для игрока'}
                    >
                      {fieldLocked ? <Lock size={12} /> : <Unlock size={12} />}
                      {fieldLocked ? 'ЗАКРЫТО' : 'ОТКРЫТО'}
                    </button>
                  )}
                  {gmEditing && !coreField && (
                    <button
                      type="button"
                      className="text-vng-muted hover:text-vng-danger p-1"
                      onClick={() => removeSpecialField(field.id)}
                      title="Удалить поле"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {coreField && <span className="text-[10px] text-vng-muted shrink-0">базовое</span>}
                </div>
                {isAbilitiesField(field.name) ? (
                  <AbilityLevelsTable
                    value={field.value}
                    readOnly={fieldReadOnly}
                    mode={
                      resolvedPresetId === 'daredevil'
                        ? 'daredevil'
                        : resolvedPresetId === 'condemned'
                          ? 'condemned'
                          : resolvedPresetId === 'interleaf'
                            ? 'interleaf'
                            : resolvedPresetId === 'npc-vessel-deltarune'
                              ? 'vessel'
                            : resolvedPresetId === 'wanderer'
                              ? 'wanderer'
                          : 'default'
                    }
                    onChange={(next) => updateTextField(field.id, { value: next })}
                  />
                ) : fieldReadOnly ? (
                  <p className="text-sm whitespace-pre-wrap text-vng-text/90">{field.value || '—'}</p>
                ) : (
                  <textarea
                    className="w-full min-h-[72px] px-2 py-2 text-sm rounded-lg bg-vng-elevated border border-vng-border focus:outline-none focus:border-vng-amber/50 resize-y"
                    value={field.value}
                    onChange={(e) => updateTextField(field.id, { value: e.target.value })}
                    maxLength={fieldMaxLen ?? undefined}
                    placeholder="Текст поля…"
                  />
                )}
                {fieldMaxLen !== null && (
                  <p className="text-[10px] text-vng-muted">
                    Лимит: {fieldMaxLen} символов ({field.value.length}/{fieldMaxLen})
                  </p>
                )}
                {!gmEditing && fieldLocked && (
                  <p className="text-[10px] text-vng-muted">Поле заблокировано ГМ</p>
                )}
              </div>
            )})}
            {textFields.length === 0 && (
              <p className="text-xs text-vng-muted text-center py-3 border border-dashed border-vng-border rounded-lg">
                Добавьте поля: способности, особые правила…
              </p>
            )}
          </div>
        </section>
        )}

        {/* Counters */}
        {templateSelected && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-vng-muted">
              {restrictedView ? 'Здоровье' : 'Счётчики'}
            </h3>
            {canEdit && !restrictedView && (
              <Button variant="ghost" size="sm" type="button" onClick={addCounter}>
                <PlusCircle size={14} /> Добавить
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {(restrictedView
              ? local.counters.filter((c) => isHealthCounter(c.name))
              : local.counters.filter((c) => !isSkillPointCounter(c.name))
            ).map((counter) => (
              <CounterRow
                key={counter.id}
                counter={counter}
                readOnly={!canEdit || restrictedView}
                hpLocked={healthLocked && isHealthCounter(counter.name)}
                inspirationLocked={!gmEditing && isInspirationCounter(counter.name)}
                onUpdate={(p) => updateCounter(counter.id, p)}
                onRemove={() => removeCounter(counter.id)}
              />
            ))}
            {(restrictedView
              ? local.counters.filter((c) => isHealthCounter(c.name)).length === 0
              : local.counters.length === 0) && (
              <p className="text-xs text-vng-muted text-center py-2">
                {restrictedView ? 'Здоровье не указано' : 'Нет счётчиков'}
              </p>
            )}
          </div>
        </section>
        )}

        {/* Stats grid */}
        {templateSelected && !restrictedView && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-vng-muted">Характеристики</h3>
            <div className="flex items-center gap-2">
              <Button
                variant={showThresholdTable ? 'secondary' : 'ghost'}
                size="sm"
                type="button"
                onClick={() => setShowThresholdTable((v) => !v)}
              >
                {showThresholdTable ? 'Скрыть таблицу' : 'Таблица'}
              </Button>
              {gmEditing && (
                <button
                  type="button"
                  className={`vng-tui-btn text-[10px] ${statPointsLocked ? 'vng-tui-btn--active' : ''}`}
                  onClick={toggleStatPointsLock}
                  title={statPointsLocked ? 'Разрешить игроку менять статы' : 'Запретить игроку менять статы'}
                >
                  {statPointsLocked ? <Lock size={12} /> : <Unlock size={12} />}
                  {statPointsLocked ? 'СТАТЫ ЗАКРЫТЫ' : 'СТАТЫ ОТКРЫТЫ'}
                </button>
              )}
              {canEdit && (gmEditing || !statPointsLocked) && (
                <Button variant="ghost" size="sm" type="button" onClick={addStat}>
                  <PlusCircle size={14} /> Добавить
                </Button>
              )}
            </div>
          </div>
          {showThresholdTable && (
            <div className="mb-3 border border-vng-border rounded-lg overflow-hidden">
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-vng-muted border-b border-vng-border bg-vng-elevated/40">
                Таблица модификаторов порога ({resolvedPresetId ?? 'не определен'})
              </div>
              {thresholdDisplayRows.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-vng-muted border-b border-vng-border">
                      <th className="text-left px-2 py-1">Значение стата</th>
                      <th className="text-left px-2 py-1">Эффект порога</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thresholdDisplayRows.map((row) => (
                      <tr key={`${row.threshold}-${String(row.effect)}`} className="border-b border-vng-border/40">
                        <td className="px-2 py-1 vng-mono">
                          {row.threshold === 0 && resolvedPresetId === 'casual' ? 'Любое' : row.threshold}
                        </td>
                        <td className="px-2 py-1 vng-mono text-vng-amber">
                          {formatThresholdEffect(row.effect)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-2 py-2 text-xs text-vng-muted">
                  Для этого листика таблица порогов не найдена.
                </p>
              )}
            </div>
          )}
          {(() => {
            const spCounter = local.counters.find((c) => isSkillPointCounter(c.name))
            if (researcherMode) {
              return (
                <p className="text-xs text-vng-muted mb-2">
                  Режим исследователя: вместо очков используйте +∞ / -∞ на карточках характеристик.
                </p>
              )
            }
            return (
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-vng-muted">
                  Очки на характеристики:{' '}
                  <span className="text-vng-amber font-semibold">
                    {spCounter?.current ?? 0}
                  </span>
                  {' '}— тратьте кнопками +/− у статов
                  {!gmEditing && statPointsLocked ? ' (заблокировано ГМ)' : ''}
                </p>
                {gmEditing && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" type="button" onClick={() => adjustSkillPoints(-1)}>
                      -1 очко
                    </Button>
                    <Button variant="ghost" size="sm" type="button" onClick={() => adjustSkillPoints(1)}>
                      +1 очко
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {activeStats.map((stat, index) => (
              <StatRow
                key={stat.id}
                stat={stat}
                classStatus={local.class_status}
                sheetPresetId={local.sheet_preset_id ?? null}
                index={index}
                readOnly={!canEdit || (!gmEditing && statPointsLocked)}
                canSpend={canEdit && !statPointsLocked && local.counters.some((c) => isSkillPointCounter(c.name))}
                researcherMode={researcherMode}
                canSetInfinity={canEdit && researcherMode}
                onUpdate={(p) => updateStat(stat.id, p)}
                onRemove={() => removeStat(stat.id)}
                onSpendPoint={(d) => spendSkillPointOnStat(stat.id, d)}
              />
            ))}
            {activeStats.length === 0 && (
              <p className="text-xs text-vng-muted text-center py-2 col-span-full">Нет характеристик</p>
            )}
          </div>
          {isCharacteristicSheet && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-vng-muted uppercase tracking-[0.08em]">Запасные характеристики</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {reserveStats.map((reserve, idx) => {
                  const selectedActiveId = swapTargets[reserve.id] ?? activeStats[0]?.id ?? ''
                  return (
                    <div key={reserve.id} className="rounded border border-vng-border/70 p-2 space-y-2">
                      <StatRow
                        stat={reserve}
                        classStatus={local.class_status}
                        sheetPresetId={local.sheet_preset_id ?? null}
                        index={idx + 5}
                        readOnly={!canEdit || (!gmEditing && statPointsLocked)}
                        canSpend={false}
                        researcherMode={researcherMode}
                        canSetInfinity={canEdit && researcherMode}
                        onUpdate={(p) => updateStat(reserve.id, p)}
                        onRemove={() => removeStat(reserve.id)}
                      />
                      <div className="flex items-center gap-2">
                        <select
                          className="vng-tui-input"
                          value={selectedActiveId}
                          onChange={(e) =>
                            setSwapTargets((prev) => ({ ...prev, [reserve.id]: e.target.value }))
                          }
                          disabled={!canEdit || activeStats.length === 0}
                        >
                          {activeStats.map((active) => (
                            <option key={active.id} value={active.id}>
                              {active.name}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={!canEdit || !selectedActiveId}
                          onClick={() => swapCharacteristicWithReserve(reserve.id, selectedActiveId)}
                        >
                          Поменять
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
        )}
        </div>
      </div>
      </div>
    </Panel>
  )
}

function AbilityLevelsTable({
  value,
  readOnly,
  mode = 'default',
  onChange,
}: {
  value: string
  readOnly?: boolean
  mode?: 'default' | 'daredevil' | 'condemned' | 'interleaf' | 'wanderer' | 'vessel'
  onChange: (next: string) => void
}) {
  const isDaredevil = mode === 'daredevil'
  const isCondemned = mode === 'condemned'
  const isInterleaf = mode === 'interleaf'
  const isWanderer = mode === 'wanderer'
  const isVessel = mode === 'vessel'
  const defaultLevels = parseAbilityLevels(value)
  const daredevilLevels = parseDaredevilAbilityLevels(value)
  const condemnedLevels = parseCondemnedAbilityLevels(value)
  const interleafLevels = parseInterleafAbilityLevels(value)
  const vesselLevels = parseVesselAbilityLevels(value)
  const rows = isDaredevil
    ? DAREDEVIL_ABILITY_KEYS.map((key) => ({
        key,
        label: key.endsWith('20') ? 'Ур. 20' : 'Ур. 7',
        value: daredevilLevels[key] ?? '',
      }))
    : isCondemned
      ? CONDEMNED_ABILITY_KEYS.map((key) => ({
          key,
          label: key === 'Уровень ∞' ? 'Ур. ∞' : `Ур. ${key.replace('Уровень ', '')}`,
          value: condemnedLevels[key] ?? '',
        }))
      : isInterleaf
        ? INTERLEAF_ABILITY_KEYS.map((key) => ({
            key,
            label: `Ур. ${key.replace('Уровень ', '')}`,
            value: interleafLevels[key] ?? '',
          }))
      : isVessel
        ? VESSEL_ABILITY_KEYS.map((key) => ({
            key,
            label: 'Способность',
            value: vesselLevels[key] ?? '',
          }))
    : Array.from({ length: isWanderer ? 5 : 7 }, (_, idx) => idx + 1).map((level) => ({
        key: `lvl-${level}`,
        label: `Ур. ${level}`,
        value: defaultLevels[level] ?? '',
      }))
  return (
    <div className="min-w-0">
      <table className="w-full table-fixed border border-vng-border text-xs">
        <thead>
          <tr>
            <th className="w-20 px-2 py-1 border-b border-vng-border text-left uppercase text-vng-muted">Уровень</th>
            <th className="px-2 py-1 border-b border-vng-border text-left uppercase text-vng-muted">Способность</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-vng-border/60">
              <td className="px-2 py-1 align-top font-semibold text-vng-amber">{row.label}</td>
              <td className="px-2 py-1">
                {readOnly ? (
                  <span className="text-sm text-vng-text/90 break-words">{row.value || '—'}</span>
                ) : (
                  <textarea
                    className="w-full min-h-[56px] bg-transparent text-sm border border-vng-border/60 rounded px-2 py-1 focus:outline-none focus:border-vng-amber/40 resize-y"
                    value={row.value}
                    onChange={(e) => {
                      if (isDaredevil) {
                        const nextLevels = { ...daredevilLevels, [row.key]: e.target.value }
                        onChange(buildDaredevilAbilityLevelsText(nextLevels))
                      } else if (isCondemned) {
                        const nextLevels = { ...condemnedLevels, [row.key]: e.target.value }
                        onChange(buildCondemnedAbilityLevelsText(nextLevels))
                      } else if (isInterleaf) {
                        const nextLevels = { ...interleafLevels, [row.key]: e.target.value }
                        onChange(buildInterleafAbilityLevelsText(nextLevels))
                      } else if (isVessel) {
                        const nextLevels = { ...vesselLevels, [row.key]: e.target.value }
                        onChange(buildVesselAbilityLevelsText(nextLevels))
                      } else {
                        const level = Number(String(row.key).replace('lvl-', ''))
                        const nextLevels = { ...defaultLevels, [level]: e.target.value }
                        onChange(buildAbilityLevelsTextWithMax(nextLevels, isWanderer ? 5 : 7))
                      }
                    }}
                    placeholder={
                      isDaredevil
                        ? `Способности ${row.label === 'Ур. 20' ? '20' : '7'} уровня (по одной с новой строки)`
                        : isCondemned
                          ? `Способности ${row.label.replace('Ур. ', '')} уровня (по одной с новой строки)`
                          : isInterleaf
                            ? `Способности ${row.label.replace('Ур. ', '')} уровня (по одной с новой строки)`
                          : isVessel
                            ? 'Непронумерованная способность'
                        : `Способности ${row.label.replace('Ур. ', '')} уровня (по одной с новой строки)`
                    }
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CounterRow({
  counter,
  readOnly,
  hpLocked,
  inspirationLocked,
  onUpdate,
  onRemove,
}: {
  counter: CounterField
  readOnly?: boolean
  hpLocked?: boolean
  inspirationLocked?: boolean
  onUpdate: (patch: Partial<CounterField>) => void
  onRemove: () => void
}) {
  const counterReadOnly = readOnly || hpLocked || inspirationLocked
  const healthCounter = isHealthCounter(counter.name)
  return (
    <div className="vng-counter-block">
      <div className="flex items-center gap-2 mb-2">
        {counterReadOnly ? (
          <span className="text-sm font-medium flex-1">{counter.name}</span>
        ) : (
          <input
            className="flex-1 bg-transparent text-sm font-medium focus:outline-none border-b border-transparent focus:border-vng-amber/40"
            value={counter.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        )}
        {!counterReadOnly && (
          <button type="button" onClick={onRemove} className="text-vng-muted hover:text-vng-danger p-1">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {hpLocked && (
        <p className="text-xs text-vng-muted mb-1">Здоровье меняет только мастер игры</p>
      )}
      {inspirationLocked && (
        <p className="text-xs text-vng-muted mb-1">Очки вдохновения выдаёт только ГМ</p>
      )}
      <SegmentedHpBar current={counter.current} max={counter.max} />
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <span className="vng-mono text-lg font-bold vng-glow-cyan">
            {counter.current}
            <span className="text-vng-muted text-sm font-normal"> / {counter.max}</span>
          </span>
        </div>
        {!counterReadOnly && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              className="w-16 px-2 py-1 text-xs rounded bg-vng-elevated border border-vng-border text-right"
              value={counter.current}
              onChange={(e) => onUpdate({ current: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              title="Текущее"
            />
            <span className="text-xs text-vng-muted">/</span>
            <input
              type="number"
              min={healthCounter ? 0 : 1}
              className="w-16 px-2 py-1 text-xs rounded bg-vng-elevated border border-vng-border text-right"
              value={counter.max}
              onChange={(e) =>
                onUpdate({
                  max: healthCounter
                    ? Math.max(0, parseInt(e.target.value, 10) || 0)
                    : Math.max(1, parseInt(e.target.value, 10) || 1),
                })
              }
              title="Максимум"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function StatRow({
  stat,
  classStatus,
  sheetPresetId,
  index,
  readOnly,
  canSpend,
  researcherMode,
  canSetInfinity,
  onUpdate,
  onRemove,
  onSpendPoint,
}: {
  stat: StatField
  classStatus: string
  sheetPresetId?: string | null
  index: number
  readOnly?: boolean
  canSpend?: boolean
  researcherMode?: boolean
  canSetInfinity?: boolean
  onUpdate: (patch: Partial<StatField>) => void
  onRemove: () => void
  onSpendPoint?: (delta: 1 | -1) => void
}) {
  const statRaw = String(stat.value ?? '').trim()
  const isPosInfinity = statRaw === '∞' || statRaw.toLowerCase() === '+∞' || statRaw.toLowerCase() === 'inf' || statRaw.toLowerCase() === '+inf'
  const isNegInfinity = statRaw === '-∞' || statRaw.toLowerCase() === '-inf'
  const isInfinity = isPosInfinity || isNegInfinity
  const numericValue = Number(stat.value)
  const effect: StatEffectValue | null = Number.isFinite(numericValue)
    ? getStatEffectForCharacterSheet(sheetPresetId, classStatus, numericValue)
    : null
  const effectText =
    effect === null ? null : typeof effect === 'string' ? effect : effect > 0 ? `+${effect}` : `${effect}`

  return (
    <div className="vng-stat-tile group">
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-vng-muted hover:text-vng-danger p-0.5 transition-opacity"
        >
          <Trash2 size={12} />
        </button>
      )}
      <div className="vng-stat-tile__icon">
        <StatIcon name={stat.name} index={index} size={14} />
      </div>
      {readOnly ? (
        <p className="text-sm text-vng-muted truncate uppercase tracking-wide">{stat.name}</p>
      ) : (
        <input
          className="w-full text-sm text-vng-muted text-center bg-transparent focus:outline-none mb-0.5 uppercase tracking-wide"
          value={stat.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      )}
      {readOnly ? (
        <p className="text-xl font-bold text-vng-amber vng-mono vng-glow-amber">
          {stat.value}
          {effectText && <span className="text-sm text-vng-muted font-semibold"> ({effectText})</span>}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-center gap-1">
            <input
              className="w-16 text-xl font-bold text-vng-amber vng-mono vng-glow-amber text-center bg-transparent focus:outline-none"
              value={stat.value}
              onChange={(e) => onUpdate({ value: e.target.value })}
            />
            {effectText && <span className="text-sm text-vng-muted font-semibold">({effectText})</span>}
          </div>
          {canSpend && onSpendPoint && (
            <div className="mt-1 flex items-center justify-center gap-1">
              <Button size="sm" variant="secondary" type="button" onClick={() => onSpendPoint(-1)}>
                -1
              </Button>
              <Button size="sm" variant="secondary" type="button" onClick={() => onSpendPoint(1)}>
                +1
              </Button>
            </div>
          )}
          {researcherMode && canSetInfinity && (
            <div className="mt-1 flex items-center justify-center gap-1">
              <Button
                size="sm"
                variant={isPosInfinity ? 'primary' : 'secondary'}
                type="button"
                onClick={() => onUpdate({ value: isPosInfinity ? '0' : '∞' })}
              >
                +∞
              </Button>
              <Button
                size="sm"
                variant={isNegInfinity ? 'primary' : 'secondary'}
                type="button"
                onClick={() => onUpdate({ value: isNegInfinity ? '0' : '-∞' })}
              >
                -∞
              </Button>
            </div>
          )}
          {researcherMode && isInfinity && (
            <p className="mt-1 text-[10px] leading-snug text-center text-vng-muted">
              Бесконечность задана ГМ
            </p>
          )}
        </>
      )}
    </div>
  )
}
