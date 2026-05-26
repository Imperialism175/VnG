import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, Sparkles } from 'lucide-react'
import { DiceThrowPit } from '@/components/DiceRoller/DiceThrowPit'
import { DiceIcon } from '@/components/icons/DiceIcon'
import { DICE_TYPES, parseDieValuesFromDetails, randomDieValues } from '@/lib/dice'
import type { DiceSides, RollEvent } from '@/types'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'

interface DiceRollerProps {
  onRoll: (opts: { count: number; sides: DiceSides; modifier: number }) => void
  onReroll?: (opts: { count: number; sides: DiceSides; modifier: number }) => boolean
  playerId: string
  rollEvents: RollEvent[]
  disabled?: boolean
  fillHeight?: boolean
  canRoll?: boolean
  cooldownSec?: number
  isGm?: boolean
  inspirationPoints?: number
}

interface RollDisplay {
  values: number[]
  total: number
  modifier: number
  sides: DiceSides
}

export function DiceRoller({
  onRoll,
  onReroll,
  playerId,
  rollEvents,
  disabled,
  fillHeight,
  canRoll = true,
  cooldownSec = 0,
  isGm = false,
  inspirationPoints = 0,
}: DiceRollerProps) {
  const [selectedSides, setSelectedSides] = useState<DiceSides>(20)
  const [diceCount, setDiceCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [display, setDisplay] = useState<RollDisplay | null>(null)
  const [tumbleValues, setTumbleValues] = useState<number[]>([])
  const [tumbleTick, setTumbleTick] = useState(0)
  const [rerolling, setRerolling] = useState(false)

  const pendingRef = useRef(false)
  const rollStartedAt = useRef(0)
  const lastShownRollId = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingRef.current) return

    const mine = rollEvents.filter((e) => e.player_id === playerId)
    const latest = mine[mine.length - 1]
    if (!latest || latest.id === lastShownRollId.current) return

    const at = new Date(latest.created_at).getTime()
    if (at < rollStartedAt.current - 200) return

    const values =
      Array.isArray(latest.rolls) && latest.rolls.length > 0
        ? latest.rolls
        : parseDieValuesFromDetails(latest.details)

    if (values.length === 0) return

    pendingRef.current = false
    lastShownRollId.current = latest.id
    setRolling(false)
    setTumbleValues([])
    setDisplay({
      values,
      total: latest.total,
      modifier: latest.modifier ?? 0,
      sides: (latest.sides as DiceSides) || selectedSides,
    })
    setRerolling(false)
  }, [rollEvents, playerId, selectedSides])

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
    onRoll({ count: diceCount, sides: selectedSides, modifier })
  }

  function handleReroll() {
    if (rolling || rerolling || !display || !onReroll) return
    const ok = onReroll({ count: diceCount, sides: selectedSides, modifier })
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
  const mod = display?.modifier ?? modifier
  const total = display?.total

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
                    {active ? `► ${label} ◄` : label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-vng-muted uppercase tracking-[0.08em]">Кол-во</span>
            <div className="vng-dice-stepper" role="group" aria-label="Количество кубов">
              <button
                type="button"
                className="vng-dice-stepper__btn"
                disabled={rolling}
                onClick={() => setDiceCount((c) => Math.max(1, c - 1))}
                aria-label="Меньше кубов"
              >
                <Minus size={14} aria-hidden />
              </button>
              <span className="vng-dice-stepper__value vng-mono text-lg text-vng-blue">{diceCount}</span>
              <button
                type="button"
                className="vng-dice-stepper__btn"
                disabled={rolling}
                onClick={() => setDiceCount((c) => Math.min(100, c + 1))}
                aria-label="Больше кубов"
              >
                <Plus size={14} aria-hidden />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-vng-muted uppercase tracking-[0.08em]">Модиф.</span>
            <div className="vng-dice-stepper" role="group" aria-label="Модификатор броска">
              <button
                type="button"
                className="vng-dice-stepper__btn"
                disabled={rolling}
                onClick={() => setModifier((m) => m - 1)}
                aria-label="Уменьшить модификатор"
              >
                <Minus size={14} aria-hidden />
              </button>
              <span className="vng-dice-stepper__value vng-mono text-lg text-vng-amber">
                {modifier > 0 ? `+${modifier}` : modifier}
              </span>
              <button
                type="button"
                className="vng-dice-stepper__btn"
                disabled={rolling}
                onClick={() => setModifier((m) => m + 1)}
                aria-label="Увеличить модификатор"
              >
                <Plus size={14} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <p className="vng-dice-readout text-center vng-mono text-sm text-vng-muted py-2">
          <span className="text-vng-blue">{diceCount}d{selectedSides}</span>
          {modifier !== 0 && (
            <span className="text-vng-amber">
              {modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`}
            </span>
          )}
        </p>

        <Button type="button" size="lg" disabled={rollLocked || rolling} onClick={handleRoll} className="w-full shrink-0">
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
