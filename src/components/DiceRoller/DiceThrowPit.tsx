import type { CSSProperties } from 'react'
import type { DiceSides } from '@/types'
import { tumbleDieStyle } from '@/lib/dieTumble'
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
            key={`${rolling ? 't' : 'r'}-${i}-${value}-${tumbleTick}`}
            className="vng-die-visual"
            style={rolling ? tumbleDieStyle(i, tumbleTick, values.length) : settleStyle(i, values.length)}
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

function settleStyle(index: number, count: number): CSSProperties {
  if (count === 1) {
    return {
      left: '50%',
      top: '42%',
      transform: 'translate(-50%, -50%) rotate(0deg) scale(1)',
    }
  }
  const cols = Math.min(count, 3)
  const col = index % cols
  const row = Math.floor(index / cols)
  const left = 22 + col * (56 / Math.max(cols - 1, 1))
  const top = 32 + row * 26
  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%) rotate(${index % 2 === 0 ? -6 : 8}deg)`,
  }
}
