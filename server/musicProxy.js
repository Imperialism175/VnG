import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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

class RoomMusicHub {
  constructor(roomId) {
    this.roomId = roomId
    this.clients = new Set()
    this.process = null
    this.fetchAbort = null
    this.sourceUrl = null
    this.started = false
  }

  attach(res) {
    this.clients.add(res)
    res.on('close', () => {
      this.clients.delete(res)
      if (this.clients.size === 0) this.stop()
    })
    if (!this.started && this.sourceUrl) this._startPipeline()
  }

  start(url, source) {
    this.sourceUrl = url
    this.source = source
    if (this.clients.size > 0) this._startPipeline()
  }

  _writeHeaders(res) {
    if (res.headersSent) return
    res.writeHead(200, {
      'Content-Type': 'audio/mp4',
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

  _startPipeline() {
    if (this.started || !this.sourceUrl) return
    this.started = true

    if (this.source === 'direct') {
      this._streamDirect(this.sourceUrl)
      return
    }

    const ytDlp = findYtDlp()
    if (!ytDlp) {
      this._failAll('На хосте не найден yt-dlp. Установите yt-dlp или вставьте прямую ссылку на .mp3')
      return
    }

    this.process = spawn(
      ytDlp,
      [
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
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
    if (this.fetchAbort) {
      this.fetchAbort.abort()
      this.fetchAbort = null
    }
    this.started = false
    this.sourceUrl = null
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
  const ytDlp = findYtDlp()
  if (!ytDlp) return null
  return new Promise((resolve) => {
    const proc = spawn(ytDlp, ['--print', 'title', '--no-playlist', url], {
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

export function getYtDlpStatus() {
  return { available: Boolean(findYtDlp()), path: findYtDlp() }
}
