export interface TextField {
  id: string
  name: string
  value: string
}

export interface StatField {
  id: string
  name: string
  value: string
}

export interface CounterField {
  id: string
  name: string
  current: number
  max: number
}

export interface Character {
  id: string
  room_id: string
  player_id: string
  player_name: string
  name: string
  /** Выбранный шаблон листика (не равен полю class_status) */
  sheet_preset_id?: string | null
  class_status: string
  description: string
  text_fields: TextField[]
  /** id полей из text_fields, которые заблокированы ГМ для владельца */
  special_field_locks?: string[]
  /** Запрет владельцу вкладывать очки характеристик и менять статы */
  stat_points_locked?: boolean
  /** Запрет владельцу менять выбранный шаблон листика */
  sheet_preset_locked?: boolean
  stats: StatField[]
  counters: CounterField[]
  /** Лист NPC/персонажа без игрока в сети — создаёт ГМ */
  is_npc?: boolean
  /** NPC в отряде — игроки видят полный лист */
  in_party?: boolean
  /** Публичность листа NPC для игроков (ГМ управляет) */
  npc_visibility?: 'restricted' | 'full'
  updated_at?: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  is_gm: boolean
  joined_at?: string
}

/** Состояние комнаты: руки, разрешения на кубы */
export interface RoomPresence {
  handsRaised: string[]
  diceAllowed: string[]
}

export interface Room {
  id: string
  name: string
  /** Код комнаты для Supabase/mock-хранилища (не обязателен для WS-сервера) */
  code?: string
  gm_id: string
  host_id?: string
  /** Время создания комнаты — общий старт таймера сессии для всех */
  created_at?: string
}

export interface RollEvent {
  id: string
  room_id: string
  player_id: string
  player_name: string
  player_is_gm?: boolean
  expression: string
  total: number
  details: string
  message: string
  created_at: string
  rolls?: number[]
  modifier?: number
  sides?: number | null
  scale_stat_name?: string | null
  scale_stat_value?: number | null
  ability_level?: number | null
  ability_usable?: boolean | null
  reroll_inspiration?: boolean
}

export interface ChatMessage {
  id: string
  room_id: string
  player_id: string
  player_name: string
  text: string
  created_at: string
}

export type EncounterMood = 'combat' | 'social' | 'exploration' | 'mystery' | ''

export interface EncounterEnemy {
  id: string
  name: string
  hp: number | null
  hp_max: number | null
  armor: string
  notes: string
}

export interface Encounter {
  id: string
  room_id: string
  title: string
  subtitle: string
  description: string
  mood: EncounterMood
  image_url: string | null
  enemies: EncounterEnemy[]
  objectives: string
  gm_notes: string
  round: number
  /** @deprecated use enemies */
  enemy_hp: number | null
  /** @deprecated use enemies */
  enemy_hp_max: number | null
  is_active: boolean
  created_at?: string
}

export type DiceSides = 3 | 4 | 6 | 8 | 10 | 12 | 20 | 100

export interface DiceRollResult {
  expression: string
  total: number
  details: string
  rolls: number[]
  modifier: number
}

export type FeedTab = 'all' | 'rolls' | 'chat'

export interface RoomTheme {
  blue: string
  gold: string
  bg: string
}

export interface RoomStageFx {
  darkness: number
  flashlightsEnabledFor: string[]
  allowPlayerThemeEditing?: boolean
  equalizerEnabled?: boolean
  beatFlickerEnabled?: boolean
  beatBpm?: number
  beatIntensity?: number
}

export interface RoomMusic {
  url: string | null
  video_id: string | null
  playing: boolean
  title: string | null
  volume: number
  source: 'youtube' | 'direct' | null
  stream_token: string | null
  use_host_proxy: boolean
  proxy_error: string | null
}

export interface PollOption {
  id: string
  text: string
}

export interface RoomPoll {
  id: string
  question: string
  options: PollOption[]
  votes: Record<string, string>
  open: boolean
  created_at: string
  duration_sec?: number | null
  ends_at?: string | null
}

export interface ScreenMessage {
  id: string
  title: string
  text: string
  target_player_id: string | null
  created_at: string
}

/** Ручной рейтинг — расставляет ГМ */
export interface HallOfFameEntry {
  id: string
  name: string
  /** Подпись под именем (достижение, титул) */
  label?: string
}

export interface HallOfFame {
  title: string
  entries: HallOfFameEntry[]
}

export type FeedItem =
  | { kind: 'roll'; data: RollEvent }
  | { kind: 'chat'; data: ChatMessage }
