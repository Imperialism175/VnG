import { useEffect, useState } from 'react'
import { formatSessionElapsed } from '@/lib/sessionTime'

interface SessionTimerProps {
  startMs: number
  className?: string
}

export function SessionTimer({ startMs, className = '' }: SessionTimerProps) {
  const [elapsed, setElapsed] = useState(() => formatSessionElapsed(startMs))

  useEffect(() => {
    const tick = () => setElapsed(formatSessionElapsed(startMs))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [startMs])

  return <span className={`vng-dos-hud__timer tabular-nums ${className}`}>{elapsed}</span>
}
