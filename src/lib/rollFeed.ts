import type { RollEvent } from '@/types'
import { parseDieValuesFromDetails } from '@/lib/dice'

export function isNpcPlayerId(playerId: string): boolean {
  return playerId.startsWith('npc-')
}

export function formatRollFeedLine(event: RollEvent, gmPlayerId?: string): string {
  const isGm =
    event.player_is_gm ?? (gmPlayerId != null && event.player_id === gmPlayerId)
  const who = isGm ? 'ГМ' : event.player_name || 'Игрок'
  const rolls = event.rolls?.length ? event.rolls : parseDieValuesFromDetails(event.details)
  const rollsPart = rolls.length ? `(${rolls.join(', ')})` : '—'
  const mod = event.modifier ?? 0
  const modSuffix = mod !== 0 ? ` ${mod > 0 ? '+ ' + mod : '− ' + Math.abs(mod)}` : ''
  const expr = event.expression.replace(/([+-])/g, ' $1 ')
  return `${who} бросил ${expr}. Выпало: ${rollsPart}${modSuffix}. Итог: ${event.total}`
}
