import { useMemo, useState } from 'react'
import type { Character, Player } from '@/types'
import { CharacterSheet } from '@/components/CharacterSheet/CharacterSheet'

interface GmPlayerSheetsProps {
  players: Player[]
  characters: Character[]
  onSave: (character: Character) => void
}

type RosterEntry = {
  playerId: string
  label: string
  character?: Character
}

export function GmPlayerSheets({
  players,
  characters,
  onSave,
}: GmPlayerSheetsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const roster = useMemo<RosterEntry[]>(() => {
    const entries: RosterEntry[] = []

    for (const p of players.filter((pl) => !pl.is_gm)) {
      entries.push({
        playerId: p.id,
        label: p.name,
        character: characters.find((c) => c.player_id === p.id),
      })
    }

    return entries
  }, [players, characters])

  const activeId = selectedId && roster.some((r) => r.playerId === selectedId)
    ? selectedId
    : roster[0]?.playerId ?? null

  const active = roster.find((r) => r.playerId === activeId)

  if (roster.length === 0) {
    return (
      <div className="vng-card p-8 text-center">
        <p className="text-vng-muted text-sm">Пока нет листов игроков</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2 pb-1 -mx-1 px-1 flex-1 min-w-0">
          {roster.map((entry) => {
            const name = entry.character?.name?.trim() || entry.label
            const activeTab = entry.playerId === activeId
            return (
              <button
                key={entry.playerId}
                type="button"
                onClick={() => setSelectedId(entry.playerId)}
                className={`shrink-0 px-3 py-2 border text-sm font-medium transition-colors ${
                  activeTab
                    ? 'border-vng-blue bg-vng-blue/15 text-vng-blue'
                    : 'border-vng-border bg-vng-elevated text-vng-muted hover:text-vng-text'
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>
      </div>

      {active?.character ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CharacterSheet
              key={active.character.id}
              character={active.character}
              onChange={onSave}
              gmEditing
            />
          </div>
        </div>
      ) : active ? (
        <div className="vng-card p-6 text-center text-sm text-vng-muted">
          Лист ещё не создан — подождите, пока игрок откроет свой лист
        </div>
      ) : null}
    </div>
  )
}
