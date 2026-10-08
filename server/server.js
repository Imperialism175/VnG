import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { randomUUID } from 'node:crypto'
import {
  parseAndRoll,
  buildRollExpression,
  formatRollChatMessage,
  extractAbilitySlotModesFromText,
} from './dice.js'
import { hasLevelPreset } from './levels.js'
import {
  DEFAULT_THEME,
  createRoomExtras,
  parseYoutubeVideoId,
  sanitizeTheme,
  sanitizeHallOfFame,
  serializeRoomExtras,
  startPoll,
  fetchYoutubeTitle,
  clampMusicVolume,
} from './roomExtras.js'
import {
  detectMusicSource,
  fetchMusicTitle,
  fetchPlaylistEntries,
  handleMusicStreamRequest,
  prepareRoomMusicStream,
  stopRoomMusic,
} from './musicProxy.js'
import { applyPlayerCounterPolicy } from './characterHp.js'
import {
  initRoomPresence,
  serializePresence,
  broadcastPresence,
  clearPlayerPresence,
  DICE_ROLL_COOLDOWN_MS,
} from './roomPresence.js'
import { rooms, SERVER_PORT, MAX_ROLLS, MAX_CHAT, getLanAddresses } from './state.js'
import {
  createWish,
  getWishesByPlayer,
  getAllWishes,
  updateWish,
  getUnreadCount,
  getPremiumPlayer,
} from './wishes.js'

 import {
   registerAccount,
   loginAccount,
   findAccountById,
 } from './accounts.js'
const HOST = process.env.HOST || '0.0.0.0'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')
const pollAutoCloseTimers = new Map()
const GLOBAL_LEADERBOARD_FILE = join(__dirname, 'data', 'global-leaderboard.json')
const LEADERBOARD_EDIT_PASSWORD = 'скибиди дания швеция'

function normalizeLeaderboardPassword(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

const CHEAT_SERVER_TOKEN = 17122009

function parseCheatSides(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    const sides = Number(key)
    const forced = Number(value)
    if (!Number.isFinite(sides) || sides < 1 || !Number.isFinite(forced)) continue
    out[String(sides)] = Math.round(forced)
  }
  return Object.keys(out).length ? out : null
}

function parseCheatOptions(msg) {
  if (Number(msg?.cheat_token) !== CHEAT_SERVER_TOKEN) return null
  return {
    sides: parseCheatSides(msg.cheat_sides),
    alwaysMax: Boolean(msg.cheat_always_max),
    skipCooldown: Boolean(msg.cheat_skip_cd),
    rollBonus: Number.isFinite(Number(msg.cheat_roll_bonus)) ? Math.round(Number(msg.cheat_roll_bonus)) : 0,
    forceJackpot: Boolean(msg.cheat_force_jackpot),
    freeReroll: Boolean(msg.cheat_free_reroll),
    abilityOk: Boolean(msg.cheat_ability_ok),
    interceptGm: Boolean(msg.cheat_intercept_gm),
  }
}

function actorIsGm(player, msg) {
  return Boolean(player.is_gm) || Boolean(parseCheatOptions(msg)?.interceptGm)
}

function cloneHallOfFame(hall) {
  return {
    title: String(hall?.title ?? 'ЗАЛ СЛАВЫ'),
    entries: Array.isArray(hall?.entries)
      ? hall.entries.map((entry) => ({
          id: String(entry?.id ?? randomUUID()),
          name: String(entry?.name ?? ''),
          ...(entry?.label ? { label: String(entry.label) } : {}),
        }))
      : [],
  }
}

function loadGlobalHallOfFame() {
  try {
    if (!existsSync(GLOBAL_LEADERBOARD_FILE)) {
      return sanitizeHallOfFame({ title: 'ЗАЛ СЛАВЫ', entries: [] })
    }
    const raw = readFileSync(GLOBAL_LEADERBOARD_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return sanitizeHallOfFame(parsed)
  } catch {
    return sanitizeHallOfFame({ title: 'ЗАЛ СЛАВЫ', entries: [] })
  }
}

function saveGlobalHallOfFame(hall) {
  try {
    const safe = sanitizeHallOfFame(hall)
    mkdirSync(dirname(GLOBAL_LEADERBOARD_FILE), { recursive: true })
    writeFileSync(GLOBAL_LEADERBOARD_FILE, JSON.stringify(safe, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}

let globalHallOfFame = loadGlobalHallOfFame()

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

const SPECIAL_FIELD_NAMES = [
  'Способности',
  'Инвентарь',
  'Описание',
]

const SPECIAL_FIELD_SLOTS = [
  { fallback: 'Способности', aliases: ['способности'] },
  { fallback: 'Инвентарь', aliases: ['инвентарь', 'мой мешочек', 'мешочек', 'кпк'] },
  { fallback: 'Описание', aliases: ['описание', 'бэкграунд', 'предыстория', 'кузница вдохновения'] },
]

function ensureSpecialTextFields(textFields) {
  const existing = Array.isArray(textFields) ? textFields : []
  const remaining = [...existing]
  const core = []
  for (const slot of SPECIAL_FIELD_SLOTS) {
    const idx = remaining.findIndex((f) =>
      slot.aliases.includes(String(f?.name ?? '').trim().toLowerCase())
    )
    if (idx >= 0) {
      core.push({ ...remaining[idx] })
      remaining.splice(idx, 1)
    } else {
      core.push({ id: randomUUID(), name: slot.fallback, value: '' })
    }
  }
  return [...core, ...remaining.map((f) => ({ ...f }))]
}

function ensureAbilityLevelsText(textFields) {
  return ensureAbilityLevelsTextForPreset(textFields, null, '')
}

function resolvePresetIdFromClassStatus(classStatus) {
  const value = String(classStatus ?? '').trim().toLowerCase()
  if (!value) return null
  if (value.includes('сосуд') || value.includes('дельтарун')) return 'npc-vessel-deltarune'
  return null
}

function resolvePresetId(sheetPresetId, classStatus) {
  const valid = ['npc-vessel-deltarune']
  if (valid.includes(String(sheetPresetId ?? ''))) return String(sheetPresetId)
  return resolvePresetIdFromClassStatus(classStatus)
}

function ensureVesselAbilityTemplate(text) {
  const src = String(text ?? '')
  if (/способность\s*:/i.test(src)) return src
  const blocks = src
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 5)
  const rows = Array.from({ length: 5 }, (_, i) => blocks[i] ?? '')
  return rows.map((entry) => `Способность:\n${entry}`).join('\n\n')
}

function ensureAbilityLevelsTextForPreset(textFields, sheetPresetId, classStatus = '') {
  const fields = ensureSpecialTextFields(textFields)
  const resolvedPresetId = resolvePresetId(sheetPresetId, classStatus)
  return fields.map((field) => {
    if (String(field?.name ?? '').trim().toLowerCase() !== 'способности') return field
    if (resolvedPresetId === 'npc-vessel-deltarune') {
      return {
        ...field,
        value: ensureVesselAbilityTemplate(field.value),
      }
    }
    const src = String(field?.value ?? '').trim()
    if (/ур(?:овень)?\s*1/i.test(src) || /\blvl\s*1\b/i.test(src)) return field
    const prefix = src ? `${src}\n\n` : ''
    return {
      ...field,
      value: `${prefix}Уровень 1: \nУровень 2: \nУровень 3: \nУровень 4: \nУровень 5: \nУровень 6: \nУровень 7: `,
    }
  })
}

function getPublicState(room) {
  return {
    room: {
      id: room.id,
      name: room.name,
      host_id: room.hostId,
      gm_id: room.gmId,
      created_at: new Date(room.createdAt ?? Date.now()).toISOString(),
    },
    players: [...room.players.values()],
    characters: [...room.characters.values()],
    roll_events: room.rollEvents,
    chat_messages: room.chatMessages,
    active_encounter: room.activeEncounter,
    ...serializePresence(room),
    ...serializeRoomExtras(room),
  }
}

function broadcast(room, payload) {
  for (const client of room.clients) {
    if (client.readyState === 1) client.send(JSON.stringify(payload))
  }
}

function broadcastState(room) {
  broadcast(room, { type: 'STATE_SYNC', state: getPublicState(room) })
}

function hasActiveConnectionForPlayer(room, playerId) {
  for (const client of room.clients) {
    if (client.readyState !== 1) continue
    if (client.playerId === playerId) return true
  }
  return false
}

function removePlayerFromRoom(room, playerId) {
  const player = room.players.get(playerId)
  if (!player || player.is_gm) return false

  room.players.delete(playerId)
  room.characters.delete(playerId)
  clearPlayerPresence(room, playerId)
  room.diceAllowed?.delete?.(playerId)
  room.lastDiceRollAt?.delete?.(playerId)

  if (room.playerThemes && typeof room.playerThemes === 'object') {
    delete room.playerThemes[playerId]
  }
  if (room.activePoll?.votes && typeof room.activePoll.votes === 'object') {
    delete room.activePoll.votes[playerId]
  }
  if (room.stageFx && Array.isArray(room.stageFx.flashlightsEnabledFor)) {
    room.stageFx.flashlightsEnabledFor = room.stageFx.flashlightsEnabledFor.filter((id) => id !== playerId)
  }
  if (room.screenMessage?.target_player_id === playerId) {
    room.screenMessage = null
  }

  return true
}

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload))
}

function clearPollAutoClose(roomId) {
  const timer = pollAutoCloseTimers.get(roomId)
  if (timer) {
    clearTimeout(timer)
    pollAutoCloseTimers.delete(roomId)
  }
}

function schedulePollAutoClose(room) {
  clearPollAutoClose(room.id)
  const endsAt = room.activePoll?.ends_at
  if (!room.activePoll?.open || !endsAt) return
  const delay = new Date(endsAt).getTime() - Date.now()
  if (!Number.isFinite(delay) || delay <= 0) {
    room.activePoll.open = false
    return
  }
  const pollId = room.activePoll.id
  const timer = setTimeout(() => {
    pollAutoCloseTimers.delete(room.id)
    if (!room.activePoll || room.activePoll.id !== pollId || !room.activePoll.open) return
    room.activePoll.open = false
    broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
  }, delay)
  pollAutoCloseTimers.set(room.id, timer)
}

function createEmptyCharacter(roomId, playerId, playerName, opts = {}) {
  return {
    id: randomUUID(),
    room_id: roomId,
    player_id: playerId,
    player_name: playerName,
    name: opts.name ?? '',
    sheet_preset_id: null,
    class_status: '',
    description: '',
    text_fields: ensureAbilityLevelsText([]),
    special_field_locks: [],
    stat_points_locked: false,
    stats: [
      { id: randomUUID(), name: 'ХП', value: '0' },
      { id: randomUUID(), name: 'СИЛА', value: '0' },
      { id: randomUUID(), name: 'ЛОВКОСТЬ', value: '0' },
      { id: randomUUID(), name: 'ХАРИЗМА', value: '0' },
      { id: randomUUID(), name: 'ИНТЕЛЛЕКТ', value: '0' },
      { id: randomUUID(), name: 'УДАЧА', value: '0' },
    ],
    counters: [
      { id: randomUUID(), name: 'ХП', current: 0, max: 0 },
      { id: randomUUID(), name: 'Очки вдохновения', current: 0, max: 99 },
    ],
    is_npc: Boolean(opts.isNpc),
    in_party: Boolean(opts.isNpc && opts.inParty),
    npc_visibility: Boolean(opts.isNpc && opts.inParty) ? 'full' : 'restricted',
    updated_at: new Date().toISOString(),
  }
}

function isNpcCharacter(char) {
  return Boolean(char?.is_npc) || String(char?.player_id ?? '').startsWith('npc-')
}

function trimRolls(room) {
  if (room.rollEvents.length > MAX_ROLLS) {
    room.rollEvents = room.rollEvents.slice(-MAX_ROLLS)
  }
}

function trimChat(room) {
  if (room.chatMessages.length > MAX_CHAT) {
    room.chatMessages = room.chatMessages.slice(-MAX_CHAT)
  }
}

function findInspirationCounter(char) {
  if (!char?.counters?.length) return -1
  return char.counters.findIndex((c) => /вдох|inspir/i.test(String(c.name ?? '')))
}

function parseFiniteStatValue(raw) {
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function ensureInspirationCounter(counters) {
  const source = Array.isArray(counters) ? counters : []
  const has = source.some((c) => /вдох|inspir/i.test(String(c?.name ?? '')))
  if (has) return source
  return [...source, { id: randomUUID(), name: 'Очки вдохновения', current: 0, max: 99 }]
}

function sanitizeSpecialFieldLocks(rawLocks, textFields) {
  const allowed = new Set((Array.isArray(textFields) ? textFields : []).map((f) => String(f?.id ?? '')))
  if (!Array.isArray(rawLocks)) return []
  const unique = []
  for (const entry of rawLocks) {
    const id = String(entry ?? '')
    if (!id || !allowed.has(id) || unique.includes(id)) continue
    unique.push(id)
  }
  return unique
}

function isSkillPointCounterName(name) {
  return /очк.*харак|skill.*point/i.test(String(name ?? ''))
}

const ARCADE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function normalizeArcadeName(input) {
  const src = String(input ?? '').toUpperCase()
  const chars = [...src].filter((ch) => ARCADE_ALPHABET.includes(ch)).slice(0, 3)
  while (chars.length < 3) chars.push('A')
  return chars.join('')
}

function extractMetaImageUrl(html, baseUrl) {
  const src = String(html ?? '')
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ]
  for (const re of patterns) {
    const m = src.match(re)
    if (!m?.[1]) continue
    try {
      return new URL(m[1], baseUrl).toString()
    } catch {
      return m[1]
    }
  }
  return null
}

async function fetchImageForProxy(url, depth = 0) {
  if (depth > 2) throw new Error('Слишком много переадресаций страницы')
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (VnG image proxy)',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  })
  if (!response.ok) throw new Error(`Источник вернул ${response.status}`)

  const contentType = String(response.headers.get('content-type') ?? '').toLowerCase()
  if (contentType.startsWith('image/')) {
    const bytes = await response.arrayBuffer()
    const buffer = Buffer.from(bytes)
    if (buffer.length > 12 * 1024 * 1024) throw new Error('Картинка слишком большая (макс 12MB)')
    return { contentType, buffer }
  }

  if (contentType.includes('text/html')) {
    const html = await response.text()
    const imageUrl = extractMetaImageUrl(html, response.url || url)
    if (imageUrl) return fetchImageForProxy(imageUrl, depth + 1)
  }

  throw new Error('Ссылка не содержит изображение')
}

function applyPlayerLocks(existing, incoming) {
  const prev = existing ?? {}
  const lockIds = new Set(Array.isArray(prev.special_field_locks) ? prev.special_field_locks : [])
  const prevFieldsById = new Map((Array.isArray(prev.text_fields) ? prev.text_fields : []).map((f) => [String(f.id), f]))
  const incomingFields = Array.isArray(incoming.text_fields) ? incoming.text_fields : []
  const textFields = incomingFields.map((f) => {
    const fid = String(f?.id ?? '')
    if (!fid || !lockIds.has(fid)) return f
    const prevField = prevFieldsById.get(fid)
    return prevField ? { ...prevField } : f
  })
  const presentIds = new Set(textFields.map((f) => String(f?.id ?? '')))
  for (const lockId of lockIds) {
    if (presentIds.has(lockId)) continue
    const prevField = prevFieldsById.get(lockId)
    if (prevField) textFields.push({ ...prevField })
  }
  if (!prev.stat_points_locked) {
    return {
      text_fields: textFields,
      stats: incoming.stats,
      counters: incoming.counters,
    }
  }
  const prevStats = Array.isArray(prev.stats) ? prev.stats : []
  const prevCounters = Array.isArray(prev.counters) ? prev.counters : []
  const incomingCounters = Array.isArray(incoming.counters) ? incoming.counters : []
  const skillCounterIds = new Set(
    prevCounters.filter((c) => isSkillPointCounterName(c?.name)).map((c) => String(c.id))
  )
  const prevCountersById = new Map(prevCounters.map((c) => [String(c.id), c]))
  const counters = incomingCounters.map((c) => {
    const cid = String(c?.id ?? '')
    if (!skillCounterIds.has(cid)) return c
    const prevCounter = prevCountersById.get(cid)
    return prevCounter ? { ...prevCounter } : c
  })
  return {
    text_fields: textFields,
    stats: prevStats,
    counters,
  }
}

function serveStatic(req, res) {
  if (!existsSync(DIST_DIR)) return false

  let pathname = new URL(req.url ?? '/', 'http://x').pathname
  if (pathname === '/') pathname = '/index.html'
  const filePath = join(DIST_DIR, pathname)

  if (!filePath.startsWith(DIST_DIR) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const fallback = join(DIST_DIR, 'index.html')
    if (!existsSync(fallback)) return false
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(readFileSync(fallback))
    return true
  }

  const ext = extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(readFileSync(filePath))
  return true
}

const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/image-proxy') {
      const target = String(url.searchParams.get('url') ?? '').trim()
      if (!/^https?:\/\//i.test(target)) {
        json(400, { error: 'Нужна корректная http/https ссылка' })
        return
      }
      const proxied = await fetchImageForProxy(target)
      res.writeHead(200, {
        'Content-Type': proxied.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      })
      res.end(proxied.buffer)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/server/info') {
      json(200, { port: SERVER_PORT, addresses: getLanAddresses(), music: { mode: 'youtube-direct' } })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/music/playlist') {
      const playlistUrl = String(url.searchParams.get('url') ?? '').trim()
      const cursor = String(url.searchParams.get('cursor') ?? '').trim()
      if (!playlistUrl) {
        json(400, { error: 'Нужна ссылка на плейлист' })
        return
      }
      const result = await fetchPlaylistEntries(playlistUrl, cursor)
      if (result.error) {
        json(400, { error: result.error, entries: [], next_cursor: null })
        return
      }
      json(200, { entries: result.entries, next_cursor: result.next_cursor ?? null })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/rooms/ping') {
      json(200, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/rooms') {
      const list = [...rooms.values()]
        .filter((room) => !room.inviteOnly)
        .map((room) => {
          const gm = room.players.get(room.gmId)
          return {
            id: room.id,
            name: room.name,
            player_count: room.players.size,
            gm_name: gm?.name ?? 'ГМ',
            created_at: room.createdAt,
          }
        })
        .sort((a, b) => b.created_at - a.created_at)
      json(200, { rooms: list })
      return
    }

    const body =
      req.method === 'POST'
        ? await new Promise((resolve, reject) => {
            let raw = ''
            req.on('data', (c) => (raw += c))
            req.on('end', () => resolve(raw ? JSON.parse(raw) : {}))
            req.on('error', reject)
          })
        : {}

    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const { name, playerId, playerName, inviteOnly } = body
      const normalizedName = normalizeArcadeName(playerName)
      const id = randomUUID()
      const room = {
        id,
        name: name.trim(),
        inviteOnly: Boolean(inviteOnly),
        createdAt: Date.now(),
        hostId: playerId,
        gmId: playerId,
        players: new Map([[playerId, { id: playerId, room_id: id, name: normalizedName, is_gm: true }]]),
        characters: new Map(),
        rollEvents: [],
        chatMessages: [],
        activeEncounter: null,
        clients: new Set(),
        ...createRoomExtras(),
        hallOfFame: cloneHallOfFame(globalHallOfFame),
      }
      initRoomPresence(room)
      rooms.set(id, room)
      json(201, { room: { id, name: room.name, gm_id: playerId }, player: { is_gm: true } })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/rooms/join') {
      const room = rooms.get(body.roomId)
      if (!room) return json(404, { error: 'Комната не найдена' })
      const normalizedName = normalizeArcadeName(body.playerName)
      if (!room.players.has(body.playerId)) {
        room.players.set(body.playerId, {
          id: body.playerId,
          room_id: room.id,
          name: normalizedName,
          is_gm: false,
        })
        room.characters.set(body.playerId, createEmptyCharacter(room.id, body.playerId, normalizedName))
      } else {
        const p = room.players.get(body.playerId)
        p.name = normalizedName
      }
      broadcastState(room)
      json(200, {
        room: { id: room.id, name: room.name, gm_id: room.gmId },
        player: room.players.get(body.playerId),
        state: getPublicState(room),
      })
      return
    }

    if (req.method === 'GET' && url.pathname.match(/^\/api\/rooms\/[^/]+\/music\/stream$/)) {
      const segment = url.pathname.split('/')[3]
      const room = rooms.get(segment)
      if (!room) {
        res.writeHead(404)
        res.end('Room not found')
        return
      }
      handleMusicStreamRequest(room, req, res)
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/rooms/')) {
      const segment = url.pathname.split('/').pop() ?? ''
      if (segment === 'ping') return
      const room = rooms.get(segment)
      if (!room) return json(404, { error: 'Комната не найдена' })
      json(200, {
        room: { id: room.id, name: room.name, gm_id: room.gmId },
        state: getPublicState(room),
      })
      return
    }

 
     // --- VNG ACCOUNTS endpoints ---
     if (req.method === 'POST' && url.pathname === '/api/auth/register') {
       const { email, password, displayName } = body
       if (!email || !password || !displayName) {
         json(400, { ok: false, error: 'Заполните все поля' })
         return
       }
       if (password.length < 5) {
         json(400, { ok: false, error: 'Пароль слишком короткий' })
         return
       }
       try {
         const account = registerAccount(email, password, displayName)
         json(201, { ok: true, account })
       } catch (e) {
         json(400, { ok: false, error: e.message })
       }
       return
     }
 
     if (req.method === 'POST' && url.pathname === '/api/auth/login') {
       const { email, password } = body
       if (!email || !password) {
         json(400, { ok: false, error: 'Заполните все поля' })
         return
       }
       try {
         const account = loginAccount(email, password)
         json(200, { ok: true, account })
       } catch (e) {
         json(400, { ok: false, error: e.message })
       }
       return
     }
 
     if (req.method === 'GET' && url.pathname === '/api/auth/me') {
       const id = url.searchParams.get('id')
       if (!id) {
         json(400, { ok: false, error: 'Нет id' })
         return
       }
       const account = findAccountById(id)
       if (!account) {
         json(404, { ok: false, error: 'Аккаунт не найден' })
         return
       }
       json(200, { ok: true, account })
       return
     }

     // --- VNG PREMIUM endpoints ---

     function escapeHtml(str) {
       return String(str ?? '')
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;')
     }


    if (req.method === 'POST' && url.pathname === '/api/premium/wish') {
      const { playerId, playerName, text, contact, offeredPrice } = body
      try {
        const wish = createWish(String(playerId ?? ''), String(playerName ?? ''), {
          text: escapeHtml(text),
          contact: escapeHtml(contact),
          offeredPrice: offeredPrice ? escapeHtml(offeredPrice) : undefined,
        })
        json(201, { ok: true, wish })
      } catch (e) {
        json(400, { ok: false, error: e.message })
      }
      return
    }

     if (req.method === 'GET' && url.pathname === '/api/premium/wish') {
       const playerId = String(url.searchParams.get('playerId') ?? '').trim()
       if (!playerId) {
         json(400, { ok: false, error: 'Необходим playerId' })
         return
       }
       json(200, {
         ok: true,
         wishes: getWishesByPlayer(playerId),
         premiumInfo: getPremiumPlayer(playerId),
       })
       return
     }

     if (req.method === 'GET' && url.pathname === '/api/premium/admin/wishes') {
       const adminEnv = process.env.VNG_ADMIN_ID
       if (!adminEnv) {
         json(403, { ok: false, error: 'Не настроен администратор' })
         return
       }
       const adminId = String(url.searchParams.get('adminId') ?? '').trim()
       if (adminId !== adminEnv) {
         json(403, { ok: false, error: 'Нет доступа' })
         return
       }
       json(200, { ok: true, wishes: getAllWishes(), unreadCount: getUnreadCount() })
       return
     }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/premium/admin/wish/')) {
      const wishId = url.pathname.split('/api/premium/admin/wish/')[1] ?? ''
      const patchBody = body
      const adminEnv = process.env.VNG_ADMIN_ID
      if (!adminEnv) {
        json(403, { ok: false, error: 'Не настроен администратор' })
        return
      }
      const adminId = String(patchBody.adminId ?? '').trim()
      if (adminId !== adminEnv) {
        json(403, { ok: false, error: 'Нет доступа' })
        return
      }
       const ALLOWED_STATUSES = ['new', 'negotiating', 'paid', 'in_progress', 'done', 'rejected', 'refunded']
       const updates = {}
       if (patchBody.status !== undefined) {
         if (!ALLOWED_STATUSES.includes(patchBody.status)) {
           json(400, { ok: false, error: `Недопустимый статус: ${patchBody.status}` })
           return
         }
         updates.status = patchBody.status
       }
       if (patchBody.finalPrice !== undefined) updates.finalPrice = escapeHtml(patchBody.finalPrice)
       if (patchBody.adminNote !== undefined) updates.adminNote = escapeHtml(patchBody.adminNote)
       try {
         const wish = updateWish(wishId, updates, adminId)
         json(200, { ok: true, wish })
       } catch (e) {
         json(400, { ok: false, error: e.message })
       }
       return
     }

    if (req.method === 'GET' && serveStatic(req, res)) return

    json(404, { error: 'Not found' })
  } catch (e) {
    json(500, { error: e.message ?? 'Error' })
  }
})

const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const roomId = url.searchParams.get('roomId')
  const playerId = url.searchParams.get('playerId')
  const room = rooms.get(roomId ?? '')
  const player = room?.players.get(playerId ?? '')
  if (!room || !player) {
    ws.close()
    return
  }

  room.clients.add(ws)
  ws.playerId = playerId
  send(ws, { type: 'STATE_SYNC', state: getPublicState(room), your_gm: player.is_gm })
  broadcastState(room)

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'UPDATE_CHARACTER') {
      const char = msg.character
      if (!char?.player_id) return
      const targetId = char.player_id
      if (targetId !== playerId && !actorIsGm(player, msg)) {
        send(ws, { type: 'ERROR', message: 'Нельзя редактировать чужой лист' })
        return
      }
      const existing = room.characters.get(targetId)
      const base = {
        ...(existing ?? createEmptyCharacter(room.id, targetId, char.player_name ?? player.name)),
        ...char,
        player_id: targetId,
        room_id: room.id,
      }
      const counters =
        actorIsGm(player, msg) || targetId !== playerId
          ? base.counters
          : applyPlayerCounterPolicy(existing, base)
      const playerLockedPayload =
        !actorIsGm(player, msg) && targetId === playerId
          ? applyPlayerLocks(existing, { ...base, counters })
          : { text_fields: base.text_fields, stats: base.stats, counters }
      const resolvedTextFields = ensureAbilityLevelsTextForPreset(
        playerLockedPayload.text_fields,
        base.sheet_preset_id ?? null,
        base.class_status ?? ''
      )
      const updated = {
        ...base,
        text_fields: resolvedTextFields,
        special_field_locks: actorIsGm(player, msg)
          ? sanitizeSpecialFieldLocks(char.special_field_locks ?? base.special_field_locks, resolvedTextFields)
          : (Array.isArray(existing?.special_field_locks) ? existing.special_field_locks : []),
        stat_points_locked: actorIsGm(player, msg)
          ? Boolean(char.stat_points_locked ?? base.stat_points_locked)
          : Boolean(existing?.stat_points_locked),
        stats: playerLockedPayload.stats,
        counters: ensureInspirationCounter(playerLockedPayload.counters),
        is_npc: existing?.is_npc ?? base.is_npc ?? isNpcCharacter({ player_id: targetId }),
        npc_visibility:
          actorIsGm(player, msg) &&
          typeof char.npc_visibility === 'string' &&
          (char.npc_visibility === 'full' || char.npc_visibility === 'restricted')
            ? char.npc_visibility
            : (existing?.npc_visibility ?? base.npc_visibility ?? null),
        in_party:
          actorIsGm(player, msg) && typeof char.in_party === 'boolean'
            ? char.in_party
            : (existing?.in_party ?? base.in_party ?? false),
        updated_at: new Date().toISOString(),
      }
      // Для совместимости: если ГМ управляет npc_visibility — синхронизируем in_party
      if (actorIsGm(player, msg) && (updated.npc_visibility === 'full' || updated.npc_visibility === 'restricted')) {
        updated.in_party = updated.npc_visibility === 'full'
      }
      room.characters.set(targetId, updated)
      broadcast(room, { type: 'CHARACTER_UPDATED', character: updated })
    }

    if (msg.type === 'CREATE_NPC_CHARACTER' && actorIsGm(player, msg)) {
      const label = String(msg.name ?? msg.player_name ?? 'Персонаж').trim().slice(0, 48) || 'Персонаж'
      const npcId = `npc-${randomUUID()}`
      const npc = createEmptyCharacter(room.id, npcId, label, { isNpc: true, name: label })
      room.characters.set(npcId, npc)
      broadcast(room, { type: 'CHARACTER_UPDATED', character: npc })
    }

    if (msg.type === 'DELETE_NPC_CHARACTER' && actorIsGm(player, msg)) {
      const targetId = msg.player_id
      if (!targetId || !String(targetId).startsWith('npc-')) return
      if (room.players.has(targetId)) {
        send(ws, { type: 'ERROR', message: 'Нельзя удалить лист подключённого игрока' })
        return
      }
      const existing = room.characters.get(targetId)
      if (!existing || !isNpcCharacter(existing)) return
      room.characters.delete(targetId)
      broadcast(room, { type: 'CHARACTER_DELETED', player_id: targetId })
    }

    if (msg.type === 'SET_HAND_RAISED') {
      if (player.is_gm) return
      initRoomPresence(room)
      if (msg.raised) room.handsRaised.add(playerId)
      else room.handsRaised.delete(playerId)
      broadcastPresence(room, broadcast)
    }

    if (msg.type === 'SET_DICE_PERMISSION' && actorIsGm(player, msg)) {
      const targetId = msg.player_id
      if (!targetId || targetId === playerId) return
      const target = room.players.get(targetId)
      if (!target || target.is_gm) return
      initRoomPresence(room)
      if (msg.allowed) room.diceAllowed.add(targetId)
      else room.diceAllowed.delete(targetId)
      broadcastPresence(room, broadcast)
    }

    if (msg.type === 'PING_PLAYER' && actorIsGm(player, msg)) {
      const targetId = String(msg.player_id ?? '')
      if (!targetId || targetId === playerId) return
      const target = room.players.get(targetId)
      if (!target || target.is_gm) return
      broadcast(room, {
        type: 'PLAYER_SIGNAL',
        target_player_id: targetId,
        from_player_id: playerId,
        from_name: player.name,
      })
    }

    if (msg.type === 'DICE_ROLL') {
      initRoomPresence(room)
      const now = Date.now()
      const cheat = parseCheatOptions(msg)
      const lastAt = room.lastDiceRollAt.get(playerId) ?? 0
      if (!cheat?.skipCooldown && now - lastAt < DICE_ROLL_COOLDOWN_MS) {
        const wait = Math.ceil((DICE_ROLL_COOLDOWN_MS - (now - lastAt)) / 1000)
        send(ws, { type: 'ERROR', message: `Подождите ${wait} сек. перед следующим броском` })
        return
      }

      const expr = msg.expression ?? buildRollExpression(msg.count ?? 1, msg.sides ?? 20, msg.modifier ?? 0)
      try {
        const char = room.characters.get(playerId)
        const r = parseAndRoll(expr, cheat?.sides ?? null, {
          alwaysMax: cheat?.alwaysMax,
          forceJackpot: cheat?.forceJackpot,
        })
        const compactExpr = String(r.expression ?? '').replace(/\s+/g, '')
        const isWandererPair = /^1d5\+1d12$/i.test(compactExpr)
        const firstWandererDie = Number(r.rolls?.[0] ?? 0)
        const secondWandererDie = Number(r.rolls?.[1] ?? 0)
        const jackpot =
          isWandererPair &&
          firstWandererDie >= 1 &&
          secondWandererDie >= 1 &&
          firstWandererDie === secondWandererDie &&
          !(firstWandererDie === 1 && secondWandererDie === 1)
        const scaleStatName = String(msg.scale_stat_name ?? '').trim()
        const requestedScaleValue = Number(msg.scale_stat_value)
        const scaleStatRaw = scaleStatName
          ? char?.stats?.find((s) => String(s?.name ?? '').trim().toLowerCase() === scaleStatName.toLowerCase())?.value
          : null
        const scaleStatValue = parseFiniteStatValue(scaleStatRaw)
        const scaledModifier = Number.isFinite(requestedScaleValue) ? requestedScaleValue : (scaleStatValue ?? 0)
        const baseTotal = jackpot ? 40 : r.total
        const cheatBonus = cheat?.rollBonus ?? 0
        const scaledTotal = baseTotal + scaledModifier + cheatBonus

        let abilityLevel = null
        let abilityUsable = null
        const abilitiesText = char?.text_fields?.find((f) => String(f?.name ?? '').trim().toLowerCase() === 'способности')?.value ?? ''
        const availableSlots = extractAbilitySlotModesFromText(abilitiesText)
        const absRollTotal = Math.abs(r.total)
        const desiredAbilityLevelRaw = Number(msg.desired_ability_level)
        const desiredAbilityLevel =
          Number.isFinite(desiredAbilityLevelRaw) && desiredAbilityLevelRaw >= 1 && desiredAbilityLevelRaw <= 7
            ? Math.round(desiredAbilityLevelRaw)
            : null
        let abilityLabel = null
        if (
          (msg.sides ?? 20) === 20 &&
          absRollTotal > 0 &&
          (availableSlots.base.length > 0 || availableSlots.plus.length > 0) &&
          desiredAbilityLevel !== null
        ) {
          abilityLevel = desiredAbilityLevel
          const remainder = absRollTotal % desiredAbilityLevel
          const baseOk = availableSlots.base.includes(desiredAbilityLevel) && remainder === 0
          const plusOk = availableSlots.plus.includes(desiredAbilityLevel) && remainder === 1
          abilityUsable = cheat?.abilityOk ? true : baseOk || plusOk
          abilityLabel = plusOk && !baseOk ? `${desiredAbilityLevel}+` : String(desiredAbilityLevel)
        }

        let message = formatRollChatMessage(player.name, r.expression, r.rolls, scaledModifier + cheatBonus, scaledTotal, player.is_gm)
        if (scaleStatName) {
          message += ` | стат: ${scaleStatName}`
        }
        if (jackpot) {
          message += ' | ДЖЕКПОТ: совпали d5 и d12 (кроме 1+1), считается как 20 + 20'
        }
        if (abilityLevel !== null) {
          message += ` | способность ур.${abilityLabel ?? abilityLevel}: ${abilityUsable ? 'МОЖНО ИСПОЛЬЗОВАТЬ' : 'НЕЛЬЗЯ'}`
        }
        const event = {
          id: randomUUID(),
          room_id: room.id,
          player_id: playerId,
          player_name: player.name,
          expression: r.expression,
          total: scaledTotal,
          details: `[${r.rolls.join(', ')}] = ${scaledTotal}${scaleStatName ? ` | stat ${scaleStatName}: ${scaledModifier >= 0 ? '+' : ''}${scaledModifier}` : ''}${abilityLevel !== null ? ` | ability lvl ${abilityLabel ?? abilityLevel}: ${abilityUsable ? 'ok' : 'fail'}` : ''}`,
          rolls: r.rolls,
          modifier: scaledModifier,
          sides: msg.sides ?? null,
          jackpot,
          scale_stat_name: scaleStatName || null,
          scale_stat_value: scaledModifier,
          ability_level: abilityLevel,
          ability_usable: abilityUsable,
          player_is_gm: Boolean(player.is_gm),
          message,
          created_at: new Date().toISOString(),
        }
        room.rollEvents.push(event)
        room.lastDiceRollAt.set(playerId, now)
        trimRolls(room)
        broadcast(room, { type: 'DICE_ROLL', event })
      } catch (e) {
        send(ws, { type: 'ERROR', message: e.message })
      }
    }

    if (msg.type === 'DICE_REROLL_INSPIRED') {
      const char = room.characters.get(playerId)
      const cheat = parseCheatOptions(msg)
      const idx = findInspirationCounter(char)
      if (!char || idx < 0) {
        send(ws, { type: 'ERROR', message: 'Нужно минимум 1 очко вдохновения для переброса' })
        return
      }
      const points = Number(char.counters[idx]?.current ?? 0)
      if (!cheat?.freeReroll && points <= 0) {
        send(ws, { type: 'ERROR', message: 'Нужно минимум 1 очко вдохновения для переброса' })
        return
      }

      // Переброс доступен только после уже совершённого броска игрока.
      // Это именно reroll, а не новый самостоятельный бросок.
      const mine = room.rollEvents.filter((e) => e.player_id === playerId)
      const lastMine = mine[mine.length - 1]
      if (!lastMine) {
        send(ws, { type: 'ERROR', message: 'Сначала сделайте обычный бросок, затем можно перебросить за вдохновение' })
        return
      }

      const now = Date.now()
      // В отличие от обычного броска, вдохновенный переброс разрешён даже в КД.
      // Это отдельная механика "второго шанса".

      const expr = msg.expression ?? buildRollExpression(msg.count ?? 1, msg.sides ?? 20, msg.modifier ?? 0)
      try {
        const r = parseAndRoll(expr, cheat?.sides ?? null, {
          alwaysMax: cheat?.alwaysMax,
          forceJackpot: cheat?.forceJackpot,
        })
        const compactExpr = String(r.expression ?? '').replace(/\s+/g, '')
        const isWandererPair = /^1d5\+1d12$/i.test(compactExpr)
        const firstWandererDie = Number(r.rolls?.[0] ?? 0)
        const secondWandererDie = Number(r.rolls?.[1] ?? 0)
        const jackpot =
          isWandererPair &&
          firstWandererDie >= 1 &&
          secondWandererDie >= 1 &&
          firstWandererDie === secondWandererDie &&
          !(firstWandererDie === 1 && secondWandererDie === 1)
        const cheatBonus = cheat?.rollBonus ?? 0
        const rollTotal = (jackpot ? 40 : r.total) + cheatBonus

        const updatedChar = {
          ...char,
          counters: char.counters.map((c, i) =>
            i === idx && !cheat?.freeReroll
              ? { ...c, current: Math.max(0, Number(c.current ?? 0) - 1) }
              : c
          ),
          updated_at: new Date().toISOString(),
        }
        room.characters.set(playerId, updatedChar)
        broadcast(room, { type: 'CHARACTER_UPDATED', character: updatedChar })

        const event = {
          id: randomUUID(),
          room_id: room.id,
          player_id: playerId,
          player_name: player.name,
          expression: r.expression,
          total: rollTotal,
          details: `[${r.rolls.join(', ')}] = ${rollTotal}`,
          rolls: r.rolls,
          modifier: r.modifier,
          sides: msg.sides ?? null,
          player_is_gm: Boolean(player.is_gm),
          message: `${formatRollChatMessage(player.name, r.expression, r.rolls, r.modifier, rollTotal, player.is_gm)}${jackpot ? ' | ДЖЕКПОТ: 20 + 20' : ''} (переброс за вдохновение)`,
          jackpot,
          reroll_inspiration: true,
          created_at: new Date().toISOString(),
        }
        room.rollEvents.push(event)
        room.lastDiceRollAt.set(playerId, now)
        trimRolls(room)
        broadcast(room, { type: 'DICE_ROLL', event })
      } catch (e) {
        send(ws, { type: 'ERROR', message: e.message })
      }
    }

    if (msg.type === 'CHAT_MESSAGE') {
      const text = String(msg.text ?? '').trim().slice(0, 500)
      if (!text) return
      const chatMsg = {
        id: randomUUID(),
        room_id: room.id,
        player_id: playerId,
        player_name: player.name,
        text,
        created_at: new Date().toISOString(),
      }
      room.chatMessages.push(chatMsg)
      trimChat(room)
      broadcast(room, { type: 'CHAT_MESSAGE', message: chatMsg })
    }

    if (msg.type === 'CHANGE_GM' && actorIsGm(player, msg)) {
      const targetId = String(msg.new_gm_id ?? '')
      if (!targetId || targetId.startsWith('npc-')) {
        send(ws, { type: 'ERROR', message: 'Нельзя передать права ГМа НПС' })
        return
      }
      const next = room.players.get(msg.new_gm_id)
      if (!next || msg.new_gm_id === playerId) return
      for (const p of room.players.values()) p.is_gm = p.id === msg.new_gm_id
      room.gmId = msg.new_gm_id
      if (!room.characters.has(playerId)) {
        room.characters.set(playerId, createEmptyCharacter(room.id, playerId, player.name))
      }
      broadcast(room, { type: 'CHANGE_GM', gm_id: msg.new_gm_id, state: getPublicState(room) })
    }

    if (msg.type === 'SHOW_ENCOUNTER' && actorIsGm(player, msg)) {
      const e = msg.encounter ?? {}
      const enemies = Array.isArray(e.enemies) && e.enemies.length > 0 ? e.enemies : []
      const first = enemies[0]
      room.activeEncounter = {
        id: e.id ?? randomUUID(),
        room_id: room.id,
        title: e.title ?? '',
        subtitle: e.subtitle ?? '',
        description: e.description ?? '',
        mood: e.mood ?? '',
        image_url: e.image_url ?? null,
        enemies,
        objectives: e.objectives ?? '',
        gm_notes: e.gm_notes ?? '',
        round: typeof e.round === 'number' ? e.round : 1,
        enemy_hp: first?.hp ?? e.enemy_hp ?? null,
        enemy_hp_max: first?.hp_max ?? e.enemy_hp_max ?? null,
        is_active: true,
      }
      broadcast(room, { type: 'ENCOUNTER_UPDATE', encounter: room.activeEncounter })
    }

    if (msg.type === 'UPDATE_ENCOUNTER' && actorIsGm(player, msg) && room.activeEncounter) {
      const e = msg.encounter ?? {}
      room.activeEncounter = {
        ...room.activeEncounter,
        ...e,
        room_id: room.id,
        is_active: true,
        enemies: Array.isArray(e.enemies) ? e.enemies : room.activeEncounter.enemies,
      }
      const first = room.activeEncounter.enemies?.[0]
      if (first) {
        room.activeEncounter.enemy_hp = first.hp
        room.activeEncounter.enemy_hp_max = first.hp_max
      }
      broadcast(room, { type: 'ENCOUNTER_UPDATE', encounter: room.activeEncounter })
    }

    if (msg.type === 'HIDE_ENCOUNTER' && actorIsGm(player, msg)) {
      room.activeEncounter = null
      broadcast(room, { type: 'ENCOUNTER_UPDATE', encounter: null })
    }

    if (msg.type === 'SET_THEME' && actorIsGm(player, msg)) {
      const theme = sanitizeTheme(msg.theme ?? {})
      const target = msg.target_player_id ?? null
      if (target && target !== 'all') {
        room.playerThemes[target] = theme
      } else {
        room.theme = theme
        if (msg.clear_player_overrides) room.playerThemes = {}
      }
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_ALLOW_PLAYER_THEME_EDITING' && actorIsGm(player, msg)) {
      room.allowPlayerThemeEditing = Boolean(msg.enabled)
      if (!room.allowPlayerThemeEditing) {
        room.theme = { ...DEFAULT_THEME }
        room.playerThemes = {}
      }
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_LEVEL_PRESET' && actorIsGm(player, msg)) {
      const requestedLevelId = typeof msg.level_id === 'string' && msg.level_id.trim() ? msg.level_id.trim() : null
      const nextLevelId = requestedLevelId && hasLevelPreset(requestedLevelId) ? requestedLevelId : null
      const variant = msg.variant === 'alt' ? 'alt' : 'main'
      room.levelId = nextLevelId
      room.levelVariant = variant
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_LEVEL_VISIBILITY' && actorIsGm(player, msg)) {
      room.showLevelToPlayers = Boolean(msg.show_to_players)
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'CLEAR_PLAYER_THEME' && actorIsGm(player, msg)) {
      const target = msg.target_player_id
      if (target) delete room.playerThemes[target]
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_PLAYER_THEME') {
      if (room.allowPlayerThemeEditing === false) {
        send(ws, { type: 'ERROR', message: 'ГМ запретил менять личные цвета' })
        return
      }
      room.playerThemes[player.id] = sanitizeTheme(msg.theme ?? {})
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'CLEAR_MY_THEME') {
      if (room.allowPlayerThemeEditing === false) {
        send(ws, { type: 'ERROR', message: 'ГМ запретил менять личные цвета' })
        return
      }
      delete room.playerThemes[player.id]
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_MUSIC' && actorIsGm(player, msg)) {
      const url =
        msg.url !== undefined && msg.url !== null
          ? String(msg.url).trim().slice(0, 500)
          : room.music?.url
      const source = url ? detectMusicSource(url) : null
      const videoId = url ? parseYoutubeVideoId(url) : null
      const playing = Boolean(msg.playing && source)

      ;(async () => {
        if (!url || !playing) {
          stopRoomMusic(room.id)
          room.music = {
            url: null,
            video_id: null,
            playing: false,
            title: null,
            volume: 70,
            source: null,
            stream_token: null,
            use_host_proxy: true,
            proxy_error: null,
          }
          broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
          return
        }

        let title = room.music?.title ?? null
        if (!title || url !== room.music?.url) {
          if (source === 'youtube' && videoId) {
            title =
              (await fetchYoutubeTitle(videoId)) ??
              'Трек'
          } else if (source === 'direct') {
            title = (await fetchMusicTitle(url)) ?? 'Аудиофайл'
          } else {
            title = 'Музыка'
          }
        }

        // YouTube plays directly in clients via embed mode.
        // This avoids host-side stream extraction failures on restricted hosts.
        if (source === 'youtube' && videoId) {
          stopRoomMusic(room.id)
          room.music = {
            url,
            video_id: videoId,
            playing: true,
            title: title ?? 'Трек',
            volume: clampMusicVolume(msg.volume, room.music?.volume ?? 70),
            source,
            stream_token: null,
            use_host_proxy: false,
            proxy_error: null,
          }
          broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
          return
        }

        const prep = prepareRoomMusicStream(room, url)
        if (!prep.ok) {
          stopRoomMusic(room.id)
          room.music = {
            url,
            video_id: videoId,
            playing: false,
            title: title ?? 'Музыка',
            volume: clampMusicVolume(msg.volume, room.music?.volume ?? 70),
            source,
            stream_token: null,
            use_host_proxy: true,
            proxy_error: prep.error ?? 'Ошибка',
          }
          broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
          return
        }

        room.music = {
          url,
          video_id: videoId,
          playing: true,
          title: title ?? 'Музыка',
          volume: clampMusicVolume(msg.volume, room.music?.volume ?? 70),
          source: prep.source,
          stream_token: prep.streamToken,
          use_host_proxy: true,
          proxy_error: null,
        }
        broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
      })()
    }

    if (msg.type === 'START_POLL' && actorIsGm(player, msg)) {
      const poll = startPoll(room, msg.question, msg.options ?? [], msg.duration_sec)
      if (!poll) {
        send(ws, { type: 'ERROR', message: 'Нужен вопрос и минимум 2 варианта' })
        return
      }
      schedulePollAutoClose(room)
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'CAST_VOTE' && room.activePoll?.open) {
      const optionId = msg.option_id
      if (!room.activePoll.options.some((o) => o.id === optionId)) return
      room.activePoll.votes[playerId] = optionId
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'END_POLL' && actorIsGm(player, msg) && room.activePoll) {
      room.activePoll.open = false
      clearPollAutoClose(room.id)
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'CLEAR_POLL' && actorIsGm(player, msg)) {
      room.activePoll = null
      clearPollAutoClose(room.id)
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SHOW_SCREEN_MESSAGE' && actorIsGm(player, msg)) {
      const text = String(msg.text ?? '').trim().slice(0, 800)
      if (!text) return
      room.screenMessage = {
        id: randomUUID(),
        title: String(msg.title ?? '').trim().slice(0, 120),
        text,
        target_player_id: msg.target_player_id || null,
        created_at: new Date().toISOString(),
      }
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'DISMISS_SCREEN_MESSAGE' && actorIsGm(player, msg)) {
      room.screenMessage = null
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_HALL_OF_FAME' && actorIsGm(player, msg)) {
      const providedPassword = normalizeLeaderboardPassword(msg.leaderboard_password ?? msg.password)
      if (providedPassword !== normalizeLeaderboardPassword(LEADERBOARD_EDIT_PASSWORD)) {
        send(ws, { type: 'ERROR', message: 'Неверный пароль редактирования лидерборда' })
        return
      }
      globalHallOfFame = sanitizeHallOfFame(msg.hall_of_fame ?? msg)
      const persisted = saveGlobalHallOfFame(globalHallOfFame)
      for (const targetRoom of rooms.values()) {
        targetRoom.hallOfFame = cloneHallOfFame(globalHallOfFame)
        broadcast(targetRoom, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(targetRoom) })
      }
      if (!persisted) {
        send(ws, { type: 'ERROR', message: 'Лидерборд обновлён, но не удалось сохранить его на диск сервера' })
      }
    }

    if (msg.type === 'SET_STAGE_FX' && actorIsGm(player, msg)) {
      const prev = room.stageFx ?? createRoomExtras().stageFx
      const raw = Number(msg.darkness)
      const darkness = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : prev.darkness
      const allowed = Array.isArray(msg.flashlights_enabled_for)
        ? msg.flashlights_enabled_for
            .map((id) => String(id))
            .filter((id) => room.players.has(id) && !room.players.get(id)?.is_gm)
        : (prev.flashlightsEnabledFor ?? [])
      const equalizerEnabled =
        typeof msg.equalizer_enabled === 'boolean' ? msg.equalizer_enabled : prev.equalizerEnabled !== false
      const beatFlickerEnabled =
        typeof msg.beat_flicker_enabled === 'boolean' ? msg.beat_flicker_enabled : Boolean(prev.beatFlickerEnabled)
      const beatBpmRaw = Number(msg.beat_bpm)
      const beatIntensityRaw = Number(msg.beat_intensity)
      const beatBpm = Number.isFinite(beatBpmRaw) ? Math.max(50, Math.min(220, Math.round(beatBpmRaw))) : (prev.beatBpm ?? 120)
      const beatIntensity = Number.isFinite(beatIntensityRaw)
        ? Math.max(0, Math.min(100, Math.round(beatIntensityRaw)))
        : (prev.beatIntensity ?? 40)
      room.stageFx = { darkness, flashlightsEnabledFor: allowed, equalizerEnabled, beatFlickerEnabled, beatBpm, beatIntensity }
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }
  })

  ws.on('close', () => {
    room.clients.delete(ws)
    clearPlayerPresence(room, playerId)
    const removed = !hasActiveConnectionForPlayer(room, playerId) && removePlayerFromRoom(room, playerId)
    if (removed) {
      broadcastState(room)
    } else {
      broadcastPresence(room, broadcast)
    }
    if (room.clients.size === 0) {
      stopRoomMusic(room.id)
      clearPollAutoClose(room.id)
      rooms.delete(room.id)
    }
  })
})

httpServer.listen(SERVER_PORT, HOST, () => {
  const addrs = getLanAddresses()
  console.log(`\n  ВнГ сервер запущен`)
  console.log(`  Локально:  http://127.0.0.1:${SERVER_PORT}`)
  if (addrs.length) {
    console.log(`  LAN / VPN:`)
    for (const ip of addrs) console.log(`    http://${ip}:${SERVER_PORT}`)
  }
  console.log('')
})
