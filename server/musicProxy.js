import { randomUUID } from 'node:crypto'
import { parseYoutubeVideoId } from './roomExtras.js'

const hubs = new Map()

const DIRECT_AUDIO = /\.(mp3|ogg|opus|wav|m4a|aac|flac|webm)(\?|$)/i

export function detectMusicSource(url) {
  if (!url) return null
  if (DIRECT_AUDIO.test(url) || url.includes('/audio/')) return 'direct'
  if (parseYoutubeVideoId(url)) return 'youtube'
  return null
}

function normalizeYoutubePlaylistUrl(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'music.youtube.com' || host === 'm.youtube.com') {
      u.hostname = 'www.youtube.com'
    }
    const list = String(u.searchParams.get('list') ?? '').trim()
    if (list) {
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`
    }
  } catch {
    /* ignore */
  }
  return raw
}

function parseYoutubePlaylistId(url) {
  const normalized = normalizeYoutubePlaylistUrl(url)
  if (!normalized) return null
  try {
    const u = new URL(normalized)
    const list = String(u.searchParams.get('list') ?? '').trim()
    return list || null
  } catch {
    const m = normalized.match(/[?&]list=([a-zA-Z0-9_-]+)/)
    return m?.[1] ?? null
  }
}

class RoomMusicHub {
  constructor(roomId) {
    this.roomId = roomId
    this.clients = new Set()
    this.fetchAbort = null
    this.sourceUrl = null
    this.started = false
    this.contentType = 'audio/mpeg'
  }

  attach(res) {
    this.clients.add(res)
    res.on('close', () => {
      this.clients.delete(res)
      if (this.clients.size === 0) this.stop()
    })
    if (!this.started && this.sourceUrl) void this._startPipeline()
  }

  start(url, source) {
    this.sourceUrl = url
    this.source = source
    if (this.clients.size > 0) void this._startPipeline()
  }

  _writeHeaders(res) {
    if (res.headersSent) return
    res.writeHead(200, {
      'Content-Type': this.contentType || 'audio/mp4',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked',
    })
  }

  _broadcast(chunk) {
    for (const res of this.clients) {
      if (res.writableEnded) continue
      this._writeHeaders(res)
      res.write(chunk)
    }
  }

  async _startPipeline() {
    if (this.started || !this.sourceUrl) return
    this.started = true

    if (this.source !== 'direct') {
      this._failAll('Прокси сервера поддерживает только прямые аудиофайлы')
      return
    }
    this._streamDirect(this.sourceUrl)
  }

  async _streamDirect(url) {
    this.contentType = 'audio/mpeg'
    const ac = new AbortController()
    this.fetchAbort = ac
    try {
      const response = await fetch(url, {
        signal: ac.signal,
        headers: { 'User-Agent': 'VnG/1.0' },
      })
      if (!response.ok) {
        this._failAll(`Ошибка загрузки: HTTP ${response.status}`)
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        this._failAll('Пустой ответ')
        return
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) this._broadcast(Buffer.from(value))
      }
      for (const res of this.clients) {
        if (!res.writableEnded) res.end()
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._failAll(err.message ?? 'Ошибка прокси')
      }
    }
  }

  _failAll(message) {
    for (const res of this.clients) {
      if (!res.writableEnded) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(message)
      }
    }
    this.stop()
  }

  stop() {
    if (this.fetchAbort) {
      this.fetchAbort.abort()
      this.fetchAbort = null
    }
    this.started = false
    this.sourceUrl = null
    this.contentType = 'audio/mpeg'
  }
}

function getHub(roomId) {
  if (!hubs.has(roomId)) hubs.set(roomId, new RoomMusicHub(roomId))
  return hubs.get(roomId)
}

export function stopRoomMusic(roomId) {
  const hub = hubs.get(roomId)
  if (hub) {
    hub.stop()
    hubs.delete(roomId)
  }
}

export function prepareRoomMusicStream(room, url) {
  const source = detectMusicSource(url)
  if (!source) return { ok: false, error: 'Неподдерживаемая ссылка' }
  if (source !== 'direct') return { ok: false, error: 'YouTube не проксируется сервером (воспроизводится напрямую)' }

  stopRoomMusic(room.id)
  const streamToken = randomUUID()
  const hub = getHub(room.id)
  hub.start(url, source)

  return { ok: true, source, streamToken }
}

export function handleMusicStreamRequest(room, req, res) {
  const url = new URL(req.url ?? '/', 'http://x')
  const token = url.searchParams.get('token')
  const music = room.music

  if (!music?.playing || !music.stream_token || token !== music.stream_token) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  if (!music.url) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('No music')
    return
  }

  const hub = getHub(room.id)
  if (!hub.sourceUrl) hub.start(music.url, music.source ?? detectMusicSource(music.url))
  hub.attach(res)
}

export async function fetchMusicTitle(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    const pathTail = u.pathname.split('/').filter(Boolean).pop() ?? 'Аудио'
    return decodeURIComponent(pathTail).slice(0, 200)
  } catch {
    return 'Музыка'
  }
}

export async function fetchPlaylistEntries(url) {
  const playlistId = parseYoutubePlaylistId(url)
  if (!playlistId) return { error: 'Нужна корректная ссылка на YouTube playlist', entries: [] }
  try {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`
    const res = await fetch(feedUrl, { headers: { 'User-Agent': 'VnG/1.0' } })
    if (!res.ok) return { error: `Не удалось загрузить плейлист (HTTP ${res.status})`, entries: [] }
    const xml = await res.text()
    const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
    const entries = entryBlocks
      .slice(0, 100)
      .map((block, idx) => {
        const idMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)
        const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/)
        const thumbMatch = block.match(/<media:thumbnail[^>]+url="([^"]+)"/)
        const videoId = String(idMatch?.[1] ?? '').trim()
        if (!videoId) return null
        const titleRaw = String(titleMatch?.[1] ?? `Трек ${idx + 1}`)
        const title = titleRaw
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim()
          .slice(0, 200)
        return {
          id: videoId,
          title: title || `Трек ${idx + 1}`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail_url: String(thumbMatch?.[1] ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`).trim(),
        }
      })
      .filter(Boolean)
    if (!entries.length) return { error: 'Плейлист пустой или закрыт', entries: [] }
    return { error: null, entries }
  } catch {
    return { error: 'Не удалось прочитать YouTube плейлист', entries: [] }
  }
}

