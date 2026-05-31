import { useMemo, useState } from 'react'
import type { Character, Player } from '@/types'
import { CharacterSheet } from '@/components/CharacterSheet/CharacterSheet'
import { Button } from '@/components/ui/Button'

interface GmPlayerSheetsProps {
  players: Player[]
  characters: Character[]
  onSave: (character: Character) => void
  onCreateNpc: (name: string) => void
  onDeleteNpc: (playerId: string) => void
}

type RosterEntry = {
  id: string
  label: string
  isNpc?: boolean
  character?: Character
}

export function GmPlayerSheets({
  players,
  characters,
  onSave,
  onCreateNpc,
  onDeleteNpc,
}: GmPlayerSheetsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [npcName, setNpcName] = useState('')

  const roster = useMemo<RosterEntry[]>(() => {
    const entries: RosterEntry[] = []

    for (const p of players.filter((pl) => !pl.is_gm)) {
      entries.push({
        id: p.id,
        label: p.name,
        character: characters.find((c) => c.player_id === p.id),
      })
    }

    for (const npc of characters.filter((c) => c.is_npc)) {
      entries.push({
        id: npc.player_id,
        label: npc.name?.trim() || npc.player_name || 'НПС',
        isNpc: true,
        character: npc,
      })
    }

    return entries
  }, [players, characters])

  const activeId = selectedId && roster.some((r) => r.id === selectedId)
    ? selectedId
    : roster[0]?.id ?? null

  const active = roster.find((r) => r.id === activeId)

  function handleCreateNpc() {
    const nextName = npcName.trim() || 'НПС'
    onCreateNpc(nextName)
    setNpcName('')
  }

  function handleDeleteNpc() {
    if (!active?.character || !active.isNpc) return
    const name = active.character.name?.trim() || active.label || 'НПС'
    const ok = window.confirm(`Удалить лист НПС "${name}" безвозвратно?`)
    if (!ok) return
    onDeleteNpc(active.character.player_id)
    setSelectedId(null)
  }

  if (roster.length === 0) {
    return (
      <div className="vng-card p-6 text-center space-y-3">
        <p className="text-vng-muted text-sm">Пока нет листов игроков. Создайте лист НПС вручную.</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <input
            className="px-3 py-2 text-sm border border-vng-border bg-vng-elevated rounded"
            placeholder="Имя НПС"
            value={npcName}
            onChange={(e) => setNpcName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateNpc()
            }}
          />
          <Button type="button" size="sm" onClick={handleCreateNpc}>
            Создать лист НПС
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col sm:flex-row gap-2 w-full">
          <input
            className="px-3 py-2 text-sm border border-vng-border bg-vng-elevated rounded sm:w-64"
            placeholder="Имя НПС"
            value={npcName}
            onChange={(e) => setNpcName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateNpc()
            }}
          />
          <Button type="button" size="sm" onClick={handleCreateNpc}>
            Создать лист НПС
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pb-1 -mx-1 px-1 flex-1 min-w-0">
          {roster.map((entry) => {
            const name = entry.character?.name?.trim() || entry.label
            const activeTab = entry.id === activeId
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(entry.id)}
                className={`shrink-0 px-3 py-2 border text-sm font-medium transition-colors ${
                  activeTab
                    ? 'border-vng-blue bg-vng-blue/15 text-vng-blue'
                    : 'border-vng-border bg-vng-elevated text-vng-muted hover:text-vng-text'
                }`}
              >
                {entry.isNpc ? `НПС: ${name}` : name}
              </button>
            )
          })}
        </div>
      </div>

      {active?.character ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-vng-muted">Режим просмотра: ГМ</p>
            <div className="flex items-center gap-2">
              {active.isNpc && (
                <Button type="button" size="sm" variant="danger" onClick={handleDeleteNpc}>
                  Удалить НПС
                </Button>
              )}
            </div>
          </div>
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
