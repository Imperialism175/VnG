import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import {
  GripVertical,
  ListEnd,
  ListPlus,
  Loader2,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import type { RoomMusic } from '@/types'
import { apiGetPlaylistEntries, apiGetTrackInfo, apiSearchMusic, type PlaylistEntry } from '@/lib/api'
import { MusicVolumeControl } from '@/components/RoomMusic/MusicVolumeControl'
import {
  formatTrackTime,
  useMusicPlayer,
  useMusicProgress,
  type QueueTrack,
} from '@/components/RoomMusic/MusicPlayerContext'

const MAX_PLAYLIST_PAGES = 20
const DIRECT_AUDIO = /\.(mp3|ogg|opus|wav|m4a|aac|flac|webm)(\?|$)/i

function isPlaylistUrl(text: string) {
  try {
    const u = new URL(text)
    return Boolean(u.searchParams.get('list')) && /youtube\.com|youtu\.be/.test(u.hostname)
  } catch {
    return false
  }
}

function looksLikeUrl(text: string) {
  return /^https?:\/\//i.test(text.trim())
}

interface ResultsState {
  kind: 'search' | 'playlist' | 'track'
  label: string
  entries: PlaylistEntry[]
  loadingMore?: boolean
}

function EqualizerBars({ playing }: { playing: boolean }) {
  return (
    <span className={`vng-mp-eq ${playing ? 'vng-mp-eq--on' : ''}`} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  )
}

function TrackThumb({ src, size = 'sm' }: { src: string | null | undefined; size?: 'sm' | 'lg' }) {
  if (!src) {
    return <span className={`vng-mp-thumb vng-mp-thumb--${size} vng-mp-thumb--empty`}>♪</span>
  }
  return <img src={src} alt="" loading="lazy" className={`vng-mp-thumb vng-mp-thumb--${size}`} />
}

/** Полноэкранный плеер ГМа в духе YouTube Music: сейчас играет, поиск и очередь */
export function GmMusicPlayer({ music }: { music: RoomMusic }) {
  const player = useMusicPlayer()
  const { progress } = useMusicProgress()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ResultsState | null>(null)
  const [queueFilter, setQueueFilter] = useState('')
  const [dragUid, setDragUid] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [scrubValue, setScrubValue] = useState<number | null>(null)
  const loadTokenRef = useRef(0)
  const currentRowRef = useRef<HTMLLIElement | null>(null)

  const duration = progress.duration ?? player.currentTrack?.duration_sec ?? null
  const shownTime = scrubValue ?? progress.current
  const hasTrack = Boolean(music.url)
  const nowTitle = music.title ?? player.currentTrack?.title ?? 'Ничего не играет'
  const nowAuthor = music.author ?? player.currentTrack?.author ?? null
  const nowCover = music.thumbnail_url ?? player.currentTrack?.thumbnail_url ?? null

  const filteredQueue = useMemo(() => {
    const q = queueFilter.trim().toLowerCase()
    if (!q) return player.tracks
    return player.tracks.filter(
      (t) => t.title.toLowerCase().includes(q) || String(t.author ?? '').toLowerCase().includes(q)
    )
  }, [player.tracks, queueFilter])

  const totalQueueSec = useMemo(
    () => player.tracks.reduce((sum, t) => sum + (t.duration_sec ?? 0), 0),
    [player.tracks]
  )
  const currentIndex = player.tracks.findIndex((t) => t.uid === player.currentUid)

  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [player.currentUid])

  const loadPlaylist = useCallback(async (url: string) => {
    const token = ++loadTokenRef.current
    const first = await apiGetPlaylistEntries(url)
    if (token !== loadTokenRef.current) return
    setResults({ kind: 'playlist', label: 'Плейлист', entries: first.entries, loadingMore: Boolean(first.next_cursor) })
    if (!first.entries.length) setError('Плейлист пустой или закрыт')
    let cursor = first.next_cursor
    let pages = 0
    while (cursor && pages < MAX_PLAYLIST_PAGES) {
      pages += 1
      try {
        const page = await apiGetPlaylistEntries(url, cursor)
        if (token !== loadTokenRef.current) return
        cursor = page.next_cursor
        setResults((prev) => {
          if (!prev || prev.kind !== 'playlist') return prev
          const seen = new Set(prev.entries.map((e) => e.url))
          return {
            ...prev,
            entries: [...prev.entries, ...page.entries.filter((e) => !seen.has(e.url))],
            loadingMore: Boolean(cursor),
          }
        })
      } catch {
        break
      }
    }
    if (token === loadTokenRef.current) {
      setResults((prev) => (prev ? { ...prev, loadingMore: false } : prev))
    }
  }, [])

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    const text = query.trim()
    if (!text) return
    setBusy(true)
    setError(null)
    try {
      if (looksLikeUrl(text) && isPlaylistUrl(text)) {
        // Ссылка на плейлист (или на трек внутри плейлиста) — показываем весь плейлист
        await loadPlaylist(text)
      } else if (looksLikeUrl(text) || DIRECT_AUDIO.test(text)) {
        const res = await apiGetTrackInfo(text)
        loadTokenRef.current += 1
        setResults({ kind: 'track', label: 'Трек по ссылке', entries: [res.entry] })
      } else {
        const res = await apiSearchMusic(text)
        loadTokenRef.current += 1
        setResults({ kind: 'search', label: `Поиск: ${text}`, entries: res.entries })
        if (!res.entries.length) setError('Ничего не нашлось')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  function commitSeek(value: number) {
    setScrubValue(null)
    if (hasTrack) player.seek(value)
  }

  // Горячие клавиши как в YouTube Music
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey)) {
        return
      }
      if (e.code === 'Space' || e.key === 'k' || e.key === 'л') {
        e.preventDefault()
        player.togglePlay()
      } else if (e.key === 'ArrowRight' && hasTrack) {
        e.preventDefault()
        player.seek(progress.current + 10)
      } else if (e.key === 'ArrowLeft' && hasTrack) {
        e.preventDefault()
        player.seek(Math.max(0, progress.current - 10))
      } else if ((e.key === 'N' || e.key === 'Т') && e.shiftKey) {
        player.next()
      } else if ((e.key === 'P' || e.key === 'З') && e.shiftKey) {
        player.prev()
      } else if (e.key === 'r' || e.key === 'к') {
        player.cycleRepeat()
      } else if (e.key === 's' || e.key === 'ы') {
        player.toggleShuffle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, hasTrack, progress])

  function onDragStart(e: DragEvent, uid: string) {
    setDragUid(uid)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', uid)
  }

  function onDragOverRow(e: DragEvent, index: number) {
    if (!dragUid) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    setDropIndex(index + (after ? 1 : 0))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    if (dragUid !== null && dropIndex !== null) {
      const from = player.tracks.findIndex((t) => t.uid === dragUid)
      player.moveTrack(dragUid, from >= 0 && from < dropIndex ? dropIndex - 1 : dropIndex)
    }
    setDragUid(null)
    setDropIndex(null)
  }

  const RepeatIcon = player.repeat === 'one' ? Repeat1 : Repeat
  const repeatLabel =
    player.repeat === 'off' ? 'Повтор выключен' : player.repeat === 'all' ? 'Повтор очереди' : 'Повтор трека'

  return (
    <div className="vng-mp flex-1 min-h-0">
      {/* ---------- Сейчас играет ---------- */}
      <section className="vng-mp__now">
        <div className="vng-mp__cover-wrap">
          {nowCover ? (
            <img src={nowCover} alt="" className="vng-mp__cover" />
          ) : (
            <div className="vng-mp__cover vng-mp__cover--empty">
              <Music size={48} />
            </div>
          )}
          {music.paused && <span className="vng-mp__cover-badge">ПАУЗА</span>}
        </div>
        <div className="vng-mp__meta">
          <h2 className="vng-mp__title" title={nowTitle}>
            {nowTitle}
          </h2>
          <p className="vng-mp__author">{nowAuthor ?? (hasTrack ? (music.source === 'youtube' ? 'YouTube' : 'Аудиофайл') : 'Найдите трек в поиске или вставьте ссылку')}</p>
        </div>

        <div className="vng-mp__seek">
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration ?? 0))}
            step={1}
            value={Math.min(Math.floor(shownTime), Math.max(1, Math.floor(duration ?? 0)))}
            disabled={!hasTrack || !duration}
            onChange={(e) => setScrubValue(Number(e.target.value))}
            onPointerUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => commitSeek(Number((e.target as HTMLInputElement).value))}
            className="vng-mp__range"
            style={{ ['--vng-mp-pct' as string]: `${duration ? (Math.min(shownTime, duration) / duration) * 100 : 0}%` }}
            aria-label="Перемотка"
          />
          <div className="vng-mp__times vng-mono">
            <span>{formatTrackTime(shownTime)}</span>
            <span>{formatTrackTime(duration)}</span>
          </div>
        </div>

        <div className="vng-mp__controls">
          <button
            type="button"
            className={`vng-mp-icon-btn ${player.shuffle ? 'vng-mp-icon-btn--on' : ''}`}
            onClick={player.toggleShuffle}
            title={player.shuffle ? 'Перемешано (S)' : 'Перемешать очередь (S)'}
            aria-pressed={player.shuffle}
          >
            <Shuffle size={20} />
          </button>
          <button type="button" className="vng-mp-icon-btn" onClick={player.prev} title="Назад (Shift+P)">
            <SkipBack size={24} />
          </button>
          <button
            type="button"
            className="vng-mp-play"
            onClick={player.togglePlay}
            disabled={!hasTrack && player.tracks.length === 0}
            title={music.playing ? 'Пауза (пробел)' : 'Играть (пробел)'}
          >
            {music.playing ? <Pause size={30} /> : <Play size={30} />}
          </button>
          <button type="button" className="vng-mp-icon-btn" onClick={player.next} title="Дальше (Shift+N)">
            <SkipForward size={24} />
          </button>
          <button
            type="button"
            className={`vng-mp-icon-btn ${player.repeat !== 'off' ? 'vng-mp-icon-btn--on' : ''}`}
            onClick={player.cycleRepeat}
            title={`${repeatLabel} (R)`}
          >
            <RepeatIcon size={20} />
          </button>
        </div>

        <div className="vng-mp__under">
          <MusicVolumeControl volume={player.volume} onChange={player.setVolume} />
          <button
            type="button"
            className="vng-mp-text-btn"
            onClick={player.stop}
            disabled={!hasTrack}
            title="Остановить музыку у всех"
          >
            <Square size={12} /> Стоп для всех
          </button>
        </div>
        <p className="vng-mp__hint">
          Громкость только у вас, игроки настраивают свою. Пробел — пауза, ←/→ — 10 секунд.
        </p>
      </section>

      {/* ---------- Поиск + очередь ---------- */}
      <section className="vng-mp__side">
        <form className="vng-mp-search" onSubmit={handleSubmit}>
          <Search size={16} className="vng-mp-search__icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск на YouTube, ссылка на трек или плейлист"
            className="vng-mp-search__input"
            aria-label="Поиск музыки"
          />
          {query && (
            <button type="button" className="vng-mp-icon-btn" onClick={() => setQuery('')} aria-label="Очистить">
              <X size={14} />
            </button>
          )}
          <button type="submit" className="vng-mp-text-btn" disabled={busy || !query.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : 'Найти'}
          </button>
        </form>
        {error && <p className="vng-mp__error">{error}</p>}

        {results && (
          <div className="vng-mp-block">
            <header className="vng-mp-block__head">
              <span className="truncate">
                {results.label} · {results.entries.length}
                {results.loadingMore ? '…' : ''}
              </span>
              <span className="flex items-center gap-1 shrink-0">
                {results.entries.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="vng-mp-text-btn"
                      onClick={() => player.replaceQueue(results.entries)}
                      title="Заменить очередь и играть"
                    >
                      <Play size={12} /> Играть всё
                    </button>
                    <button
                      type="button"
                      className="vng-mp-text-btn"
                      onClick={() => player.enqueue(results.entries)}
                      title="Добавить всё в конец очереди"
                    >
                      <ListPlus size={12} /> В очередь
                    </button>
                  </>
                )}
                <button type="button" className="vng-mp-icon-btn" onClick={() => setResults(null)} aria-label="Закрыть">
                  <X size={14} />
                </button>
              </span>
            </header>
            <ul className="vng-mp-list vng-mp-list--results">
              {results.entries.map((entry, i) => (
                <li key={`${entry.id}-${i}`} className="vng-mp-row">
                  <button
                    type="button"
                    className="vng-mp-row__main"
                    onClick={() => player.playEntriesNow([entry])}
                    title="Играть сейчас"
                  >
                    <TrackThumb src={entry.thumbnail_url} />
                    <span className="vng-mp-row__text">
                      <span className="vng-mp-row__title">{entry.title}</span>
                      <span className="vng-mp-row__sub">
                        {entry.author ?? ''}
                        {entry.duration_sec ? ` · ${formatTrackTime(entry.duration_sec)}` : ''}
                      </span>
                    </span>
                  </button>
                  <span className="vng-mp-row__actions">
                    <button type="button" className="vng-mp-icon-btn" onClick={() => player.playNext([entry])} title="Сыграть следующим">
                      <ListEnd size={16} />
                    </button>
                    <button type="button" className="vng-mp-icon-btn" onClick={() => player.enqueue([entry])} title="Добавить в очередь">
                      <ListPlus size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="vng-mp-block vng-mp-block--queue">
          <header className="vng-mp-block__head">
            <span className="truncate">
              Очередь · {player.tracks.length}
              {totalQueueSec > 0 ? ` · ${formatTrackTime(totalQueueSec)}` : ''}
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {player.tracks.length > 6 && (
                <input
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value)}
                  placeholder="Фильтр"
                  className="vng-mp-filter"
                  aria-label="Фильтр очереди"
                />
              )}
              <button
                type="button"
                className="vng-mp-text-btn"
                onClick={player.clearQueue}
                disabled={player.tracks.length === 0}
                title="Очистить очередь"
              >
                <Trash2 size={12} /> Очистить
              </button>
            </span>
          </header>
          {player.tracks.length === 0 ? (
            <p className="vng-mp-empty">
              Очередь пуста. Найдите музыку в поиске выше или вставьте ссылку на плейлист YouTube.
            </p>
          ) : (
            <ul className="vng-mp-list" onDragOver={(e) => dragUid && e.preventDefault()} onDrop={onDrop}>
              {filteredQueue.map((track: QueueTrack) => {
                const index = player.tracks.indexOf(track)
                const isCurrent = track.uid === player.currentUid
                const isPast = currentIndex >= 0 && index < currentIndex
                return (
                  <li
                    key={track.uid}
                    ref={isCurrent ? currentRowRef : undefined}
                    className={[
                      'vng-mp-row',
                      isCurrent ? 'vng-mp-row--current' : '',
                      isPast ? 'vng-mp-row--past' : '',
                      dragUid === track.uid ? 'vng-mp-row--dragging' : '',
                      dropIndex === index ? 'vng-mp-row--drop-before' : '',
                      dropIndex === index + 1 && index === player.tracks.length - 1 ? 'vng-mp-row--drop-after' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    draggable={!queueFilter}
                    onDragStart={(e) => onDragStart(e, track.uid)}
                    onDragOver={(e) => onDragOverRow(e, index)}
                    onDragEnd={() => {
                      setDragUid(null)
                      setDropIndex(null)
                    }}
                  >
                    {!queueFilter && (
                      <span className="vng-mp-row__grip" title="Перетащите, чтобы поменять порядок">
                        <GripVertical size={14} />
                      </span>
                    )}
                    <button
                      type="button"
                      className="vng-mp-row__main"
                      onClick={() => (isCurrent && hasTrack ? player.togglePlay() : player.playTrack(track))}
                      title={isCurrent ? 'Пауза / играть' : 'Играть'}
                    >
                      <span className="vng-mp-row__thumb-wrap">
                        <TrackThumb src={track.thumbnail_url} />
                        {isCurrent && hasTrack && <EqualizerBars playing={music.playing} />}
                      </span>
                      <span className="vng-mp-row__text">
                        <span className="vng-mp-row__title">{track.title}</span>
                        <span className="vng-mp-row__sub">
                          {track.author ?? ''}
                          {track.duration_sec ? ` · ${formatTrackTime(track.duration_sec)}` : ''}
                        </span>
                      </span>
                    </button>
                    <span className="vng-mp-row__actions">
                      <button
                        type="button"
                        className="vng-mp-icon-btn"
                        onClick={() => player.removeTrack(track.uid)}
                        title="Убрать из очереди"
                        aria-label="Убрать из очереди"
                      >
                        <X size={16} />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
