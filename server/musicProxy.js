import { spawn } from 'node:child_process'
import { mkdir, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import play from 'play-dl'
import { YtdlCore, toPipeableStream } from '@ybd-project/ytdl-core'
import YTDlpWrap from 'yt-dlp-wrap'
import { parseYoutubeVideoId } from './roomExtras.js'

const hubs = new Map()
const ytdlCore = new YtdlCore({ noUpdate: true })
let downloadedYtDlpPathPromise = null

const DIRECT_AUDIO = /\.(mp3|ogg|opus|wav|m4a|aac|flac|webm)(\?|$)/i

export function detectMusicSource(url) {
  if (!url) return null
  if (DIRECT_AUDIO.test(url) || url.includes('/audio/')) return 'direct'
  if (parseYoutubeVideoId(url)) return 'youtube'
  return null
}

function normalizeYoutubeWatchUrl(url) {
  const raw = String(url ?? '').trim()
  const id = parseYoutubeVideoId(raw)
  if (id) return `https://www.youtube.com/watch?v=${id}`
  return raw
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

function findYtDlp() {
  const fromEnv = process.env.YT_DLP_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const candidates = [
    'yt-dlp',
    'yt-dlp.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
    'C:\\Program Files\\yt-dlp\\yt-dlp.exe',
    join(process.env.USERPROFILE ?? '', 'scoop', 'shims', 'yt-dlp.exe'),
  ]
  for (const c of candidates) {
    if (c && (c === 'yt-dlp' || c === 'yt-dlp.exe' || existsSync(c))) return c
  }
  return null
}

async function getOrDownloadYtDlp() {
  const found = findYtDlp()
  if (found) return found
  if (!downloadedYtDlpPathPromise) {
    downloadedYtDlpPathPromise = (async () => {
      const cacheDir = join(process.cwd(), '.cache')
      await mkdir(cacheDir, { recursive: true })
      const fileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
      const binPath = join(cacheDir, fileName)
      if (!existsSync(binPath)) {
        await YTDlpWrap.downloadFromGithub(binPath)
        if (process.platform !== 'win32') {
          await chmod(binPath, 0o755)
        }
      }
      return binPath
    })()
  }
  try {
    return await downloadedYtDlpPathPromise
  } catch {
    downloadedYtDlpPathPromise = null
    return null
  }
}

class RoomMusicHub {
  constructor(roomId) {
    this.roomId = roomId
    this.clients = new Set()
    this.process = null
    this.fetchAbort = null
    this.fallbackStream = null
    this.sourceUrl = null
    this.started = false
    this.contentType = 'audio/mp4'
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
    this.sourceUrl = source === 'youtube' ? normalizeYoutubeWatchUrl(url) : url
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

    if (this.source === 'direct') {
      this._streamDirect(this.sourceUrl)
      return
    }

    const ytDlp = await getOrDownloadYtDlp()
    if (!ytDlp) {
      this._streamViaYtdlCore(this.sourceUrl)
      return
    }

    this.process = spawn(
      ytDlp,
      [
        '--js-runtimes',
        'node',
        '-f',
        'bestaudio[ext=m4a]/bestaudio/best',
        '--no-playlist',
        '--no-warnings',
        '-o',
        '-',
        this.sourceUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    )

    this.process.stdout.on('data', (chunk) => this._broadcast(chunk))
    this.process.stderr.on('data', () => {})
    this.process.on('error', (err) => {
      this._failAll(err.message ?? 'yt-dlp error')
    })
    this.process.on('close', (code) => {
      if (code !== 0 && code !== null) {
        this._failAll('Не удалось получить аудио с YouTube на хосте')
      }
      for (const res of this.clients) {
        if (!res.writableEnded) res.end()
      }
    })
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

  async _streamViaYtdlCore(url) {
    try {
      const info = await ytdlCore.getBasicInfo(url, {
        quality: 'highestaudio',
        filter: 'audioonly',
      })
      const audioFormats = YtdlCore.filterFormats(info.formats, 'audioonly')
      const best = audioFormats[0]
      this.contentType = String(best?.mimeType ?? '').includes('webm') ? 'audio/webm' : 'audio/mp4'
      const webStream = await ytdlCore.download(url, {
        quality: 'highestaudio',
        filter: 'audioonly',
        highWaterMark: 1 << 25,
      })
      this.fallbackStream = toPipeableStream(webStream)
      this.fallbackStream.on('data', (chunk) => this._broadcast(chunk))
      this.fallbackStream.on('end', () => {
        for (const res of this.clients) {
          if (!res.writableEnded) res.end()
        }
      })
      this.fallbackStream.on('error', (err) => {
        this._failAll(err?.message ?? 'Ошибка потока YouTube')
      })
    } catch {
      this._failAll('Не удалось получить аудио с YouTube на сервере')
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
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
    if (this.fetchAbort) {
      this.fetchAbort.abort()
      this.fetchAbort = null
    }
    if (this.fallbackStream) {
      try {
        this.fallbackStream.destroy()
      } catch {
        /* ignore */
      }
      this.fallbackStream = null
    }
    this.started = false
    this.sourceUrl = null
    this.contentType = 'audio/mp4'
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

export async function fetchTitleViaYtDlp(url) {
  const normalizedUrl = normalizeYoutubeWatchUrl(url)
  const ytDlp = await getOrDownloadYtDlp()
  if (!ytDlp) {
    try {
      const info = await ytdlCore.getBasicInfo(normalizedUrl)
      const title = String(info?.videoDetails?.title ?? '').trim()
      return title ? title.slice(0, 200) : null
    } catch {
      try {
        const info = await play.video_basic_info(normalizedUrl)
        const title = String(info?.video_details?.title ?? '').trim()
        return title ? title.slice(0, 200) : null
      } catch {
        return null
      }
    }
  }
  return new Promise((resolve) => {
    const proc = spawn(ytDlp, ['--js-runtimes', 'node', '--print', 'title', '--no-playlist', normalizedUrl], {
      windowsHide: true,
    })
    let out = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.on('close', (code) => {
      resolve(code === 0 && out.trim() ? out.trim().slice(0, 200) : null)
    })
    proc.on('error', () => resolve(null))
  })
}

export async function fetchPlaylistEntriesViaYtDlp(url) {
  const normalizedUrl = normalizeYoutubePlaylistUrl(url)
  const ytDlp = await getOrDownloadYtDlp()
  if (!ytDlp) {
    try {
      const playlist = await play.playlist_info(normalizedUrl, { incomplete: true })
      const videos = await playlist.all_videos()
      const entries = videos
        .slice(0, 100)
        .map((item, idx) => ({
          id: String(item?.id ?? `${idx + 1}`),
          title:
            String(item?.title ?? `Трек ${idx + 1}`)
              .trim()
              .slice(0, 200) || `Трек ${idx + 1}`,
          url: String(item?.url ?? (item?.id ? `https://www.youtube.com/watch?v=${item.id}` : '')),
        }))
        .filter((e) => /^https?:\/\//i.test(e.url))
      return { error: null, entries }
    } catch {
      return { error: 'Не удалось прочитать плейлист (fallback)', entries: [] }
    }
  }
  return new Promise((resolve) => {
    const proc = spawn(
      ytDlp,
      [
        '--js-runtimes',
        'node',
        '--dump-single-json',
        '--flat-playlist',
        '--playlist-end',
        '100',
        '--no-warnings',
        normalizedUrl,
      ],
      { windowsHide: true }
    )
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d.toString()))
    proc.stderr.on('data', (d) => (err += d.toString()))
    proc.on('close', () => {
      try {
        const payload = JSON.parse(out || '{}')
        const sourceEntries = Array.isArray(payload?.entries) ? payload.entries : []
        const entries = sourceEntries
          .map((item, idx) => {
            const id = String(item?.id ?? '').trim()
            const directUrl = typeof item?.url === 'string' && /^https?:\/\//i.test(item.url) ? item.url.trim() : null
            const watchUrl =
              id && (payload?.extractor_key === 'YoutubeTab' || payload?.extractor === 'youtube:tab')
                ? `https://www.youtube.com/watch?v=${id}`
                : null
            const finalUrl = directUrl ?? watchUrl
            if (!finalUrl) return null
            return {
              id: id || `${idx + 1}`,
              title: String(item?.title ?? `Трек ${idx + 1}`).trim().slice(0, 200) || `Трек ${idx + 1}`,
              url: finalUrl,
            }
          })
          .filter(Boolean)
        resolve({ error: null, entries })
      } catch {
        resolve({ error: err.trim() || 'Не удалось прочитать плейлист', entries: [] })
      }
    })
    proc.on('error', () => resolve({ error: 'Ошибка запуска yt-dlp', entries: [] }))
  })
}

export function getYtDlpStatus() {
  const found = findYtDlp()
  return { available: Boolean(found || downloadedYtDlpPathPromise), path: found ?? null }
}
