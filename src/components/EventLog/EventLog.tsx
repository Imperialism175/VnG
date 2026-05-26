import { useEffect, useRef } from 'react'
import { Dices } from 'lucide-react'
import type { RollEvent } from '@/types'
import { Panel } from '@/components/ui/Panel'

interface EventLogProps {
  events: RollEvent[]
}

export function EventLog({ events }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  return (
    <Panel title="Журнал бросков" icon={<Dices size={16} />} className="h-full min-h-[200px]">
      <div className="flex flex-col gap-2">
        {events.length === 0 ? (
          <p className="text-sm text-vng-muted text-center py-8">Пока никто не бросал кубики…</p>
        ) : (
          events.map((event) => (
            <article
              key={event.id}
              className="vng-feed-roll vng-terminal-line flex flex-col gap-0.5 p-3"
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-semibold text-vng-amber text-sm vng-glow-amber">{event.player_name}</span>
                <span className="text-xs text-vng-muted vng-mono">{formatTime(event.created_at)}</span>
              </div>
              <p className="vng-terminal-line__body text-sm">
                <span className="vng-terminal-prompt">&gt; </span>
                <span className="text-vng-muted">{event.expression}</span>
                {' → '}
                <span className="font-bold text-vng-green text-lg vng-mono vng-glow-phosphor">{event.total}</span>
              </p>
              <p className="text-xs text-vng-muted vng-mono pl-4">{event.details}</p>
            </article>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </Panel>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}
