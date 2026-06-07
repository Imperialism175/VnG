import type { HallOfFame, RoomMusic, RoomPoll, RoomStageFx, RoomTheme, ScreenMessage } from '@/types'
import { normalizeHallOfFame } from '@/lib/hallOfFame'
import { DEFAULT_THEME } from '@/lib/theme'

export interface RoomExtrasState {
  roomTheme: RoomTheme
  playerThemes: Record<string, RoomTheme>
  music: RoomMusic
  activePoll: RoomPoll | null
  screenMessage: ScreenMessage | null
  hallOfFame: HallOfFame
  stageFx: RoomStageFx
  allowPlayerThemeEditing: boolean
  levelId: string | null
  levelVariant: 'main' | 'alt'
  showLevelToPlayers: boolean
}

export const EMPTY_EXTRAS: RoomExtrasState = {
  roomTheme: DEFAULT_THEME,
  playerThemes: {},
  music: { url: null, video_id: null, playing: false, title: null, volume: 70, source: null, stream_token: null, use_host_proxy: true, proxy_error: null },
  activePoll: null,
  screenMessage: null,
  hallOfFame: { title: 'ЗАЛ СЛАВЫ', entries: [] },
  stageFx: { darkness: 100, flashlightsEnabledFor: [], equalizerEnabled: true, beatFlickerEnabled: false, beatBpm: 120, beatIntensity: 40 },
  allowPlayerThemeEditing: true,
  levelId: null,
  levelVariant: 'main',
  showLevelToPlayers: false,
}

function sanitizeHex(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : fallback
}

export function normalizeTheme(raw: unknown): RoomTheme {
  const t = (raw ?? {}) as Record<string, unknown>
  return {
    blue: sanitizeHex(t.blue, DEFAULT_THEME.blue),
    gold: sanitizeHex(t.gold, DEFAULT_THEME.gold),
    bg: sanitizeHex(t.bg, DEFAULT_THEME.bg),
    variant: t.variant === 'premium' ? 'premium' : 'default',
  }
}

export function normalizeMusic(raw: unknown): RoomMusic {
  const m = (raw ?? {}) as Record<string, unknown>
  const vol = Number(m.volume)
  const src = m.source as RoomMusic['source']
  return {
    url: (m.url as string) ?? null,
    video_id: (m.video_id ?? m.videoId ?? null) as string | null,
    playing: Boolean(m.playing),
    title: (m.title as string) ?? null,
    volume: Number.isFinite(vol) ? Math.max(0, Math.min(100, Math.round(vol))) : 70,
    source: src === 'youtube' || src === 'direct' ? src : null,
    stream_token: (m.stream_token ?? m.streamToken ?? null) as string | null,
    use_host_proxy: m.use_host_proxy !== false && m.useHostProxy !== false,
    proxy_error: (m.proxy_error ?? m.proxyError ?? null) as string | null,
  }
}

export function normalizePoll(raw: unknown): RoomPoll | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const options = Array.isArray(p.options)
    ? (p.options as Record<string, unknown>[]).map((o) => ({
        id: String(o.id),
        text: String(o.text ?? ''),
      }))
    : []
  return {
    id: String(p.id),
    question: String(p.question ?? ''),
    options,
    votes: (p.votes as Record<string, string>) ?? {},
    open: Boolean(p.open),
    created_at: String(p.created_at ?? p.createdAt ?? ''),
    duration_sec:
      Number.isFinite(Number(p.duration_sec ?? p.durationSec)) && Number(p.duration_sec ?? p.durationSec) > 0
        ? Math.round(Number(p.duration_sec ?? p.durationSec))
        : null,
    ends_at: typeof (p.ends_at ?? p.endsAt) === 'string' ? String(p.ends_at ?? p.endsAt) : null,
  }
}

export function normalizeScreenMessage(raw: unknown): ScreenMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  return {
    id: String(s.id),
    title: String(s.title ?? ''),
    text: String(s.text ?? ''),
    target_player_id: (s.target_player_id ?? s.targetPlayerId ?? null) as string | null,
    created_at: String(s.created_at ?? s.createdAt ?? ''),
  }
}

export function parseRoomExtras(state: Record<string, unknown>): RoomExtrasState {
  const playerThemes: Record<string, RoomTheme> = {}
  const rawPt = (state.player_themes ?? state.playerThemes ?? {}) as Record<string, unknown>
  for (const [pid, t] of Object.entries(rawPt)) {
    playerThemes[pid] = normalizeTheme(t)
  }
  const rawStageFx = (state.stage_fx as Record<string, unknown> | undefined) ?? {}
  const beatBpmRaw = Number(rawStageFx.beatBpm ?? rawStageFx.beat_bpm)
  const beatIntensityRaw = Number(rawStageFx.beatIntensity ?? rawStageFx.beat_intensity)
  return {
    roomTheme: normalizeTheme(state.room_theme ?? state.roomTheme),
    playerThemes,
    music: normalizeMusic(state.music),
    activePoll: normalizePoll(state.active_poll ?? state.activePoll),
    screenMessage: normalizeScreenMessage(state.screen_message ?? state.screenMessage),
    hallOfFame: normalizeHallOfFame(state.hall_of_fame ?? state.hallOfFame),
    stageFx: {
      darkness: Math.max(
        0,
        Math.min(
          100,
          Number.isFinite(Number(rawStageFx.darkness))
            ? Math.round(Number(rawStageFx.darkness))
            : 100
        )
      ),
      flashlightsEnabledFor: Array.isArray(rawStageFx.flashlightsEnabledFor ?? rawStageFx.flashlights_enabled_for)
        ? ((rawStageFx.flashlightsEnabledFor ?? rawStageFx.flashlights_enabled_for) as unknown[]).map((v) => String(v))
        : [],
      equalizerEnabled: rawStageFx.equalizerEnabled !== false && rawStageFx.equalizer_enabled !== false,
      beatFlickerEnabled: rawStageFx.beatFlickerEnabled === true || rawStageFx.beat_flicker_enabled === true,
      beatBpm: Number.isFinite(beatBpmRaw) ? Math.max(50, Math.min(220, Math.round(beatBpmRaw))) : 120,
      beatIntensity: Number.isFinite(beatIntensityRaw) ? Math.max(0, Math.min(100, Math.round(beatIntensityRaw))) : 40,
    },
    allowPlayerThemeEditing: state.allow_player_theme_editing !== false && state.allowPlayerThemeEditing !== false,
    levelId: typeof state.level_id === 'string' ? state.level_id : typeof state.levelId === 'string' ? state.levelId : null,
    levelVariant:
      state.level_variant === 'alt' || state.levelVariant === 'alt'
        ? 'alt'
        : 'main',
    showLevelToPlayers: state.show_level_to_players === true || state.showLevelToPlayers === true,
  }
}
