import { createHash, randomUUID } from 'node:crypto'
import { parseYoutubeVideoId } from './roomExtras.js'

const hubs = new Map()

const DIRECT_AUDIO = /\.(mp3|ogg|opus|wav|m4a|aac|flac|webm)(\?|$)/i
const YOUTUBE_COOKIE = String(process.env.YOUTUBE_COOKIE ?? '').trim()
const YOUTUBE_API_KEY = String(process.env.YOUTUBE_API_KEY ?? '').trim()

function getCookieValue(cookieHeader, key) {
  if (!cookieHeader || !key) return ''
  const parts = String(cookieHeader).split(';')
  const target = String(key).trim()
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const name = part.slice(0, idx).trim()
    if (name !== target) continue
    return part.slice(idx + 1).trim()
  }
  return ''
}

function buildYoutubeAuthHeaders(origin) {
  if (!YOUTUBE_COOKIE) return {}
  const sapisid =
    getCookieValue(YOUTUBE_COOKIE, 'SAPISID') ||
    getCookieValue(YOUTUBE_COOKIE, '__Secure-3PAPISID') ||
    getCookieValue(YOUTUBE_COOKIE, '__Secure-1PAPISID')
  if (!sapisid) return {}
  const now = Math.floor(Date.now() / 1000)
  const hash = createHash('sha1').update(`${now} ${sapisid} ${origin}`).digest('hex')
  return {
    Authorization: `SAPISIDHASH ${now}_${hash}`,
    'X-Origin': origin,
    'X-Goog-AuthUser': '0',
  }
}

function buildYoutubeRequestHeaders(baseHeaders = {}, origin = 'https://www.youtube.com') {
  return {
    'User-Agent': 'Mozilla/5.0 (VnG playlist loader)',
    ...(YOUTUBE_COOKIE ? { Cookie: YOUTUBE_COOKIE } : {}),
    ...buildYoutubeAuthHeaders(origin),
    ...baseHeaders,
  }
}

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

function htmlEntityDecode(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function textFromRuns(input) {
  if (!input || typeof input !== 'object') return ''
  if (typeof input.simpleText === 'string') return input.simpleText
  if (Array.isArray(input.runs)) return input.runs.map((r) => String(r?.text ?? '')).join('')
  return ''
}

function extractJsonObjectFrom(source, marker) {
  const idx = source.indexOf(marker)
  if (idx < 0) return null
  const braceStart = source.indexOf('{', idx + marker.length)
  if (braceStart < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth === 0) {
      try {
        return JSON.parse(source.slice(braceStart, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function collectPlaylistVideos(node, map) {
  if (!node) return
  if (Array.isArray(node)) {
    for (const item of node) collectPlaylistVideos(item, map)
    return
  }
  if (typeof node !== 'object') return

  const renderer = node.playlistVideoRenderer
  if (renderer?.videoId) {
    const videoId = String(renderer.videoId).trim()
    if (!videoId) return
    const title = htmlEntityDecode(textFromRuns(renderer.title)).trim() || `Трек ${map.size + 1}`
    const thumbs = renderer.thumbnail?.thumbnails
    const thumb = Array.isArray(thumbs) && thumbs.length ? String(thumbs[thumbs.length - 1]?.url ?? '').trim() : ''
    if (!map.has(videoId)) {
      map.set(videoId, {
        id: videoId,
        title: title.slice(0, 200),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      })
    }
  }

  for (const value of Object.values(node)) {
    collectPlaylistVideos(value, map)
  }
}

function collectContinuationTokens(node, out) {
  if (!node) return
  if (Array.isArray(node)) {
    for (const item of node) collectContinuationTokens(item, out)
    return
  }
  if (typeof node !== 'object') return
  const token =
    node?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ??
    node?.nextContinuationData?.continuation
  if (typeof token === 'string' && token.trim()) out.push(token.trim())
  for (const value of Object.values(node)) {
    collectContinuationTokens(value, out)
  }
}

function findContinuationToken(node, excludeToken = '') {
  const tokens = []
  collectContinuationTokens(node, tokens)
  const exclude = String(excludeToken ?? '').trim()
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    if (!token) continue
    if (exclude && token === exclude) continue
    return token
  }
  return null
}

function encodePlaylistCursor(value) {
  try {
    return Buffer.from(String(value ?? ''), 'utf8').toString('base64url')
  } catch {
    return ''
  }
}

function decodePlaylistCursor(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    return Buffer.from(raw, 'base64url').toString('utf8').trim()
  } catch {
    return ''
  }
}

async function fetchPlaylistViaNoKeyApi(playlistId) {
  const MAX_TRACKS = 20000
  const MAX_PAGES = 500
  let pageToken = ''
  let pages = 0
  const out = []
  while (pages < MAX_PAGES && out.length < MAX_TRACKS) {
    pages += 1
    const params = new URLSearchParams({
      part: 'snippet',
      playlistId,
      maxResults: '50',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`https://yt.lemnoslife.com/noKey/playlistItems?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (VnG playlist loader)' },
    })
    if (!res.ok) return { error: `noKey API HTTP ${res.status}`, entries: [] }
    const data = await res.json().catch(() => null)
    const items = Array.isArray(data?.items) ? data.items : []
    for (const item of items) {
      const snippet = item?.snippet ?? {}
      const videoId = String(
        snippet?.resourceId?.videoId ?? snippet?.videoId ?? item?.contentDetails?.videoId ?? ''
      ).trim()
      if (!videoId) continue
      const thumbs = snippet?.thumbnails ?? {}
      const thumb =
        String(
          thumbs?.maxres?.url ??
            thumbs?.standard?.url ??
            thumbs?.high?.url ??
            thumbs?.medium?.url ??
            thumbs?.default?.url ??
            ''
        ).trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      const title = String(snippet?.title ?? '').trim().slice(0, 200) || `Трек ${out.length + 1}`
      out.push({
        id: videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: thumb,
      })
      if (out.length >= MAX_TRACKS) break
    }
    const next = String(data?.nextPageToken ?? '').trim()
    if (!next) break
    if (next === pageToken) break
    pageToken = next
  }
  const dedup = []
  const seen = new Set()
  for (const entry of out) {
    const key = `${entry.id}|${entry.url}`
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(entry)
  }
  if (!dedup.length) return { error: 'noKey API вернул пустой список', entries: [] }
  return { error: null, entries: dedup }
}

async function fetchPlaylistViaYoutubeDataApi(playlistId) {
  if (!YOUTUBE_API_KEY) return { error: 'YOUTUBE_API_KEY не задан', entries: [] }
  const MAX_TRACKS = 50000
  const MAX_PAGES = 1000
  let pageToken = ''
  let pages = 0
  const out = []
  while (pages < MAX_PAGES && out.length < MAX_TRACKS) {
    pages += 1
    const params = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      playlistId,
      maxResults: '50',
      key: YOUTUBE_API_KEY,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (VnG playlist loader)' },
    })
    if (!res.ok) return { error: `YouTube Data API HTTP ${res.status}`, entries: [] }
    const data = await res.json().catch(() => null)
    const items = Array.isArray(data?.items) ? data.items : []
    for (const item of items) {
      const snippet = item?.snippet ?? {}
      if (String(snippet?.title ?? '').toLowerCase() === 'deleted video') continue
      if (String(snippet?.title ?? '').toLowerCase() === 'private video') continue
      const videoId = String(
        snippet?.resourceId?.videoId ?? item?.contentDetails?.videoId ?? ''
      ).trim()
      if (!videoId) continue
      const thumbs = snippet?.thumbnails ?? {}
      const thumb =
        String(
          thumbs?.maxres?.url ??
            thumbs?.standard?.url ??
            thumbs?.high?.url ??
            thumbs?.medium?.url ??
            thumbs?.default?.url ??
            ''
        ).trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      const title = String(snippet?.title ?? '').trim().slice(0, 200) || `Трек ${out.length + 1}`
      out.push({
        id: videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: thumb,
      })
      if (out.length >= MAX_TRACKS) break
    }
    const next = String(data?.nextPageToken ?? '').trim()
    if (!next) break
    if (next === pageToken) break
    pageToken = next
  }
  const dedup = []
  const seen = new Set()
  for (const entry of out) {
    const key = `${entry.id}|${entry.url}`
    if (seen.has(key)) continue
    seen.add(key)
    dedup.push(entry)
  }
  if (!dedup.length) return { error: 'YouTube Data API вернул пустой список', entries: [] }
  return { error: null, entries: dedup }
}

async function fetchYoutubePlaylistBootstrap(playlistId) {
  const urls = [
    `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=ru`,
    `https://music.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=ru`,
  ]
  let html = ''
  let lastStatus = 0
  for (const pageUrl of urls) {
    const pageRes = await fetch(pageUrl, {
      headers: buildYoutubeRequestHeaders({}, new URL(pageUrl).origin),
    })
    if (!pageRes.ok) {
      lastStatus = pageRes.status
      continue
    }
    html = await pageRes.text()
    if (html) break
  }
  if (!html) {
    const fallbackRes = await fetch('https://www.youtube.com/?hl=ru', {
      headers: buildYoutubeRequestHeaders(),
    })
    if (fallbackRes.ok) {
      html = await fallbackRes.text()
    }
  }
  if (!html) {
    return {
      error: `Не удалось открыть страницу плейлиста (HTTP ${lastStatus || 404})`,
      initialData: null,
      apiKey: '',
      context: null,
    }
  }
  const initialData =
    extractJsonObjectFrom(html, 'var ytInitialData = ') ??
    extractJsonObjectFrom(html, 'window["ytInitialData"] = ')
  const ytcfg = extractJsonObjectFrom(html, 'ytcfg.set(')
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)
  const apiKey = String(apiKeyMatch?.[1] ?? ytcfg?.INNERTUBE_API_KEY ?? '').trim()
  const context =
    ytcfg?.INNERTUBE_CONTEXT ??
    {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240601.00.00',
        hl: 'ru',
        gl: 'US',
      },
    }
  const clientName =
    Number(ytcfg?.INNERTUBE_CLIENT_NAME ?? ytcfg?.INNERTUBE_CONTEXT_CLIENT_NAME ?? context?.client?.clientName ?? 1) || 1
  const clientVersion = String(
    ytcfg?.INNERTUBE_CLIENT_VERSION ?? ytcfg?.INNERTUBE_CONTEXT_CLIENT_VERSION ?? context?.client?.clientVersion ?? '2.20240601.00.00'
  ).trim()
  const visitorData = String(ytcfg?.VISITOR_DATA ?? context?.client?.visitorData ?? '').trim()
  return { error: null, initialData, apiKey, context, clientName, clientVersion, visitorData }
}

async function fetchYoutubePlaylistContinuationPage(apiKey, context, continuationToken, headersMeta = {}) {
  const contextClientName = String(context?.client?.clientName ?? 'WEB').trim().toUpperCase()
  const clientNameMap = {
    WEB: 1,
    WEB_REMIX: 67,
  }
  const clientName = Number(headersMeta.clientName ?? clientNameMap[contextClientName] ?? 1) || 1
  const clientVersion = String(headersMeta.clientVersion ?? context?.client?.clientVersion ?? '2.20240601.00.00').trim()
  const visitorData = String(headersMeta.visitorData ?? context?.client?.visitorData ?? '').trim()
  const endpointHost = String(headersMeta.endpointHost ?? 'www.youtube.com').trim() || 'www.youtube.com'
  const origin = `https://${endpointHost}`
  const contRes = await fetch(`https://${endpointHost}/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: buildYoutubeRequestHeaders({
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': String(clientName),
      'X-YouTube-Client-Version': clientVersion,
      ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
      Referer: `${origin}/`,
      Origin: origin,
    }, origin),
    body: JSON.stringify({
      context,
      continuation: continuationToken,
    }),
  })
  if (!contRes.ok) return { error: `Не удалось загрузить следующую страницу (HTTP ${contRes.status})`, payload: null }
  const payload = await contRes.json()
  return { error: null, payload }
}

function makeContinuationFallbacks(baseContext, meta = {}) {
  const visitorData = String(meta.visitorData ?? baseContext?.client?.visitorData ?? '').trim()
  const baseVersion = String(meta.clientVersion ?? baseContext?.client?.clientVersion ?? '2.20240601.00.00').trim()
  return [
    {
      endpointHost: 'www.youtube.com',
      context: baseContext,
      clientName: Number(meta.clientName ?? 1) || 1,
      clientVersion: baseVersion,
      visitorData,
    },
    {
      endpointHost: 'music.youtube.com',
      context: baseContext,
      clientName: Number(meta.clientName ?? 1) || 1,
      clientVersion: baseVersion,
      visitorData,
    },
    {
      endpointHost: 'www.youtube.com',
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: baseVersion || '2.20240601.00.00',
          hl: 'ru',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
      clientName: 1,
      clientVersion: baseVersion || '2.20240601.00.00',
      visitorData,
    },
    {
      endpointHost: 'music.youtube.com',
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: baseVersion || '1.20240603.01.00',
          hl: 'ru',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
      clientName: 67,
      clientVersion: baseVersion || '1.20240603.01.00',
      visitorData,
    },
  ]
}

async function fetchContinuationWithFallbacks(apiKey, context, continuationToken, meta = {}) {
  const attempts = makeContinuationFallbacks(context, meta)
  let lastError = null
  for (const attempt of attempts) {
    const res = await fetchYoutubePlaylistContinuationPage(apiKey, attempt.context, continuationToken, attempt)
    if (!res.error && res.payload) return res
    lastError = res.error ?? lastError
  }
  return { error: lastError ?? 'Не удалось загрузить следующую страницу плейлиста', payload: null }
}

async function fetchYoutubePlaylistBrowseRoot(apiKey, context, playlistId, headersMeta = {}) {
  const contextClientName = String(context?.client?.clientName ?? 'WEB').trim().toUpperCase()
  const clientNameMap = {
    WEB: 1,
    WEB_REMIX: 67,
  }
  const clientName = Number(headersMeta.clientName ?? clientNameMap[contextClientName] ?? 1) || 1
  const clientVersion = String(headersMeta.clientVersion ?? context?.client?.clientVersion ?? '2.20240601.00.00').trim()
  const visitorData = String(headersMeta.visitorData ?? context?.client?.visitorData ?? '').trim()
  const endpointHost = String(headersMeta.endpointHost ?? 'www.youtube.com').trim() || 'www.youtube.com'
  const origin = `https://${endpointHost}`
  const res = await fetch(`https://${endpointHost}/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: buildYoutubeRequestHeaders({
      'Content-Type': 'application/json',
      'X-YouTube-Client-Name': String(clientName),
      'X-YouTube-Client-Version': clientVersion,
      ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
      Referer: `${origin}/`,
      Origin: origin,
    }, origin),
    body: JSON.stringify({
      context,
      browseId: `VL${playlistId}`,
    }),
  })
  if (!res.ok) return { error: `Не удалось открыть root плейлиста (HTTP ${res.status})`, payload: null }
  const payload = await res.json()
  return { error: null, payload }
}

function makeBrowseRootFallbacks(baseContext, meta = {}) {
  const visitorData = String(meta.visitorData ?? baseContext?.client?.visitorData ?? '').trim()
  const baseVersion = String(meta.clientVersion ?? baseContext?.client?.clientVersion ?? '2.20240601.00.00').trim()
  return [
    {
      endpointHost: 'www.youtube.com',
      context: baseContext,
      clientName: Number(meta.clientName ?? 1) || 1,
      clientVersion: baseVersion,
      visitorData,
    },
    {
      endpointHost: 'music.youtube.com',
      context: baseContext,
      clientName: Number(meta.clientName ?? 1) || 1,
      clientVersion: baseVersion,
      visitorData,
    },
    {
      endpointHost: 'www.youtube.com',
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: baseVersion || '2.20240601.00.00',
          hl: 'ru',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
      clientName: 1,
      clientVersion: baseVersion || '2.20240601.00.00',
      visitorData,
    },
    {
      endpointHost: 'music.youtube.com',
      context: {
        client: {
          clientName: 'WEB_REMIX',
          clientVersion: baseVersion || '1.20240603.01.00',
          hl: 'ru',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
      clientName: 67,
      clientVersion: baseVersion || '1.20240603.01.00',
      visitorData,
    },
  ]
}

async function fetchBrowseRootWithFallbacks(apiKey, context, playlistId, meta = {}) {
  const attempts = makeBrowseRootFallbacks(context, meta)
  let lastError = null
  for (const attempt of attempts) {
    const res = await fetchYoutubePlaylistBrowseRoot(apiKey, attempt.context, playlistId, attempt)
    if (!res.error && res.payload) return res
    lastError = res.error ?? lastError
  }
  return { error: lastError ?? 'Не удалось открыть root плейлиста', payload: null }
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

export async function fetchPlaylistEntries(url, cursor = '') {
  const playlistId = parseYoutubePlaylistId(url)
  if (!playlistId) return { error: 'Нужна корректная ссылка на YouTube playlist', entries: [], next_cursor: null }
  const continuationToken = decodePlaylistCursor(cursor)
  try {
    if (!continuationToken) {
      const official = await fetchPlaylistViaYoutubeDataApi(playlistId).catch(() => ({ error: 'data api failed', entries: [] }))
      if (!official.error && official.entries.length) {
        return { error: null, entries: official.entries, next_cursor: null }
      }

      const noKey = await fetchPlaylistViaNoKeyApi(playlistId).catch(() => ({ error: 'noKey failed', entries: [] }))
      if (!noKey.error && noKey.entries.length) {
        return { error: null, entries: noKey.entries, next_cursor: null }
      }
    }

    const bootstrap = await fetchYoutubePlaylistBootstrap(playlistId)
    if (bootstrap.error) return { error: bootstrap.error, entries: [], next_cursor: null }

    if (!continuationToken) {
      const entriesMap = new Map()
      if (bootstrap.initialData) collectPlaylistVideos(bootstrap.initialData, entriesMap)
      let nextToken = bootstrap.initialData ? findContinuationToken(bootstrap.initialData) : null
      const apiKey = String(bootstrap.apiKey ?? '').trim()
      if (apiKey && (entriesMap.size === 0 || !nextToken)) {
        const root = await fetchBrowseRootWithFallbacks(apiKey, bootstrap.context, playlistId, {
          clientName: bootstrap.clientName,
          clientVersion: bootstrap.clientVersion,
          visitorData: bootstrap.visitorData,
        })
        if (!root.error && root.payload) {
          collectPlaylistVideos(root.payload, entriesMap)
          nextToken = findContinuationToken(root.payload, nextToken)
        }
      }
      const entries = Array.from(entriesMap.values())
      if (!entries.length) {
        // Fallback to RSS feed when page parsing fails.
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`
        const res = await fetch(feedUrl, { headers: buildYoutubeRequestHeaders({ 'User-Agent': 'VnG/1.0' }) })
        if (!res.ok) return { error: `Не удалось загрузить плейлист (HTTP ${res.status})`, entries: [], next_cursor: null }
        const xml = await res.text()
        const entryBlocks = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
        const rssEntries = entryBlocks.map((block, idx) => {
          const idMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)
          const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/)
          const thumbMatch = block.match(/<media:thumbnail[^>]+url="([^"]+)"/)
          const videoId = String(idMatch?.[1] ?? '').trim()
          if (!videoId) return null
          const title = htmlEntityDecode(String(titleMatch?.[1] ?? `Трек ${idx + 1}`)).trim().slice(0, 200)
          return {
            id: videoId,
            title: title || `Трек ${idx + 1}`,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail_url: String(thumbMatch?.[1] ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`).trim(),
          }
        }).filter(Boolean)
        if (!rssEntries.length) return { error: 'Плейлист пустой или закрыт', entries: [], next_cursor: null }
        return { error: null, entries: rssEntries, next_cursor: null }
      }
      return {
        error: null,
        entries,
        next_cursor: nextToken ? encodePlaylistCursor(nextToken) : null,
      }
    }

    const apiKey = String(bootstrap.apiKey ?? '').trim()
    if (!apiKey) return { error: 'Не удалось продолжить загрузку плейлиста (нет API key)', entries: [], next_cursor: null }
    const continuationPage = await fetchContinuationWithFallbacks(apiKey, bootstrap.context, continuationToken, {
      clientName: bootstrap.clientName,
      clientVersion: bootstrap.clientVersion,
      visitorData: bootstrap.visitorData,
    })
    if (continuationPage.error || !continuationPage.payload) {
      return { error: continuationPage.error ?? 'Не удалось получить следующую страницу плейлиста', entries: [], next_cursor: null }
    }
    const entriesMap = new Map()
    collectPlaylistVideos(continuationPage.payload, entriesMap)
    const nextToken = findContinuationToken(continuationPage.payload, continuationToken)
    return {
      error: null,
      entries: Array.from(entriesMap.values()),
      next_cursor: nextToken && nextToken !== continuationToken ? encodePlaylistCursor(nextToken) : null,
    }
  } catch {
    return { error: 'Не удалось прочитать YouTube плейлист', entries: [], next_cursor: null }
  }
}

