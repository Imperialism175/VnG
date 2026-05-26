import { useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { Character, Player } from '@/types'
import { buildViewableSheets } from '@/lib/characterVisibility'
import { CharacterSheet } from '@/components/CharacterSheet/CharacterSheet'

interface PartySheetBrowserProps {
  viewerPlayerId: string
  viewerIsGm: boolean
  players: Player[]
  characters: Character[]
  gmPlayerId: string
  myCharacter: Character | null
  onSaveOwn: (character: Character) => void
}

export function PartySheetBrowser({
  viewerPlayerId,
  viewerIsGm,
  players,
  characters,
  gmPlayerId,
  myCharacter,
  onSaveOwn,
}: PartySheetBrowserProps) {
  const roster = useMemo(
    () => buildViewableSheets(viewerPlayerId, viewerIsGm, players, characters, gmPlayerId),
    [viewerPlayerId, viewerIsGm, players, characters, gmPlayerId]
  )

  const [selectedId, setSelectedId] = useState<string>(() => viewerPlayerId)

  const activeId =
    selectedId && roster.some((e) => e.playerId === selectedId) ? selectedId : viewerPlayerId

  const active = roster.find((e) => e.playerId === activeId)
  const isOwn = activeId === viewerPlayerId

  if (!myCharacter && roster.length === 0) {
    return (
      <div className="vng-card p-8 text-center text-sm text-vng-muted">
        Лист персонажа ещё не загружен…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 shrink-0">
        {roster.map((entry) => {
          const name = entry.character?.name?.trim() || entry.label
          const tabActive = entry.playerId === activeId
          const short = entry.isSelf ? 'Я' : name.length > 12 ? `${name.slice(0, 11)}…` : name
          return (
            <button
              key={entry.playerId}
              type="button"
              onClick={() => setSelectedId(entry.playerId)}
              title={
                entry.visibility === 'restricted'
                  ? `${name} — краткий лист`
                  : entry.isNpc && entry.npcOpenMode === 'full'
                    ? `${name} — открыт полностью`
                    : name
              }
              className={`shrink-0 px-2.5 py-1.5 border text-xs font-medium flex items-center gap-1 ${
                tabActive
                  ? 'border-vng-blue bg-vng-blue/15 text-vng-blue'
                  : 'border-vng-border bg-vng-elevated text-vng-muted'
              }`}
            >
              {entry.isNpc && <span className="opacity-70">◇</span>}
              {entry.visibility === 'restricted' ? (
                <EyeOff size={12} className="shrink-0 opacity-80" />
              ) : (
                <Eye size={12} className="shrink-0 opacity-80" />
              )}
              <span>{short}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {active?.character ? (
          <CharacterSheet
            key={active.character.id}
            character={active.character}
            onChange={isOwn ? onSaveOwn : () => {}}
            readOnly={!isOwn}
            lockHp={!viewerIsGm}
            restrictedView={active.visibility === 'restricted'}
          />
        ) : (
          <div className="vng-card p-6 text-center text-sm text-vng-muted h-full flex items-center justify-center">
            {active?.isSelf
              ? 'Заполните лист — поля появятся здесь'
              : 'У этого игрока лист ещё не создан'}
          </div>
        )}
      </div>
    </div>
  )
}
