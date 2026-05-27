import type { CSSProperties } from 'react'
import type { DiceSides } from '@/types'
import { DieVisual } from '@/components/DiceRoller/DieVisual'

interface DiceThrowPitProps {
  sides: DiceSides
  values: number[]
  rolling: boolean
  tumbleTick: number
  modifier: number
  total?: number
}

export function DiceThrowPit({ sides, values, rolling, tumbleTick, modifier, total }: DiceThrowPitProps) {
  void tumbleTick
  const hasDice = values.length > 0
  const sum = values.reduce((a, b) => a + b, 0)

  return (
    <div
      className={`vng-dice-throw-pit ${rolling ? 'vng-dice-throw-pit--rolling' : ''} ${hasDice ? 'vng-dice-throw-pit--active' : ''}`}
      aria-live="polite"
      aria-label={rolling ? 'Куб катится' : hasDice ? `Выпало: ${values.join(', ')}` : 'Поле броска'}
    >
      {!hasDice && !rolling && (
        <p className="vng-dice-throw-pit__hint">Здесь покажется бросок</p>
      )}

      {hasDice &&
        values.map((value, i) => (
          <div
            key={`die-${i}-${value}`}
            className={`vng-die-visual ${rolling ? 'vng-die-visual--rolling' : ''}`}
            style={rolling ? rollingStyle(i, values.length) : settleStyle(i, values.length)}
          >
            <DieVisual value={value} sides={sides} rolling={rolling} />
          </div>
        ))}

      {!rolling && hasDice && total !== undefined && (
        <p className="vng-dice-throw-pit__total vng-mono">
          <span className="text-vng-muted">
            {sum}
            {modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`) : ''}
            {' = '}
          </span>
          <span className="vng-dice-throw-pit__total-value">{total}</span>
        </p>
      )}
    </div>
  )
}

function dieAnchor(index: number, count: number): { left: number; top: number; rotate: number } {
  if (count === 1) {
    return { left: 50, top: 42, rotate: 0 }
  }
  const cols = Math.min(count, 3)
  const col = index % cols
  const row = Math.floor(index / cols)
  const left = 22 + col * (56 / Math.max(cols - 1, 1))
  const top = 32 + row * 26
  const rotate = index % 2 === 0 ? -6 : 8
  return { left, top, rotate }
}

function settleStyle(index: number, count: number): CSSProperties {
  const { left, top, rotate } = dieAnchor(index, count)
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(1)`,
  }
}

function rollingStyle(index: number, count: number): CSSProperties {
  const { left, top, rotate } = dieAnchor(index, count)
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%) rotate(${rotate * 2.2}deg) scale(0.74)`,
  }
}
