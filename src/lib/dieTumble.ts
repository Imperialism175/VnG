import type { CSSProperties } from 'react'

/** Псевдослучайная позиция куба в «яме» при анимации броска */
export function tumbleDieStyle(index: number, tick: number, count: number): CSSProperties {
  const t = tick * 0.55 + index * 2.1
  const wobble = Math.sin(t * 1.7) * 0.5 + 0.5
  const wobble2 = Math.cos(t * 1.3 + index) * 0.5 + 0.5

  const cols = Math.min(count, 3)
  const col = index % cols
  const row = Math.floor(index / cols)
  const baseX = count === 1 ? 50 : 18 + col * (64 / Math.max(cols - 1, 1))
  const baseY = count === 1 ? 50 : 28 + row * 22

  const left = Math.max(8, Math.min(72, baseX + (wobble - 0.5) * 28))
  const top = Math.max(10, Math.min(58, baseY + (wobble2 - 0.5) * 24))
  const rotate = Math.sin(t * 2.4) * 38 + Math.cos(t * 1.1) * 22
  const scale = 0.92 + wobble * 0.12

  return {
    left: `${left}%`,
    top: `${top}%`,
    transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
  }
}
