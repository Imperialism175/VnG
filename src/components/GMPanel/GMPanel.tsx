import { useMemo } from 'react'
import { Crown, Users, X } from 'lucide-react'
import type { Character, Player } from '@/types'
import { isNpcPlayerId } from '@/lib/rollFeed'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'

interface GMPanelProps {
  players: Player[]
  characters: Character[]
  currentGmId: string
  onTransferGm: (newGmId: string) => void
  onAdjustHp: (playerId: string, delta: number) => void
  onAdjustInspiration: (playerId: string, delta: number) => void
  onClose: () => void
}

interface RosterEntry {
  playerId: string
  playerName: string
  character?: Character
}

function buildRoster(players: Player[], characters: Character[], gmId: string): RosterEntry[] {
  const playerIds = new Set(players.map((p) => p.id))
  const entries: RosterEntry[] = []

  for (const p of players.filter((pl) => !pl.is_gm)) {
    entries.push({
      playerId: p.id,
      playerName: p.name,
      character: characters.find((c) => c.player_id === p.id),
    })
  }

  for (const c of characters) {
    if (c.player_id === gmId) continue
    if (playerIds.has(c.player_id) && !c.is_npc && !isNpcPlayerId(c.player_id)) continue
    if (!c.is_npc && !isNpcPlayerId(c.player_id)) continue
    entries.push({
      playerId: c.player_id,
      playerName: c.name?.trim() || c.player_name || 'NPC',
      character: c,
    })
  }

  return entries
}

function hpSummary(char?: Character) {
  if (!char?.counters?.length) return null
  return char.counters.find((c) => /здор|хп|hp/i.test(c.name)) ?? char.counters[0]
}

export function GMPanel({
  players,
  characters,
  currentGmId,
  onTransferGm,
  onAdjustHp,
  onAdjustInspiration,
  onClose,
}: GMPanelProps) {
  const roster = useMemo(
    () => buildRoster(players, characters, currentGmId),
    [players, characters, currentGmId]
  )

  function handleTransfer(playerId: string) {
    if (!confirm('Передать права ГМ этому игроку?')) return
    onTransferGm(playerId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md">
      <div className="vng-card vng-card-glow w-full sm:max-w-xl max-h-[88vh] overflow-auto rounded-t-2xl sm:rounded-2xl">
        <header className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-vng-border bg-vng-elevated/95 backdrop-blur z-10">
          <div className="flex items-center gap-2 text-vng-amber">
            <Crown size={20} />
            <h2 className="font-bold">Игроки и управление</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-vng-muted hover:text-vng-text hover:bg-vng-bg">
            <X size={20} />
          </button>
        </header>

        <div className="p-4">
          <Panel title={`Игроки (${roster.length})`} icon={<Users size={16} />}>
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
              {roster.map((entry) => {
                const char = entry.character
                const hp = hpSummary(char)
                const inspiration = char?.counters?.find((c) => /вдох|inspir/i.test(c.name))
                const displayName = char?.name?.trim() || entry.playerName
                return (
                  <div
                    key={entry.playerId}
                    className="flex gap-2 p-3 rounded-xl bg-vng-bg/80 border border-vng-border"
                  >
                    <div className="w-9 h-9 rounded-lg bg-vng-blue/15 border border-vng-blue/30 flex items-center justify-center shrink-0 text-vng-blue font-bold text-sm vng-glow-blue">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{displayName}</p>
                      <p className="text-xs text-vng-muted truncate">
                        {entry.playerName}
                      </p>
                      {hp && (
                        <p className="text-xs font-mono text-vng-green mt-1">
                          {hp.name}: {hp.current}/{hp.max}
                        </p>
                      )}
                      {inspiration && (
                        <p className="text-xs font-mono text-vng-amber mt-1">
                          Вдохновение: {inspiration.current}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {hp && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() => onAdjustHp(entry.playerId, -1)}
                            aria-label="-1 ХП"
                          >
                            [-1 ХП]
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            onClick={() => onAdjustHp(entry.playerId, 1)}
                            aria-label="+1 ХП"
                          >
                            [+1 ХП]
                          </Button>
                        </>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => onAdjustInspiration(entry.playerId, 1)}
                        aria-label="+1 вдохновение"
                      >
                        [+1 ВДОХ]
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => onAdjustInspiration(entry.playerId, -1)}
                        aria-label="-1 вдохновение"
                      >
                        [-1 ВДОХ]
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => handleTransfer(entry.playerId)}
                        aria-label="Передать права ГМа"
                      >
                        [ПЕРЕДАТЬ ПРАВА ГМА]
                      </Button>
                    </div>
                  </div>
                )
              })}
              {roster.length === 0 && (
                <p className="text-sm text-vng-muted text-center py-8">Ожидание игроков в лобби…</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
