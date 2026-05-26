import { BarChart3 } from 'lucide-react'
import type { Player, RoomPoll } from '@/types'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'

interface RoomPollPanelProps {
  poll: RoomPoll
  myPlayerId: string
  players: Player[]
  isGm: boolean
  onVote: (optionId: string) => void
  onEnd?: () => void
  onClear?: () => void
}

export function RoomPollPanel({ poll, myPlayerId, players, isGm, onVote, onEnd, onClear }: RoomPollPanelProps) {
  const myVote = poll.votes[myPlayerId]
  const totalVotes = Object.keys(poll.votes).length

  return (
    <Panel title="Голосование" icon={<BarChart3 size={16} />} fillHeight className="min-h-0">
      <p className="text-sm font-medium mb-4 vng-display text-vng-text">{poll.question}</p>
      <div className="flex flex-col gap-2">
        {poll.options.map((opt) => {
          const count = Object.values(poll.votes).filter((v) => v === opt.id).length
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const voted = myVote === opt.id
          return (
            <div key={opt.id} className="relative">
              {!poll.open && (
                <div
                  className="absolute inset-0 rounded-lg bg-vng-blue/10 transition-all"
                  style={{ width: `${pct}%` }}
                />
              )}
              <button
                type="button"
                disabled={!poll.open || (!!myVote && myVote !== opt.id)}
                onClick={() => onVote(opt.id)}
                className={`relative w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                  voted
                    ? 'border-vng-amber bg-vng-amber/10 text-vng-amber'
                    : 'border-vng-border bg-vng-bg/60 hover:border-vng-blue/40 disabled:opacity-60'
                }`}
              >
                <span className="text-sm">{opt.text}</span>
                {!poll.open && (
                  <span className="float-right text-xs font-mono text-vng-muted">
                    {count} ({pct}%)
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
      {poll.open && myVote && <p className="text-xs text-vng-muted mt-3 text-center">Ваш голос учтён</p>}
      {!poll.open && totalVotes > 0 && (
        <p className="text-xs text-vng-muted mt-3 text-center">
          Проголосовало: {totalVotes} из {players.filter((p) => !p.is_gm).length || players.length}
        </p>
      )}
      {isGm && (
        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-vng-border">
          {poll.open && onEnd && (
            <Button type="button" variant="secondary" size="sm" onClick={onEnd}>
              Завершить
            </Button>
          )}
          {onClear && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              Убрать
            </Button>
          )}
        </div>
      )}
    </Panel>
  )
}
