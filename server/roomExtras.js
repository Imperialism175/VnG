import { randomUUID } from 'node:crypto'

export const DEFAULT_THEME = {
  blue: '#33ff33',
  gold: '#33ff33',
  bg: '#000000',
}

export function createRoomExtras() {
  return {
    theme: { ...DEFAULT_THEME },
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
}

export function sanitizeHallOfFame(raw) {
  const title = String(raw?.title ?? 'ЗАЛ СЛАВЫ').trim().slice(0, 80) || 'ЗАЛ СЛАВЫ'
  const entries = []
  if (Array.isArray(raw?.entries)) {
    for (const e of raw.entries.slice(0, 24)) {
      const name = String(e?.name ?? '').trim().slice(0, 48)
      if (!name) continue
      const labelRaw = String(e?.label ?? e?.note ?? '').trim().slice(0, 80)
      entries.push({
        id: typeof e?.id === 'string' && e.id.trim() ? e.id.trim().slice(0, 64) : randomUUID(),
        name,
        ...(labelRaw ? { label: labelRaw } : {}),
      })
    }
  }
  return { title, entries }
}

export function parseYoutubeVideoId(url) {
  if (!url || typeof url !== 'string') return null
  const raw = url.trim()
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id || null
    }
    if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v')
      if (v) return v
      const m = u.pathname.match(/\/(?:embed|v|shorts|watch)\/([^/?]+)/)
      if (m?.[1]) return m[1]
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw
  }
  return null
}

export async function fetchYoutubeTitle(videoId) {
  if (!videoId) return null
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { headers: { 'User-Agent': 'VnG/1.0' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.title === 'string' ? data.title.trim().slice(0, 200) : null
  } catch {
    return null
  }
}

export function sanitizeTheme(theme) {
  const hex = (v, fallback) =>
    typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : fallback
  return {
    blue: hex(theme?.blue, DEFAULT_THEME.blue),
    gold: hex(theme?.gold, DEFAULT_THEME.gold),
    bg: hex(theme?.bg, DEFAULT_THEME.bg),
  }
}

export function serializeRoomExtras(room) {
  if (!room.theme) {
    const extras = createRoomExtras()
    room.theme = extras.theme
    room.playerThemes = extras.playerThemes
    room.music = extras.music
    room.activePoll = extras.activePoll
    room.screenMessage = extras.screenMessage
    room.hallOfFame = extras.hallOfFame
    room.stageFx = extras.stageFx
    room.allowPlayerThemeEditing = extras.allowPlayerThemeEditing
    room.levelId = extras.levelId
    room.levelVariant = extras.levelVariant
    room.showLevelToPlayers = extras.showLevelToPlayers
  }
  if (!room.hallOfFame) {
    room.hallOfFame = { title: 'ЗАЛ СЛАВЫ', entries: [] }
  }
  if (!room.stageFx || typeof room.stageFx.darkness !== 'number') {
    room.stageFx = { darkness: 100, flashlightsEnabledFor: [], equalizerEnabled: true, beatFlickerEnabled: false, beatBpm: 120, beatIntensity: 40 }
  }
  if (!Array.isArray(room.stageFx.flashlightsEnabledFor)) {
    room.stageFx.flashlightsEnabledFor = []
  }
  if (typeof room.stageFx.equalizerEnabled !== 'boolean') {
    room.stageFx.equalizerEnabled = true
  }
  if (typeof room.stageFx.beatFlickerEnabled !== 'boolean') {
    room.stageFx.beatFlickerEnabled = false
  }
  const beatBpm = Number(room.stageFx.beatBpm)
  room.stageFx.beatBpm = Number.isFinite(beatBpm) ? Math.max(50, Math.min(220, Math.round(beatBpm))) : 120
  const beatIntensity = Number(room.stageFx.beatIntensity)
  room.stageFx.beatIntensity = Number.isFinite(beatIntensity) ? Math.max(0, Math.min(100, Math.round(beatIntensity))) : 40
  if (typeof room.allowPlayerThemeEditing !== 'boolean') {
    room.allowPlayerThemeEditing = true
  }
  if (typeof room.levelId !== 'string' || !room.levelId.trim()) {
    room.levelId = null
  }
  if (room.levelVariant !== 'alt') {
    room.levelVariant = 'main'
  }
  if (typeof room.showLevelToPlayers !== 'boolean') {
    room.showLevelToPlayers = false
  }
  return {
    room_theme: room.theme,
    player_themes: room.playerThemes,
    music: room.music,
    active_poll: room.activePoll,
    screen_message: room.screenMessage,
    hall_of_fame: room.hallOfFame,
    stage_fx: room.stageFx,
    allow_player_theme_editing: room.allowPlayerThemeEditing,
    level_id: room.levelId,
    level_variant: room.levelVariant,
    show_level_to_players: room.showLevelToPlayers,
  }
}

export function startPoll(room, question, optionTexts, durationSec = 0) {
  const options = optionTexts
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((text) => ({ id: randomUUID(), text }))
  if (!question?.trim() || options.length < 2) return null
  const timer = Number(durationSec)
  const safeDuration = Number.isFinite(timer) && timer > 0 ? Math.max(10, Math.min(7200, Math.round(timer))) : null
  const endsAt = safeDuration ? new Date(Date.now() + safeDuration * 1000).toISOString() : null
  room.activePoll = {
    id: randomUUID(),
    question: question.trim().slice(0, 200),
    options,
    votes: {},
    open: true,
    created_at: new Date().toISOString(),
    duration_sec: safeDuration,
    ends_at: endsAt,
  }
  return room.activePoll
}

export function clampMusicVolume(value, fallback = 70) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}
