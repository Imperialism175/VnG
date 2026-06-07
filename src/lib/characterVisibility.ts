import type { Character, Player } from '@/types'
import { isCheatSeeAllSheets } from '@/lib/cheatState'
import { isNpcPlayerId } from '@/lib/rollFeed'

export type SheetVisibility = 'full' | 'restricted'

export function isNpcCharacter(char: Character): boolean {
  return Boolean(char.is_npc) || isNpcPlayerId(char.player_id)
}

function npcIsFull(char: Character): boolean {
  // Новое поле: npc_visibility. Старое: in_party.
  if (char.npc_visibility === 'full') return true
  if (char.npc_visibility === 'restricted') return false
  return Boolean(char.in_party)
}

/** Полный лист: свой, другие игроки, NPC открытые ГМ (полностью). Остальное — краткий. */
export function getSheetVisibility(
  viewerPlayerId: string,
  viewerIsGm: boolean,
  target: Character,
  players: Player[],
  gmPlayerId: string
): SheetVisibility {
  if (viewerIsGm || isCheatSeeAllSheets()) return 'full'
  if (target.player_id === viewerPlayerId) return 'full'

  const linked = players.find((p) => p.id === target.player_id)
  if (linked && !linked.is_gm) return 'full'

  if (isNpcCharacter(target) && npcIsFull(target)) return 'full'

  if (target.player_id === gmPlayerId) return 'restricted'
  if (isNpcCharacter(target)) return 'restricted'

  return 'restricted'
}

export type ViewableSheetEntry = {
  playerId: string
  label: string
  character?: Character
  isNpc: boolean
  npcOpenMode: 'restricted' | 'full'
  visibility: SheetVisibility
  isSelf: boolean
}

export function buildViewableSheets(
  viewerPlayerId: string,
  viewerIsGm: boolean,
  players: Player[],
  characters: Character[],
  gmPlayerId: string
): ViewableSheetEntry[] {
  const entries: ViewableSheetEntry[] = []
  const seen = new Set<string>()

  for (const p of players.filter((pl) => !pl.is_gm)) {
    const character = characters.find((c) => c.player_id === p.id)
    const visibility = character
      ? getSheetVisibility(viewerPlayerId, viewerIsGm, character, players, gmPlayerId)
      : 'full'
    entries.push({
      playerId: p.id,
      label: p.name,
      character,
      isNpc: false,
      npcOpenMode: 'full',
      visibility,
      isSelf: p.id === viewerPlayerId,
    })
    seen.add(p.id)
  }

  for (const c of characters) {
    if (seen.has(c.player_id)) continue
    const npc = isNpcCharacter(c)
    if (!npc) continue
    const openMode = npcIsFull(c) ? 'full' : 'restricted'
    const visibility = getSheetVisibility(viewerPlayerId, viewerIsGm, c, players, gmPlayerId)
    entries.push({
      playerId: c.player_id,
      label: c.name?.trim() || c.player_name || 'NPC',
      character: c,
      isNpc: true,
      npcOpenMode: openMode,
      visibility,
      isSelf: false,
    })
    seen.add(c.player_id)
  }

  return entries.sort((a, b) => {
    if (a.isSelf) return -1
    if (b.isSelf) return 1
    if (!a.isNpc && b.isNpc) return -1
    if (a.isNpc && !b.isNpc) return 1
    if (a.npcOpenMode === 'full' && b.npcOpenMode !== 'full') return -1
    if (a.npcOpenMode !== 'full' && b.npcOpenMode === 'full') return 1
    return a.label.localeCompare(b.label, 'ru')
  })
}

