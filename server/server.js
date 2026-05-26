import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { randomUUID } from 'node:crypto'
import { parseAndRoll, buildRollExpression, formatRollChatMessage } from './dice.js'
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
  fetchTitleViaYtDlp,
  handleMusicStreamRequest,
  prepareRoomMusicStream,
  stopRoomMusic,
  getYtDlpStatus,
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

const HOST = process.env.HOST || '0.0.0.0'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')

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
  'Бэкграунд',
  'Особое',
  'Заметки ГМ',
  'Правило листика',
  'Очки на характеристики',
  'Хранилище приемов',
]

function ensureSpecialTextFields(textFields) {
  const existing = Array.isArray(textFields) ? textFields : []
  const byName = new Map(existing.map((f) => [String(f?.name ?? '').trim().toLowerCase(), f]))
  return SPECIAL_FIELD_NAMES.map((name) => {
    const key = name.trim().toLowerCase()
    const found = byName.get(key)
    return found
      ? { ...found, name }
      : { id: randomUUID(), name, value: '' }
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

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload))
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
    text_fields: ensureSpecialTextFields([]),
    stats: [
      { id: randomUUID(), name: 'СИЛА', value: '0' },
      { id: randomUUID(), name: 'ЛОВКОСТЬ', value: '0' },
      { id: randomUUID(), name: 'ХАРИЗМА', value: '0' },
      { id: randomUUID(), name: 'ИНТЕЛЛЕКТ', value: '0' },
      { id: randomUUID(), name: 'УДАЧА', value: '0' },
    ],
    counters: [{ id: randomUUID(), name: 'ХП', current: 10, max: 10 }],
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
    if (req.method === 'GET' && url.pathname === '/api/server/info') {
      json(200, { port: SERVER_PORT, addresses: getLanAddresses(), music: getYtDlpStatus() })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/rooms/ping') {
      json(200, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/rooms') {
      const list = [...rooms.values()]
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
      const { name, playerId, playerName } = body
      const id = randomUUID()
      const room = {
        id,
        name: name.trim(),
        createdAt: Date.now(),
        hostId: playerId,
        gmId: playerId,
        players: new Map([[playerId, { id: playerId, room_id: id, name: playerName.trim(), is_gm: true }]]),
        characters: new Map(),
        rollEvents: [],
        chatMessages: [],
        activeEncounter: null,
        clients: new Set(),
        ...createRoomExtras(),
      }
      initRoomPresence(room)
      rooms.set(id, room)
      json(201, { room: { id, name: room.name, gm_id: playerId }, player: { is_gm: true } })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/rooms/join') {
      const room = rooms.get(body.roomId)
      if (!room) return json(404, { error: 'Комната не найдена' })
      if (!room.players.has(body.playerId)) {
        room.players.set(body.playerId, {
          id: body.playerId,
          room_id: room.id,
          name: body.playerName.trim(),
          is_gm: false,
        })
        room.characters.set(body.playerId, createEmptyCharacter(room.id, body.playerId, body.playerName.trim()))
      } else {
        const p = room.players.get(body.playerId)
        p.name = body.playerName.trim()
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
      if (targetId !== playerId && !player.is_gm) {
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
        player.is_gm || targetId !== playerId
          ? base.counters
          : applyPlayerCounterPolicy(existing, base)
      const updated = {
        ...base,
        text_fields: ensureSpecialTextFields(base.text_fields),
        counters,
        is_npc: existing?.is_npc ?? base.is_npc ?? isNpcCharacter({ player_id: targetId }),
        npc_visibility:
          player.is_gm &&
          typeof char.npc_visibility === 'string' &&
          (char.npc_visibility === 'full' || char.npc_visibility === 'restricted')
            ? char.npc_visibility
            : (existing?.npc_visibility ?? base.npc_visibility ?? null),
        in_party:
          player.is_gm && typeof char.in_party === 'boolean'
            ? char.in_party
            : (existing?.in_party ?? base.in_party ?? false),
        updated_at: new Date().toISOString(),
      }
      // Для совместимости: если ГМ управляет npc_visibility — синхронизируем in_party
      if (player.is_gm && (updated.npc_visibility === 'full' || updated.npc_visibility === 'restricted')) {
        updated.in_party = updated.npc_visibility === 'full'
      }
      room.characters.set(targetId, updated)
      broadcast(room, { type: 'CHARACTER_UPDATED', character: updated })
    }

    if (msg.type === 'CREATE_NPC_CHARACTER' && player.is_gm) {
      const label = String(msg.name ?? msg.player_name ?? 'Персонаж').trim().slice(0, 48) || 'Персонаж'
      const npcId = `npc-${randomUUID()}`
      const npc = createEmptyCharacter(room.id, npcId, label, { isNpc: true, name: label })
      room.characters.set(npcId, npc)
      broadcast(room, { type: 'CHARACTER_UPDATED', character: npc })
    }

    if (msg.type === 'DELETE_NPC_CHARACTER' && player.is_gm) {
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

    if (msg.type === 'SET_DICE_PERMISSION' && player.is_gm) {
      const targetId = msg.player_id
      if (!targetId || targetId === playerId) return
      const target = room.players.get(targetId)
      if (!target || target.is_gm) return
      initRoomPresence(room)
      if (msg.allowed) room.diceAllowed.add(targetId)
      else room.diceAllowed.delete(targetId)
      broadcastPresence(room, broadcast)
    }

    if (msg.type === 'DICE_ROLL') {
      initRoomPresence(room)
      const now = Date.now()
      if (!player.is_gm) {
        if (!room.diceAllowed.has(playerId)) {
          send(ws, { type: 'ERROR', message: 'ГМ не разрешил вам бросать кубы' })
          return
        }
      }
      const lastAt = room.lastDiceRollAt.get(playerId) ?? 0
      if (now - lastAt < DICE_ROLL_COOLDOWN_MS) {
        const wait = Math.ceil((DICE_ROLL_COOLDOWN_MS - (now - lastAt)) / 1000)
        send(ws, { type: 'ERROR', message: `Подождите ${wait} сек. перед следующим броском` })
        return
      }

      const expr = msg.expression ?? buildRollExpression(msg.count ?? 1, msg.sides ?? 20, msg.modifier ?? 0)
      try {
        const r = parseAndRoll(expr)
        const event = {
          id: randomUUID(),
          room_id: room.id,
          player_id: playerId,
          player_name: player.name,
          expression: r.expression,
          total: r.total,
          details: `[${r.rolls.join(', ')}] = ${r.total}`,
          rolls: r.rolls,
          modifier: r.modifier,
          sides: msg.sides ?? null,
          player_is_gm: Boolean(player.is_gm),
          message: formatRollChatMessage(player.name, r.expression, r.rolls, r.modifier, r.total, player.is_gm),
          created_at: new Date().toISOString(),
        }
        room.rollEvents.push(event)
        room.lastDiceRollAt.set(playerId, now)
        trimRolls(room)
        // Разовое разрешение: после удачного броска снимаем флаг для игрока
        if (!player.is_gm) {
          room.diceAllowed.delete(playerId)
          broadcastPresence(room, broadcast)
        }
        broadcast(room, { type: 'DICE_ROLL', event })
      } catch (e) {
        send(ws, { type: 'ERROR', message: e.message })
      }
    }

    if (msg.type === 'DICE_REROLL_INSPIRED') {
      const char = room.characters.get(playerId)
      const idx = findInspirationCounter(char)
      if (!char || idx < 0) {
        send(ws, { type: 'ERROR', message: 'Нужно минимум 1 очко вдохновения для переброса' })
        return
      }
      const points = Number(char.counters[idx]?.current ?? 0)
      if (points <= 0) {
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
        const r = parseAndRoll(expr)

        const updatedChar = {
          ...char,
          counters: char.counters.map((c, i) =>
            i === idx ? { ...c, current: Math.max(0, Number(c.current ?? 0) - 1) } : c
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
          total: r.total,
          details: `[${r.rolls.join(', ')}] = ${r.total}`,
          rolls: r.rolls,
          modifier: r.modifier,
          sides: msg.sides ?? null,
          player_is_gm: Boolean(player.is_gm),
          message: `${formatRollChatMessage(player.name, r.expression, r.rolls, r.modifier, r.total, player.is_gm)} (переброс за вдохновение)`,
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

    if (msg.type === 'CHANGE_GM' && player.is_gm) {
      const next = room.players.get(msg.new_gm_id)
      if (!next || msg.new_gm_id === playerId) return
      for (const p of room.players.values()) p.is_gm = p.id === msg.new_gm_id
      room.gmId = msg.new_gm_id
      if (!room.characters.has(playerId)) {
        room.characters.set(playerId, createEmptyCharacter(room.id, playerId, player.name))
      }
      broadcast(room, { type: 'CHANGE_GM', gm_id: msg.new_gm_id, state: getPublicState(room) })
    }

    if (msg.type === 'SHOW_ENCOUNTER' && player.is_gm) {
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

    if (msg.type === 'UPDATE_ENCOUNTER' && player.is_gm && room.activeEncounter) {
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

    if (msg.type === 'HIDE_ENCOUNTER' && player.is_gm) {
      room.activeEncounter = null
      broadcast(room, { type: 'ENCOUNTER_UPDATE', encounter: null })
    }

    if (msg.type === 'SET_THEME' && player.is_gm) {
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

    if (msg.type === 'SET_ALLOW_PLAYER_THEME_EDITING' && player.is_gm) {
      room.allowPlayerThemeEditing = Boolean(msg.enabled)
      if (!room.allowPlayerThemeEditing) {
        room.theme = { ...DEFAULT_THEME }
        room.playerThemes = {}
      }
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'CLEAR_PLAYER_THEME' && player.is_gm) {
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

    if (msg.type === 'SET_MUSIC' && player.is_gm) {
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
              (await fetchTitleViaYtDlp(url)) ??
              'Трек'
          } else if (source === 'direct') {
            title = 'Аудиофайл'
          } else {
            title = (await fetchTitleViaYtDlp(url)) ?? 'Музыка'
          }
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

    if (msg.type === 'START_POLL' && player.is_gm) {
      const poll = startPoll(room, msg.question, msg.options ?? [])
      if (!poll) {
        send(ws, { type: 'ERROR', message: 'Нужен вопрос и минимум 2 варианта' })
        return
      }
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'CAST_VOTE' && room.activePoll?.open) {
      const optionId = msg.option_id
      if (!room.activePoll.options.some((o) => o.id === optionId)) return
      room.activePoll.votes[playerId] = optionId
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'END_POLL' && player.is_gm && room.activePoll) {
      room.activePoll.open = false
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'CLEAR_POLL' && player.is_gm) {
      room.activePoll = null
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SHOW_SCREEN_MESSAGE' && player.is_gm) {
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

    if (msg.type === 'DISMISS_SCREEN_MESSAGE' && player.is_gm) {
      room.screenMessage = null
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_HALL_OF_FAME' && player.is_gm) {
      room.hallOfFame = sanitizeHallOfFame(msg.hall_of_fame ?? msg)
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }

    if (msg.type === 'SET_STAGE_FX' && player.is_gm) {
      const raw = Number(msg.darkness)
      const darkness = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 100
      const allowed = Array.isArray(msg.flashlights_enabled_for)
        ? msg.flashlights_enabled_for
            .map((id) => String(id))
            .filter((id) => room.players.has(id) && !room.players.get(id)?.is_gm)
        : (room.stageFx?.flashlightsEnabledFor ?? [])
      room.stageFx = { darkness, flashlightsEnabledFor: allowed }
      broadcast(room, { type: 'ROOM_EXTRAS_UPDATE', extras: serializeRoomExtras(room) })
    }
  })

  ws.on('close', () => {
    room.clients.delete(ws)
    clearPlayerPresence(room, playerId)
    broadcastPresence(room, broadcast)
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
