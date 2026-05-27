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
  const scaleSuffix =
    event.scale_stat_name && typeof event.scale_stat_value === 'number'
      ? ` | скейл: ${event.scale_stat_name} ${event.scale_stat_value >= 0 ? '+' : ''}${event.scale_stat_value}`
      : ''
  const abilitySuffix =
    typeof event.ability_level === 'number' && event.ability_level > 0
      ? ` | способность ур.${event.ability_level}: ${event.ability_usable ? 'можно' : 'нельзя'}`
      : ''
  const rerollSuffix = event.reroll_inspiration ? ' | переброс за 1 очко вдохновения' : ''
  return `${who} бросил ${expr}. Выпало: ${rollsPart}${modSuffix}. Итог: ${event.total}${scaleSuffix}${abilitySuffix}${rerollSuffix}`
}
