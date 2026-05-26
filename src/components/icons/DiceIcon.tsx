import type { DiceSides } from '@/types'

interface DiceIconProps {
  sides: DiceSides
  size?: number
  className?: string
}

/** Минималистичные «гравированные» иконки кубов для кубомёта */
export function DiceIcon({ sides, size = 28, className = '' }: DiceIconProps) {
  const s = size
  const stroke = 'currentColor'
  const sw = 1.35

  const inner = (() => {
    switch (sides) {
      case 3:
        return (
          <polygon
            points={`${s / 2},${s * 0.2} ${s * 0.82},${s * 0.75} ${s * 0.18},${s * 0.75}`}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        )
      case 4:
        return (
          <polygon
            points={`${s / 2},${s * 0.12} ${s * 0.88},${s * 0.78} ${s * 0.12},${s * 0.78}`}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        )
      case 6:
        return (
          <rect
            x={s * 0.18}
            y={s * 0.18}
            width={s * 0.64}
            height={s * 0.64}
            rx={2}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
          />
        )
      case 8:
        return (
          <polygon
            points={`${s / 2},${s * 0.1} ${s * 0.9},${s / 2} ${s / 2},${s * 0.9} ${s * 0.1},${s / 2}`}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        )
      case 10:
        return (
          <polygon
            points={`${s / 2},${s * 0.08} ${s * 0.92},${s * 0.38} ${s * 0.78},${s * 0.92} ${s * 0.22},${s * 0.92} ${s * 0.08},${s * 0.38}`}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        )
      case 12:
        return (
          <polygon
            points={`${s / 2},${s * 0.06} ${s * 0.86},${s * 0.22} ${s * 0.94},${s / 2} ${s * 0.86},${s * 0.78} ${s / 2},${s * 0.94} ${s * 0.14},${s * 0.78} ${s * 0.06},${s / 2} ${s * 0.14},${s * 0.22}`}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        )
      case 20:
        return (
          <polygon
            points={`${s / 2},${s * 0.05} ${s * 0.95},${s * 0.35} ${s * 0.8},${s * 0.95} ${s * 0.2},${s * 0.95} ${s * 0.05},${s * 0.35}`}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        )
      case 100:
        return (
          <>
            <circle cx={s / 2} cy={s / 2} r={s * 0.32} fill="none" stroke={stroke} strokeWidth={sw} />
            <circle cx={s / 2} cy={s / 2} r={s * 0.12} fill="currentColor" opacity={0.35} />
          </>
        )
      default:
        return null
    }
  })()

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      className={className}
      aria-hidden
    >
      <circle cx={s / 2} cy={s / 2} r={s * 0.46} fill="none" stroke={stroke} strokeWidth={0.5} opacity={0.2} />
      {inner}
    </svg>
  )
}
