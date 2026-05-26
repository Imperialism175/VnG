import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Character, Player } from '@/types'
import { isNpcPlayerId } from '@/lib/rollFeed'
import { CharacterSheet } from '@/components/CharacterSheet/CharacterSheet'
import { Button } from '@/components/ui/Button'

interface GmPlayerSheetsProps {
  players: Player[]
  characters: Character[]
  gmPlayerId: string
  onSave: (character: Character) => void
  onCreateNpc: (name: string) => void
  onDeleteNpc: (playerId: string) => void
}

type RosterEntry = {
  playerId: string
  label: string
  character?: Character
  isNpc: boolean
}

export function GmPlayerSheets({
  players,
  characters,
  gmPlayerId,
  onSave,
  onCreateNpc,
  onDeleteNpc,
}: GmPlayerSheetsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newNpcName, setNewNpcName] = useState('')
  const [showNewNpc, setShowNewNpc] = useState(false)

  const roster = useMemo<RosterEntry[]>(() => {
    const playerIds = new Set(players.map((p) => p.id))
    const entries: RosterEntry[] = []

    for (const p of players.filter((pl) => !pl.is_gm)) {
      entries.push({
        playerId: p.id,
        label: p.name,
        character: characters.find((c) => c.player_id === p.id),
        isNpc: false,
      })
    }

    for (const c of characters) {
      if (playerIds.has(c.player_id) && !c.is_npc && !isNpcPlayerId(c.player_id)) continue
      if (c.player_id === gmPlayerId) continue
      if (!c.is_npc && !isNpcPlayerId(c.player_id)) continue
      entries.push({
        playerId: c.player_id,
        label: c.name?.trim() || c.player_name || 'Персонаж',
        character: c,
        isNpc: true,
      })
    }

    return entries
  }, [players, characters, gmPlayerId])

  const activeId = selectedId && roster.some((r) => r.playerId === selectedId)
    ? selectedId
    : roster[0]?.playerId ?? null

  const active = roster.find((r) => r.playerId === activeId)

  function handleCreateNpc() {
    const name = newNpcName.trim()
    if (!name) return
    onCreateNpc(name)
    setNewNpcName('')
    setShowNewNpc(false)
  }

  if (roster.length === 0 && !showNewNpc) {
    return (
      <div className="vng-card p-8 text-center space-y-4">
        <p className="text-vng-muted text-sm">Пока нет листов игроков</p>
        <p className="text-xs text-vng-muted">Добавьте лист NPC или дождитесь подключения игроков</p>
        <Button type="button" size="sm" onClick={() => setShowNewNpc(true)}>
          <Plus size={14} /> Новый лист персонажа
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 flex-1 min-w-0">
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
                {entry.isNpc ? `◇ ${name}` : name}
              </button>
            )
          })}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowNewNpc((v) => !v)}>
          <Plus size={14} /> Лист NPC
        </Button>
      </div>

      {showNewNpc && (
        <div className="flex flex-wrap gap-2 items-end border border-vng-border p-2">
          <label className="flex-1 min-w-[12rem] flex flex-col gap-1">
            <span className="text-xs uppercase text-vng-muted">Имя персонажа / NPC</span>
            <input
              value={newNpcName}
              onChange={(e) => setNewNpcName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNpc()}
              placeholder="Стражник, дракон, торговец…"
              className="px-2 py-1.5 text-sm bg-vng-bg border border-vng-border"
              maxLength={48}
            />
          </label>
          <Button type="button" size="sm" onClick={handleCreateNpc} disabled={!newNpcName.trim()}>
            Создать
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowNewNpc(false)}>
            Отмена
          </Button>
        </div>
      )}

      {active?.character ? (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
          {active.isNpc && active.character && (
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <label className="flex items-center gap-2 text-xs uppercase text-vng-muted">
                Видимость для игроков:
                <select
                  value={active.character.npc_visibility ?? (active.character.in_party ? 'full' : 'restricted')}
                  onChange={(e) => {
                    const v = e.target.value === 'full' ? 'full' : 'restricted'
                    onSave({ ...active.character!, npc_visibility: v, in_party: v === 'full' })
                  }}
                  className="px-2 py-1 text-xs bg-vng-bg border border-vng-border"
                >
                  <option value="restricted">Частично</option>
                  <option value="full">Полностью</option>
                </select>
              </label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(`Удалить лист «${active.label}»?`)) {
                    onDeleteNpc(active.playerId)
                    setSelectedId(null)
                  }
                }}
              >
                <Trash2 size={14} /> Удалить лист
              </Button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <CharacterSheet
              key={active.character.id}
              character={active.character}
              onChange={onSave}
              gmEditing
            />
          </div>
        </div>
      ) : active && !active.isNpc ? (
        <div className="vng-card p-6 text-center text-sm text-vng-muted">
          Лист ещё не создан — подождите, пока игрок откроет свой лист
        </div>
      ) : null}
    </div>
  )
}
