const SEGMENTS = 16

interface SegmentedHpBarProps {
  current: number
  max: number
  variant?: 'player' | 'enemy'
}

export function SegmentedHpBar({ current, max }: SegmentedHpBarProps) {
  const ratio = max > 0 ? current / max : 0
  const filled = Math.round(ratio * SEGMENTS)
  const bar = `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, SEGMENTS - filled))}`

  return (
    <p
      className="vng-hp-text"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${current} из ${max}`}
    >
      <span className="text-vng-muted">HP </span>
      <span className="vng-hp-text__bar">[{bar}]</span>{' '}
      <span className="vng-mono">
        {current}/{max}
      </span>
    </p>
  )
}
