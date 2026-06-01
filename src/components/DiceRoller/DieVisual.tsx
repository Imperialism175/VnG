import type { DiceSides } from '@/types'
import { dieFontSize, formatDieFaceValue, getDieFaceShape, toD3Roman } from '@/lib/dieDisplay'

interface DieVisualProps {
  value: number
  sides: DiceSides
  rolling?: boolean
  className?: string
}

export function DieVisual({ value, sides, rolling, className = '' }: DieVisualProps) {
  const maxRoll = value === sides
  const minRoll = value === 1
  const shape = getDieFaceShape(sides)
  const { main, showDot } = formatDieFaceValue(value, sides)
  const fontSize = dieFontSize(value, sides)
  const ariaValue = sides === 3 ? `${value} (${toD3Roman(value)})` : String(value)

  const ShapeEl =
    shape.tag === 'rect' ? (
      <rect {...shape.attrs} />
    ) : shape.tag === 'circle' ? (
      <circle {...shape.attrs} />
    ) : (
      <polygon points={shape.attrs.points as string} />
    )

  return (
    <svg
      viewBox="0 0 100 100"
      className={[
        'vng-die-visual__svg',
        rolling ? 'vng-die-visual__svg--rolling' : '',
        maxRoll ? 'vng-die-visual--max' : '',
        minRoll ? 'vng-die-visual--min' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label={`d${sides}: ${ariaValue}`}
    >
      {ShapeEl}
      <text
        x="50"
        y={showDot ? 46 : 50}
        textAnchor="middle"
        dominantBaseline="middle"
        className="vng-die-visual__number"
        fontSize={fontSize}
      >
        {main}
      </text>
      {showDot && <circle cx="50" cy="62" r="3.5" className="vng-die-visual__dot" />}
    </svg>
  )
}
