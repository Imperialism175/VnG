import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRoom } from '@/context/RoomContext'
import type { PlaylistEntry } from '@/lib/api'
import { generateId } from '@/lib/utils'
import { parseYoutubeVideoId, youtubeThumbnailUrl } from '@/lib/youtube'

const QUEUE_STORAGE_KEY = 'vng_gm_music_queue_v2'
const LEGACY_PLAYLIST_STORAGE_KEY = 'vng_gm_playlist_draft_v1'
const VOLUME_STORAGE_KEY = 'vng_local_music_volume'
const MAX_QUEUE = 1000

export type RepeatMode = 'off' | 'all' | 'one'

export interface QueueTrack {
  uid: string
  url: string
  title: string
  author: string | null
  thumbnail_url: string | null
  duration_sec: number | null
  video_id: string | null
}

export interface MusicProgress {
  current: number
  duration: number | null
}

interface StoredQueue {
  tracks: QueueTrack[]
  currentUid: string | null
  repeat: RepeatMode
  shuffle: boolean
  /** Порядок до перемешивания — чтобы выключение shuffle вернуло очередь как было */
  originalOrder: string[] | null
}

const EMPTY_QUEUE: StoredQueue = { tracks: [], currentUid: null, repeat: 'all', shuffle: false, originalOrder: null }

export function trackFromEntry(entry: PlaylistEntry): QueueTrack {
  const videoId = parseYoutubeVideoId(entry.url)
  return {
    uid: generateId(),
    url: entry.url,
    title: String(entry.title ?? '').trim() || 'Трек',
    author: entry.author ?? null,
    thumbnail_url: entry.thumbnail_url ?? (videoId ? youtubeThumbnailUrl(videoId) : null),
    duration_sec: Number.isFinite(Number(entry.duration_sec)) && entry.duration_sec ? Number(entry.duration_sec) : null,
    video_id: videoId,
  }
}

function sanitizeTrack(raw: unknown): QueueTrack | null {
  const t = (raw ?? {}) as Partial<QueueTrack>
  if (typeof t.url !== 'string' || !t.url.trim()) return null
  return {
    uid: typeof t.uid === 'string' && t.uid ? t.uid : generateId(),
    url: t.url,
    title: typeof t.title === 'string' && t.title.trim() ? t.title : 'Трек',
    author: typeof t.author === 'string' ? t.author : null,
    thumbnail_url: typeof t.thumbnail_url === 'string' ? t.thumbnail_url : null,
    duration_sec: Number.isFinite(Number(t.duration_sec)) && t.duration_sec ? Number(t.duration_sec) : null,
    video_id: typeof t.video_id === 'string' ? t.video_id : parseYoutubeVideoId(t.url),
  }
}

function loadQueue(): StoredQueue {
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredQueue>
      const tracks = (Array.isArray(parsed.tracks) ? parsed.tracks : [])
        .map(sanitizeTrack)
        .filter((t): t is QueueTrack => t !== null)
        .slice(0, MAX_QUEUE)
      return {
        tracks,
        currentUid: typeof parsed.currentUid === 'string' ? parsed.currentUid : null,
        repeat: parsed.repeat === 'off' || parsed.repeat === 'one' ? parsed.repeat : 'all',
        shuffle: Boolean(parsed.shuffle),
        originalOrder: Array.isArray(parsed.originalOrder) ? parsed.originalOrder.map(String) : null,
      }
    }
    // Перенос треков из старого плеера
    const legacyRaw = window.localStorage.getItem(LEGACY_PLAYLIST_STORAGE_KEY)
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { playlistEntries?: PlaylistEntry[] }
      const tracks = (Array.isArray(legacy.playlistEntries) ? legacy.playlistEntries : [])
        .filter((e) => typeof e?.url === 'string')
        .slice(0, MAX_QUEUE)
        .map(trackFromEntry)
      return { ...EMPTY_QUEUE, tracks }
    }
  } catch {
    /* ignore storage errors */
  }
  return EMPTY_QUEUE
}

function readStoredVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY)
    const n = Number(raw)
    if (raw !== null && Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)))
  } catch {
    /* ignore */
  }
  return 70
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

interface MusicPlayerValue {
  isGm: boolean
  tracks: QueueTrack[]
  currentUid: string | null
  currentTrack: QueueTrack | null
  repeat: RepeatMode
  shuffle: boolean
  volume: number
  setVolume: (v: number) => void
  playTrack: (track: QueueTrack) => void
  playEntriesNow: (entries: PlaylistEntry[]) => void
  playNext: (entries: PlaylistEntry[]) => void
  enqueue: (entries: PlaylistEntry[]) => void
  replaceQueue: (entries: PlaylistEntry[], startIndex?: number) => void
  removeTrack: (uid: string) => void
  moveTrack: (uid: string, toIndex: number) => void
  clearQueue: () => void
  next: () => void
  prev: () => void
  togglePlay: () => void
  seek: (sec: number) => void
  stop: () => void
  cycleRepeat: () => void
  toggleShuffle: () => void
  reportEnded: (key: string) => void
  openPlayer: () => void
  setOpenPlayerHandler: (fn: (() => void) | null) => void
}

interface MusicProgressValue {
  progress: MusicProgress
  setProgress: (p: MusicProgress) => void
}

const MusicPlayerContext = createContext<MusicPlayerValue | null>(null)
const MusicProgressContext = createContext<MusicProgressValue | null>(null)

/**
 * Очередь и управление музыкой комнаты. Очередь живёт у ГМа (localStorage),
 * а в комнату уходит только текущий трек, пауза, перемотка и повтор.
 */
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { music, session, setMusic, musicControl } = useRoom()
  const isGm = session.isGm
  const [queue, setQueue] = useState<StoredQueue>(loadQueue)
  const [progress, setProgressState] = useState<MusicProgress>({ current: 0, duration: null })
  const [volume, setVolumeState] = useState(readStoredVolume)
  const queueRef = useRef(queue)
  const musicRef = useRef(music)
  const progressRef = useRef(progress)
  const lastEndedKeyRef = useRef<string | null>(null)
  const openPlayerRef = useRef<(() => void) | null>(null)
  queueRef.current = queue
  musicRef.current = music
  progressRef.current = progress

  useEffect(() => {
    if (!isGm) return
    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
    } catch {
      /* ignore storage errors */
    }
  }, [queue, isGm])

  const currentUid = useMemo(() => {
    if (music.url) {
      const exact = queue.tracks.find((t) => t.uid === queue.currentUid && t.url === music.url)
      if (exact) return exact.uid
      const byUrl = queue.tracks.find((t) => t.url === music.url)
      if (byUrl) return byUrl.uid
    }
    return queue.currentUid
  }, [music.url, queue.tracks, queue.currentUid])
  const currentTrack = queue.tracks.find((t) => t.uid === currentUid) ?? null

  const setVolume = useCallback((v: number) => {
    const next = Math.max(0, Math.min(100, Math.round(v)))
    setVolumeState(next)
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(next))
    } catch {
      /* ignore */
    }
  }, [])

  const setProgress = useCallback((p: MusicProgress) => {
    setProgressState((prev) =>
      Math.abs(prev.current - p.current) < 0.2 && prev.duration === p.duration ? prev : p
    )
  }, [])

  const playTrack = useCallback(
    (track: QueueTrack) => {
      setQueue((q) => ({ ...q, currentUid: track.uid }))
      lastEndedKeyRef.current = null
      setProgressState({ current: 0, duration: track.duration_sec })
      setMusic(track.url, true, {
        title: track.title,
        author: track.author,
        thumbnailUrl: track.thumbnail_url,
        repeatOne: queueRef.current.repeat === 'one',
      })
    },
    [setMusic]
  )

  const insertAfterCurrent = useCallback(
    (entries: PlaylistEntry[]): QueueTrack[] => {
      const added = entries.map(trackFromEntry)
      setQueue((q) => {
        const idx = q.tracks.findIndex((t) => t.uid === currentUid)
        const tracks = [...q.tracks]
        tracks.splice(idx + 1, 0, ...added)
        return {
          ...q,
          tracks: tracks.slice(0, MAX_QUEUE),
          originalOrder: q.originalOrder ? [...q.originalOrder, ...added.map((t) => t.uid)] : null,
        }
      })
      return added
    },
    [currentUid]
  )

  const playEntriesNow = useCallback(
    (entries: PlaylistEntry[]) => {
      if (!entries.length) return
      const added = insertAfterCurrent(entries)
      playTrack(added[0])
    },
    [insertAfterCurrent, playTrack]
  )

  const playNext = useCallback(
    (entries: PlaylistEntry[]) => {
      if (entries.length) insertAfterCurrent(entries)
    },
    [insertAfterCurrent]
  )

  const enqueue = useCallback((entries: PlaylistEntry[]) => {
    if (!entries.length) return
    const added = entries.map(trackFromEntry)
    setQueue((q) => ({
      ...q,
      tracks: [...q.tracks, ...added].slice(0, MAX_QUEUE),
      originalOrder: q.originalOrder ? [...q.originalOrder, ...added.map((t) => t.uid)] : null,
    }))
  }, [])

  const replaceQueue = useCallback(
    (entries: PlaylistEntry[], startIndex = 0) => {
      const tracks = entries.slice(0, MAX_QUEUE).map(trackFromEntry)
      if (!tracks.length) return
      const start = tracks[Math.max(0, Math.min(tracks.length - 1, startIndex))]
      setQueue((q) => ({ ...q, tracks, currentUid: start.uid, shuffle: false, originalOrder: null }))
      playTrack(start)
    },
    [playTrack]
  )

  const removeTrack = useCallback((uid: string) => {
    setQueue((q) => ({
      ...q,
      tracks: q.tracks.filter((t) => t.uid !== uid),
      originalOrder: q.originalOrder ? q.originalOrder.filter((id) => id !== uid) : null,
    }))
  }, [])

  const moveTrack = useCallback((uid: string, toIndex: number) => {
    setQueue((q) => {
      const from = q.tracks.findIndex((t) => t.uid === uid)
      if (from < 0) return q
      const tracks = [...q.tracks]
      const [item] = tracks.splice(from, 1)
      tracks.splice(Math.max(0, Math.min(tracks.length, toIndex)), 0, item)
      return { ...q, tracks }
    })
  }, [])

  const clearQueue = useCallback(() => {
    setQueue((q) => {
      // Играющий трек оставляем, чтобы не терять «сейчас играет»
      const playing = q.tracks.find((t) => t.uid === currentUid && musicRef.current.url === t.url)
      return { ...q, tracks: playing ? [playing] : [], originalOrder: null, shuffle: false }
    })
  }, [currentUid])

  const stepTrack = useCallback(
    (dir: 1 | -1, auto: boolean) => {
      const { tracks, repeat } = queueRef.current
      if (!tracks.length) return
      const idx = tracks.findIndex((t) => t.uid === currentUid)
      let target = idx + dir
      if (target >= tracks.length) {
        // Конец очереди: дальше играем только с «повтором всего» или по кнопке
        if (repeat !== 'all' && auto) return
        target = 0
      }
      if (target < 0) target = repeat === 'all' ? tracks.length - 1 : 0
      const track = tracks[target]
      if (track) playTrack(track)
    },
    [currentUid, playTrack]
  )

  const next = useCallback(() => stepTrack(1, false), [stepTrack])

  const seek = useCallback(
    (sec: number) => {
      const position = Math.max(0, sec)
      setProgressState((p) => ({ ...p, current: position }))
      musicControl('seek', { position })
    },
    [musicControl]
  )

  const prev = useCallback(() => {
    // Как в YouTube Music: если трек уже играет больше 3 секунд — сначала в начало
    if (musicRef.current.url && progressRef.current.current > 3) {
      seek(0)
      return
    }
    stepTrack(-1, false)
  }, [seek, stepTrack])

  const togglePlay = useCallback(() => {
    const m = musicRef.current
    if (m.playing) {
      musicControl('pause')
      return
    }
    if (m.paused && m.url) {
      musicControl('resume')
      return
    }
    const { tracks } = queueRef.current
    const track = tracks.find((t) => t.uid === currentUid) ?? tracks[0]
    if (track) playTrack(track)
  }, [currentUid, musicControl, playTrack])

  const stop = useCallback(() => {
    setMusic(null, false)
  }, [setMusic])

  const cycleRepeat = useCallback(() => {
    const nextMode: RepeatMode =
      queueRef.current.repeat === 'off' ? 'all' : queueRef.current.repeat === 'all' ? 'one' : 'off'
    setQueue((q) => ({ ...q, repeat: nextMode }))
    if (musicRef.current.url) musicControl('repeat', { repeatOne: nextMode === 'one' })
  }, [musicControl])

  const toggleShuffle = useCallback(() => {
    setQueue((q) => {
      if (!q.shuffle) {
        const idx = q.tracks.findIndex((t) => t.uid === currentUid)
        const head = q.tracks.slice(0, idx + 1)
        const tail = shuffled(q.tracks.slice(idx + 1))
        return { ...q, shuffle: true, originalOrder: q.tracks.map((t) => t.uid), tracks: [...head, ...tail] }
      }
      const order = q.originalOrder ?? []
      const rank = new Map(order.map((uid, i) => [uid, i]))
      const tracks = [...q.tracks].sort(
        (a, b) => (rank.get(a.uid) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.uid) ?? Number.MAX_SAFE_INTEGER)
      )
      return { ...q, shuffle: false, originalOrder: null, tracks }
    })
  }, [currentUid])

  const reportEnded = useCallback(
    (key: string) => {
      if (!isGm || musicRef.current.repeat_one) return
      if (lastEndedKeyRef.current === key) return
      lastEndedKeyRef.current = key
      stepTrack(1, true)
    },
    [isGm, stepTrack]
  )

  const openPlayer = useCallback(() => {
    openPlayerRef.current?.()
  }, [])

  const setOpenPlayerHandler = useCallback((fn: (() => void) | null) => {
    openPlayerRef.current = fn
  }, [])

  const value = useMemo<MusicPlayerValue>(
    () => ({
      isGm,
      tracks: queue.tracks,
      currentUid,
      currentTrack,
      repeat: queue.repeat,
      shuffle: queue.shuffle,
      volume,
      setVolume,
      playTrack,
      playEntriesNow,
      playNext,
      enqueue,
      replaceQueue,
      removeTrack,
      moveTrack,
      clearQueue,
      next,
      prev,
      togglePlay,
      seek,
      stop,
      cycleRepeat,
      toggleShuffle,
      reportEnded,
      openPlayer,
      setOpenPlayerHandler,
    }),
    [
      isGm,
      queue.tracks,
      currentUid,
      currentTrack,
      queue.repeat,
      queue.shuffle,
      volume,
      setVolume,
      playTrack,
      playEntriesNow,
      playNext,
      enqueue,
      replaceQueue,
      removeTrack,
      moveTrack,
      clearQueue,
      next,
      prev,
      togglePlay,
      seek,
      stop,
      cycleRepeat,
      toggleShuffle,
      reportEnded,
      openPlayer,
      setOpenPlayerHandler,
    ]
  )

  const progressValue = useMemo(() => ({ progress, setProgress }), [progress, setProgress])

  return (
    <MusicPlayerContext.Provider value={value}>
      <MusicProgressContext.Provider value={progressValue}>{children}</MusicProgressContext.Provider>
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayer(): MusicPlayerValue {
  const ctx = useContext(MusicPlayerContext)
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  return ctx
}

export function useMusicProgress(): MusicProgressValue {
  const ctx = useContext(MusicProgressContext)
  if (!ctx) throw new Error('useMusicProgress must be used within MusicPlayerProvider')
  return ctx
}

export function formatTrackTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return '--:--'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
