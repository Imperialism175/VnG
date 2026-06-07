import type {
  Character,
  ChatMessage,
  CounterField,
  Encounter,
  Player,
  RollEvent,
  Room,
  RoomMusic,
  RoomPoll,
  RoomTheme,
  ScreenMessage,
  StatField,
  TextField,
} from '@/types'
import { parseRoomExtras } from '@/lib/roomExtras'

export interface RoomPublicState {
  room: {
    id: string
    name: string
    host_id: string
    gm_id: string
    created_at?: string
  }
  players: Player[]
  characters: Character[]
  roll_events: RollEvent[]
  chat_messages: ChatMessage[]
  active_encounter: Encounter | null
  hands_raised?: string[]
  dice_allowed?: string[]
  room_theme?: RoomTheme
  player_themes?: Record<string, RoomTheme>
  music?: RoomMusic
  active_poll?: RoomPoll | null
  screen_message?: ScreenMessage | null
}

export type ServerMessage =
  | { type: 'STATE_SYNC'; state: RoomPublicState; your_gm?: boolean }
  | { type: 'CHARACTER_UPDATED'; character: Character }
  | { type: 'CHARACTER_DELETED'; player_id: string }
  | { type: 'CREATE_NPC_CHARACTER'; name: string }
  | { type: 'DELETE_NPC_CHARACTER'; player_id: string }
  | { type: 'DICE_ROLL'; event: RollEvent }
  | { type: 'CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'CHANGE_GM'; gm_id: string; state: RoomPublicState }
  | { type: 'ENCOUNTER_UPDATE'; encounter: Encounter | null }
  | { type: 'ROOM_EXTRAS_UPDATE'; extras: Record<string, unknown> }
  | { type: 'PRESENCE_UPDATE'; hands_raised: string[]; dice_allowed: string[] }
  | { type: 'PLAYER_SIGNAL'; target_player_id: string; from_player_id: string; from_name: string }
  | { type: 'ERROR'; message: string }

export type ClientMessage =
  | { type: 'UPDATE_CHARACTER'; character: Character }
  | { type: 'CREATE_NPC_CHARACTER'; name: string }
  | { type: 'DELETE_NPC_CHARACTER'; player_id: string }
  | {
      type: 'DICE_ROLL'
      expression?: string
      count?: number
      sides?: number
      modifier?: number
      scale_stat_name?: string | null
      scale_stat_value?: number | null
      ability_level?: number | null
      desired_ability_level?: number | null
      cheat_token?: number
      cheat_sides?: Record<string, number>
      cheat_always_max?: boolean
      cheat_skip_cd?: boolean
      cheat_roll_bonus?: number
      cheat_force_jackpot?: boolean
      cheat_free_reroll?: boolean
      cheat_ability_ok?: boolean
    }
  | {
      type: 'DICE_REROLL_INSPIRED'
      expression?: string
      count?: number
      sides?: number
      modifier?: number
      cheat_token?: number
      cheat_sides?: Record<string, number>
      cheat_always_max?: boolean
      cheat_skip_cd?: boolean
      cheat_roll_bonus?: number
      cheat_force_jackpot?: boolean
      cheat_free_reroll?: boolean
      cheat_ability_ok?: boolean
    }
  | { type: 'CHAT_MESSAGE'; text: string }
  | { type: 'CHANGE_GM'; new_gm_id: string }
  | { type: 'SHOW_ENCOUNTER'; encounter: Partial<Encounter> }
  | { type: 'UPDATE_ENCOUNTER'; encounter: Partial<Encounter> }
  | { type: 'HIDE_ENCOUNTER' }
  | { type: 'SET_THEME'; theme: RoomTheme; target_player_id?: string | null; clear_player_overrides?: boolean }
  | { type: 'SET_PLAYER_THEME'; theme: RoomTheme }
  | { type: 'CLEAR_MY_THEME' }
  | { type: 'CLEAR_PLAYER_THEME'; target_player_id: string }
  | { type: 'SET_MUSIC'; url?: string | null; playing?: boolean }
  | { type: 'START_POLL'; question: string; options: string[]; duration_sec?: number }
  | { type: 'CAST_VOTE'; option_id: string }
  | { type: 'END_POLL' }
  | { type: 'CLEAR_POLL' }
  | { type: 'SHOW_SCREEN_MESSAGE'; title?: string; text: string; target_player_id?: string | null }
  | { type: 'DISMISS_SCREEN_MESSAGE' }
  | {
      type: 'SET_HALL_OF_FAME'
      hall_of_fame: { title: string; entries: { id: string; name: string; label?: string }[] }
      leaderboard_password?: string
    }
  | {
      type: 'SET_STAGE_FX'
      darkness: number
      flashlights_enabled_for?: string[]
      equalizer_enabled?: boolean
      beat_flicker_enabled?: boolean
      beat_bpm?: number
      beat_intensity?: number
    }
  | { type: 'SET_ALLOW_PLAYER_THEME_EDITING'; enabled: boolean }
  | { type: 'SET_LEVEL_PRESET'; level_id: string | null; variant?: 'main' | 'alt' }
  | { type: 'SET_LEVEL_VISIBILITY'; show_to_players: boolean }
  | { type: 'SET_HAND_RAISED'; raised: boolean }
  | { type: 'SET_DICE_PERMISSION'; player_id: string; allowed: boolean }
  | { type: 'PING_PLAYER'; player_id: string }

export function normalizeCharacter(raw: Record<string, unknown>): Character {
  return {
    id: raw.id as string,
    room_id: (raw.room_id ?? raw.roomId) as string,
    player_id: (raw.player_id ?? raw.playerId) as string,
    player_name: (raw.player_name ?? raw.playerName) as string,
    name: (raw.name as string) ?? '',
    sheet_preset_id: (raw.sheet_preset_id ?? raw.sheetPresetId ?? null) as string | null,
    class_status: (raw.class_status ?? raw.classStatus ?? '') as string,
    description: (raw.description as string) ?? '',
    text_fields: (raw.text_fields ?? raw.textFields ?? []) as TextField[],
    special_field_locks: Array.isArray(raw.special_field_locks ?? raw.specialFieldLocks)
      ? ((raw.special_field_locks ?? raw.specialFieldLocks) as unknown[]).map((v) => String(v))
      : [],
    stat_points_locked: Boolean(raw.stat_points_locked ?? raw.statPointsLocked),
    sheet_preset_locked: Boolean(raw.sheet_preset_locked ?? raw.sheetPresetLocked),
    stats: (raw.stats ?? []) as StatField[],
    counters: (raw.counters ?? []) as CounterField[],
    is_npc: Boolean(raw.is_npc ?? raw.isNpc) || String(raw.player_id ?? raw.playerId ?? '').startsWith('npc-'),
    in_party: Boolean(raw.in_party ?? raw.inParty),
    npc_visibility:
      (raw.npc_visibility ?? raw.npcVisibility) === 'full'
        ? 'full'
        : (raw.npc_visibility ?? raw.npcVisibility) === 'restricted'
          ? 'restricted'
          : undefined,
    updated_at: (raw.updated_at ?? raw.updatedAt) as string | undefined,
  }
}

export function normalizeRoom(raw: RoomPublicState['room']): Room {
  return {
    id: raw.id,
    name: raw.name,
    gm_id: raw.gm_id,
    host_id: raw.host_id,
    created_at: raw.created_at,
  }
}

export function normalizeRollEvent(raw: Record<string, unknown>): RollEvent {
  return {
    id: raw.id as string,
    room_id: (raw.room_id ?? raw.roomId) as string,
    player_id: (raw.player_id ?? raw.playerId) as string,
    player_name: (raw.player_name ?? raw.playerName) as string,
    player_is_gm: Boolean(raw.player_is_gm ?? raw.playerIsGm),
    expression: raw.expression as string,
    total: raw.total as number,
    details: (raw.details as string) ?? '',
    message: (raw.message as string) ?? '',
    created_at: (raw.created_at ?? raw.createdAt) as string,
    rolls: Array.isArray(raw.rolls) ? (raw.rolls as number[]) : undefined,
    modifier: typeof raw.modifier === 'number' ? raw.modifier : undefined,
    sides: typeof raw.sides === 'number' ? raw.sides : null,
    scale_stat_name: (raw.scale_stat_name ?? raw.scaleStatName ?? null) as string | null,
    scale_stat_value:
      typeof raw.scale_stat_value === 'number'
        ? raw.scale_stat_value
        : typeof raw.scaleStatValue === 'number'
          ? raw.scaleStatValue
          : null,
    ability_level:
      typeof raw.ability_level === 'number'
        ? raw.ability_level
        : typeof raw.abilityLevel === 'number'
          ? raw.abilityLevel
          : null,
    ability_usable:
      typeof raw.ability_usable === 'boolean'
        ? raw.ability_usable
        : typeof raw.abilityUsable === 'boolean'
          ? raw.abilityUsable
          : null,
    reroll_inspiration:
      typeof raw.reroll_inspiration === 'boolean'
        ? raw.reroll_inspiration
        : typeof raw.rerollInspiration === 'boolean'
          ? raw.rerollInspiration
          : false,
    jackpot:
      typeof raw.jackpot === 'boolean'
        ? raw.jackpot
        : typeof raw.isJackpot === 'boolean'
          ? raw.isJackpot
          : false,
  }
}

export function normalizeChatMessage(raw: Record<string, unknown>): ChatMessage {
  return {
    id: raw.id as string,
    room_id: (raw.room_id ?? raw.roomId) as string,
    player_id: (raw.player_id ?? raw.playerId) as string,
    player_name: (raw.player_name ?? raw.playerName) as string,
    text: raw.text as string,
    created_at: (raw.created_at ?? raw.createdAt) as string,
  }
}

export function normalizeEncounter(raw: Record<string, unknown> | null): Encounter | null {
  if (!raw) return null

  let enemies = (raw.enemies ?? []) as Encounter['enemies']
  if (!Array.isArray(enemies) || enemies.length === 0) {
    const hp = (raw.enemy_hp ?? raw.enemyHp ?? null) as number | null
    const hpMax = (raw.enemy_hp_max ?? raw.enemyHpMax ?? null) as number | null
    if (hp !== null || hpMax !== null || raw.title) {
      enemies = [
        {
          id: 'legacy',
          name: 'Противник',
          hp,
          hp_max: hpMax,
          armor: '',
          notes: '',
        },
      ]
    }
  }

  const first = enemies[0]
  return {
    id: raw.id as string,
    room_id: (raw.room_id ?? raw.roomId) as string,
    title: (raw.title as string) ?? '',
    subtitle: (raw.subtitle as string) ?? '',
    description: (raw.description as string) ?? '',
    mood: ((raw.mood as string) ?? '') as Encounter['mood'],
    image_url: (raw.image_url ?? raw.imageUrl ?? null) as string | null,
    enemies,
    objectives: (raw.objectives as string) ?? '',
    gm_notes: (raw.gm_notes ?? raw.gmNotes ?? '') as string,
    round: typeof raw.round === 'number' ? raw.round : 1,
    enemy_hp: first?.hp ?? (raw.enemy_hp ?? raw.enemyHp ?? null) as number | null,
    enemy_hp_max: first?.hp_max ?? (raw.enemy_hp_max ?? raw.enemyHpMax ?? null) as number | null,
    is_active: (raw.is_active ?? raw.isActive ?? false) as boolean,
  }
}

export function parsePresence(raw: {
  hands_raised?: string[]
  dice_allowed?: string[]
}): { handsRaised: string[]; diceAllowed: string[] } {
  return {
    handsRaised: Array.isArray(raw.hands_raised) ? raw.hands_raised : [],
    diceAllowed: Array.isArray(raw.dice_allowed) ? raw.dice_allowed : [],
  }
}

export function applyPublicState(state: RoomPublicState) {
  return {
    room: normalizeRoom(state.room),
    players: state.players as Player[],
    characters: state.characters.map((c) => normalizeCharacter(c as unknown as Record<string, unknown>)),
    rollEvents: state.roll_events.map((e) => normalizeRollEvent(e as unknown as Record<string, unknown>)),
    chatMessages: (state.chat_messages ?? []).map((m) =>
      normalizeChatMessage(m as unknown as Record<string, unknown>)
    ),
    activeEncounter: state.active_encounter
      ? normalizeEncounter(state.active_encounter as unknown as Record<string, unknown>)
      : null,
    presence: parsePresence(state),
    extras: parseRoomExtras(state as unknown as Record<string, unknown>),
  }
}
