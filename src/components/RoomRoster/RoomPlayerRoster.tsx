import { Crown, Dices, Hand } from 'lucide-react'
import type { Player } from '@/types'
import { Button } from '@/components/ui/Button'

interface RoomPlayerRosterProps {
  players: Player[]
  myPlayerId: string
  isGm: boolean
  handsRaised: string[]
  onToggleHand: (raised: boolean) => void
  onSignalPlayer: (playerId: string) => void
}

export function RoomPlayerRoster({
  players,
  myPlayerId,
  isGm,
  handsRaised,
  onToggleHand,
  onSignalPlayer,
}: RoomPlayerRosterProps) {
  const roster = players.filter((p) => !p.is_gm)
  const myHandUp = handsRaised.includes(myPlayerId)
  const me = players.find((p) => p.id === myPlayerId)

  return (
    <aside className="vng-room-roster">
      <header className="vng-room-roster__head">
        <span className="text-xs font-bold uppercase tracking-wider">Игроки</span>
        <span className="vng-mono text-xs text-vng-muted">{roster.length}</span>
      </header>

      <ul className="vng-room-roster__list">
        {roster.length === 0 ? (
          <li className="text-xs text-vng-muted px-2 py-3">Пока никого нет</li>
        ) : (
          roster.map((p) => {
            const handUp = handsRaised.includes(p.id)
            const isSelf = p.id === myPlayerId
            return (
              <li key={p.id} className={`vng-room-roster__row ${handUp ? 'vng-room-roster__row--hand' : ''}`}>
                <div className="vng-room-roster__name min-w-0">
                  {handUp && (
                    <Hand size={14} className="shrink-0 text-vng-amber" aria-label="Рука поднята" />
                  )}
                  <span className="truncate">{p.name}</span>
                  {isSelf && <span className="text-[10px] uppercase text-vng-muted shrink-0">вы</span>}
                </div>
                {isGm && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="vng-room-roster__dice-btn shrink-0"
                    onClick={() => onSignalPlayer(p.id)}
                    title="Подать звуковой сигнал игроку"
                    aria-label={`Подать звуковой сигнал: ${p.name}`}
                  >
                    <Dices size={12} />
                  </Button>
                )}
              </li>
            )
          })
        )}
      </ul>

      {!isGm && me && !me.is_gm && (
        <div className="vng-room-roster__foot">
          <Button
            type="button"
            size="sm"
            variant={myHandUp ? 'primary' : 'secondary'}
            className="w-full"
            onClick={() => onToggleHand(!myHandUp)}
          >
            <Hand size={14} />
            {myHandUp ? 'Опустить руку' : 'Поднять руку'}
          </Button>
        </div>
      )}

      {isGm && (
        <p className="vng-room-roster__hint text-[10px] leading-snug text-vng-muted px-2 pb-2">
          <Dices size={10} className="inline mr-0.5" />
          Кнопка у игрока — звуковой сигнал выбранному игроку.
        </p>
      )}

      {players.some((p) => p.is_gm) && (
        <div className="vng-room-roster__gm px-2 pb-2 text-xs text-vng-muted flex items-center gap-1">
          <Crown size={12} className="text-vng-amber shrink-0" />
          <span className="truncate">{players.find((p) => p.is_gm)?.name ?? 'ГМ'}</span>
        </div>
      )}
    </aside>
  )
}
