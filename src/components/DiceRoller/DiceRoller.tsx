import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { DiceThrowPit } from '@/components/DiceRoller/DiceThrowPit'
import { DiceIcon } from '@/components/icons/DiceIcon'
import { DICE_TYPES, parseDieValuesFromDetails, randomDieValues } from '@/lib/dice'
import type { DiceSides, RollEvent } from '@/types'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'

interface DiceRollerProps {
  onRoll: (opts: {
    count: number
    sides: DiceSides
    scaleStatName?: string | null
    scaleStatValue?: number | null
    desiredAbilityLevel?: number | null
  }) => void
  onReroll?: (opts: { count: number; sides: DiceSides; modifier: number }) => boolean
  playerId: string
  rollEvents: RollEvent[]
  statOptions?: string[]
  statValues?: Record<string, string>
  statScaleValues?: Record<string, number>
  disabled?: boolean
  fillHeight?: boolean
  canRoll?: boolean
  cooldownSec?: number
  isGm?: boolean
  inspirationPoints?: number
  wandererMode?: boolean
  gmScaleProfiles?: Array<{
    id: string
    label: string
    statOptions: string[]
    statValues: Record<string, string>
    statScaleValues: Record<string, number>
    wandererMode?: boolean
  }>
}

interface RollDisplay {
  values: number[]
  total: number
  modifier: number
  sides: DiceSides
}

function toRollDisplay(event: RollEvent, fallbackSides: DiceSides): RollDisplay | null {
  const values =
    Array.isArray(event.rolls) && event.rolls.length > 0
      ? event.rolls
      : parseDieValuesFromDetails(event.details)
  if (values.length === 0) return null
  return {
    values,
    total: event.total,
    modifier: event.modifier ?? 0,
    sides: (event.sides as DiceSides) || fallbackSides,
  }
}

export function DiceRoller({
  onRoll,
  onReroll,
  playerId,
  rollEvents,
  statOptions = [],
  statValues = {},
  statScaleValues = {},
  disabled,
  fillHeight,
  canRoll = true,
  cooldownSec = 0,
  isGm = false,
  inspirationPoints = 0,
  wandererMode = false,
  gmScaleProfiles = [],
}: DiceRollerProps) {
  const [selectedSides, setSelectedSides] = useState<DiceSides>(20)
  const [diceCount, setDiceCount] = useState(1)
  const [rolling, setRolling] = useState(false)
  const [display, setDisplay] = useState<RollDisplay | null>(null)
  const [tumbleValues, setTumbleValues] = useState<number[]>([])
  const [tumbleTick, setTumbleTick] = useState(0)
  const [rerolling, setRerolling] = useState(false)
  const [scaleStatName, setScaleStatName] = useState<string>('')
  const [scaleStatValue, setScaleStatValue] = useState<number | null>(null)
  const [desiredAbilityLevel, setDesiredAbilityLevel] = useState<string>('')
  const [gmProfileId, setGmProfileId] = useState<string>('')
  const selectedGmProfile = isGm ? gmScaleProfiles.find((p) => p.id === gmProfileId) ?? null : null
  const effectiveStatOptions = selectedGmProfile?.statOptions ?? statOptions
  const effectiveStatValues = selectedGmProfile?.statValues ?? statValues
  const effectiveStatScaleValues = selectedGmProfile?.statScaleValues ?? statScaleValues
  const effectiveWandererMode = selectedGmProfile?.wandererMode ?? wandererMode

  useEffect(() => {
    if (!isGm) return
    if (!gmScaleProfiles.length) {
      if (gmProfileId) setGmProfileId('')
      return
    }
    if (!gmScaleProfiles.some((p) => p.id === gmProfileId)) {
      setGmProfileId(gmScaleProfiles[0]?.id ?? '')
    }
  }, [isGm, gmScaleProfiles, gmProfileId])

  useEffect(() => {
    if (!scaleStatName) return
    if (!effectiveStatOptions.includes(scaleStatName)) {
      setScaleStatName('')
      setScaleStatValue(null)
    }
  }, [effectiveStatOptions, scaleStatName])


  const pendingRef = useRef(false)
  const rollStartedAt = useRef(0)
  const lastShownRollId = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingRef.current) return

    const mine = rollEvents.filter((e) => e.player_id === playerId)
    const latest = mine[mine.length - 1]
    if (!latest || latest.id === lastShownRollId.current) return

    const nextDisplay = toRollDisplay(latest, selectedSides)
    if (!nextDisplay) return

    pendingRef.current = false
    lastShownRollId.current = latest.id
    setRolling(false)
    setTumbleValues([])
    setDisplay(nextDisplay)
    setRerolling(false)
  }, [rollEvents, playerId, selectedSides])

  useEffect(() => {
    if (pendingRef.current) return
    const latest = rollEvents[rollEvents.length - 1]
    if (!latest) return
    if (latest.id === lastShownRollId.current) return
    const nextDisplay = toRollDisplay(latest, selectedSides)
    if (!nextDisplay) return
    lastShownRollId.current = latest.id
    setDisplay(nextDisplay)
  }, [rollEvents, selectedSides])

  useEffect(() => {
    if (!rolling || !pendingRef.current) return

    const id = window.setInterval(() => {
      setTumbleValues(randomDieValues(diceCount, selectedSides))
      setTumbleTick((n) => n + 1)
    }, 85)

    return () => window.clearInterval(id)
  }, [rolling, diceCount, selectedSides])

  useEffect(() => {
    if (!rolling) return
    const timeout = window.setTimeout(() => {
      if (pendingRef.current) {
        pendingRef.current = false
        setRolling(false)
        setTumbleValues([])
      }
    }, 8000)
    return () => window.clearTimeout(timeout)
  }, [rolling])

  const rollLocked = disabled || !canRoll || cooldownSec > 0
  const blockHint = !canRoll && !isGm
    ? 'ГМ должен разрешить вам бросок (кнопка с кубиком в списке игроков слева).'
    : cooldownSec > 0
      ? `Перезарядка: ${cooldownSec} сек.`
      : null

  function handleRoll() {
    if (rollLocked || rolling) return
    pendingRef.current = true
    rollStartedAt.current = Date.now()
    setRolling(true)
    setDisplay(null)
    setTumbleTick(0)
    setTumbleValues(randomDieValues(diceCount, selectedSides))
    onRoll({
      count: diceCount,
      sides: selectedSides,
      scaleStatName: scaleStatName || null,
      scaleStatValue: scaleStatValue ?? 0,
      desiredAbilityLevel:
        selectedSides === 20 && desiredAbilityLevel ? Math.max(1, Math.min(7, Number(desiredAbilityLevel))) : null,
    })
  }

  function handleReroll() {
    if (rolling || rerolling || !display || !onReroll) return
    const ok = onReroll({ count: diceCount, sides: selectedSides, modifier: scaleStatValue ?? 0 })
    if (!ok) return
    setRerolling(true)
    pendingRef.current = true
    rollStartedAt.current = Date.now()
    setRolling(true)
    setTumbleTick(0)
    setTumbleValues(randomDieValues(diceCount, selectedSides))
  }

  const pitSides = display?.sides ?? selectedSides
  const pitValues = rolling ? tumbleValues : display?.values ?? []
  const mod = display?.modifier ?? (scaleStatValue ?? 0)
  const total = display?.total
  const readoutExpression =
    selectedSides === 20 && effectiveWandererMode
      ? `${diceCount} × (d5 + d12)`
      : `${diceCount}d${selectedSides}`

  useEffect(() => {
    if (!scaleStatName) {
      setScaleStatValue(null)
      return
    }
    const raw = effectiveStatValues[scaleStatName]
    const thresholdEffect = effectiveStatScaleValues[scaleStatName]
    if (Number.isFinite(thresholdEffect)) {
      setScaleStatValue(thresholdEffect)
      return
    }
    const parsed = Number(raw)
    setScaleStatValue(Number.isFinite(parsed) ? parsed : 0)
  }, [scaleStatName, effectiveStatScaleValues, effectiveStatValues])

  useEffect(() => {
    if (selectedSides !== 20 && desiredAbilityLevel) {
      setDesiredAbilityLevel('')
    }
  }, [desiredAbilityLevel, selectedSides])

  return (
    <Panel title="Кубомёт" icon={<Sparkles size={16} />} fillHeight={fillHeight} className={fillHeight ? 'min-h-0' : ''}>
      <div className={`flex flex-col gap-4 ${fillHeight ? 'min-h-0 flex-1' : ''}`}>
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.1em] text-vng-muted mb-2 block">
            Выберите куб
          </span>
          <div className="grid grid-cols-4 gap-2">
            {DICE_TYPES.map(({ label, sides }) => {
              const active = selectedSides === sides
              const renderedLabel = sides === 20 && effectiveWandererMode ? 'Д5 + Д12' : label
              return (
                <button
                  key={sides}
                  type="button"
                  disabled={rollLocked || rolling}
                  onClick={() => setSelectedSides(sides)}
                  className={`vng-dice-btn ${active ? 'vng-dice-btn--active' : 'text-vng-muted'}`}
                  aria-pressed={active}
                  aria-label={label}
                >
                  <DiceIcon sides={sides} size={20} />
                  <span className="text-sm font-bold tracking-wide uppercase">
                    {active ? `► ${renderedLabel} ◄` : renderedLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-vng-muted uppercase tracking-[0.08em]">Кол-во (макс. 10)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={diceCount}
              onChange={(e) => {
                const n = Number(e.target.value)
                setDiceCount(Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : 1)
              }}
              disabled={rolling}
              className="vng-tui-input"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isGm && gmScaleProfiles.length > 0 && (
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-xs text-vng-muted uppercase tracking-[0.08em]">Бросок за НПС</span>
              <select
                className="vng-tui-input"
                value={gmProfileId}
                onChange={(e) => setGmProfileId(e.target.value)}
                disabled={rolling}
              >
                {gmScaleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-vng-muted uppercase tracking-[0.08em]">Скейл от стата</span>
            <select
              className="vng-tui-input"
              value={scaleStatName}
              onChange={(e) => setScaleStatName(e.target.value)}
              disabled={rolling}
            >
              <option value="">Без скейла</option>
              {effectiveStatOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-vng-muted">
              Модификатор от стата: {scaleStatValue === null ? '0' : scaleStatValue > 0 ? `+${scaleStatValue}` : `${scaleStatValue}`}
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-vng-muted uppercase tracking-[0.08em]">Авто-режим заклинания</span>
            <input
              type="number"
              min={1}
              max={7}
              value={desiredAbilityLevel}
              onChange={(e) => setDesiredAbilityLevel(e.target.value.replace(/[^\d]/g, '').slice(0, 1))}
              disabled={rolling || selectedSides !== 20}
              className="vng-tui-input"
              placeholder={selectedSides === 20 ? 'Уровень 1-7' : 'Только для d20'}
            />
            <p className="text-xs text-vng-muted leading-snug px-1 py-2 border border-vng-border rounded">
              Проверка доступна только на d20. Введите желаемый уровень заклинания.
            </p>
          </div>
        </div>

        <p className="vng-dice-readout text-center vng-mono text-sm text-vng-muted py-2">
          <span className="text-vng-blue">{readoutExpression}</span>
          {(scaleStatValue ?? 0) !== 0 && (
            <span className="text-vng-amber">
              {(scaleStatValue ?? 0) > 0 ? ` + ${scaleStatValue}` : ` − ${Math.abs(scaleStatValue ?? 0)}`}
            </span>
          )}
          {scaleStatName && <span>{` | скейл: ${scaleStatName}`}</span>}
          <span>{` | способность: ${selectedSides === 20 ? (desiredAbilityLevel ? `ур.${desiredAbilityLevel}` : 'выкл') : 'только d20'}`}</span>
        </p>

        <Button
          type="button"
          size="lg"
          disabled={rollLocked || rolling}
          onClick={handleRoll}
          className="mx-auto shrink-0 min-w-[12rem] justify-center"
        >
          {rolling ? 'БРОСОК…' : cooldownSec > 0 ? `ЖДИТЕ ${cooldownSec} С` : 'БРОСИТЬ'}
        </Button>
        {onReroll && (
          <>
            <p className="text-xs text-center text-vng-muted">
              Очки вдохновения: <span className="text-vng-amber font-semibold">{inspirationPoints}</span>
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={rolling || !display || inspirationPoints <= 0}
              onClick={handleReroll}
              className="w-full shrink-0"
            >
              {inspirationPoints > 0 ? 'ПЕРЕБРОС ЗА 1 ВДОХНОВЕНИЕ' : 'НЕТ ОЧКОВ ВДОХНОВЕНИЯ'}
            </Button>
          </>
        )}
        {blockHint && (
          <p className="text-xs text-center text-vng-muted leading-snug px-1">{blockHint}</p>
        )}

        <DiceThrowPit
          sides={pitSides}
          values={pitValues}
          rolling={rolling}
          tumbleTick={tumbleTick}
          modifier={mod}
          total={rolling ? undefined : total}
        />
      </div>
    </Panel>
  )
}
