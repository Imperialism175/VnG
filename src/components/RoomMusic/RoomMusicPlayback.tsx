import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ListMusic, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { RoomMusic } from '@/types'
import { MusicVolumeControl } from '@/components/RoomMusic/MusicVolumeControl'
import { formatTrackTime, useMusicPlayer, useMusicProgress } from '@/components/RoomMusic/MusicPlayerContext'
import { getMusicStreamUrl } from '@/lib/runtime'
import { musicPositionNow } from '@/lib/roomExtras'
import { youtubeEmbedUrl } from '@/lib/youtube'

interface RoomMusicPlaybackProps {
  roomId: string
  music: RoomMusic
}

const YT_ENDED = 0
const YT_PLAYING = 1

/** Ожидаемая позиция с учётом «повтора трека» */
function expectedPosition(music: RoomMusic, duration: number | null) {
  const pos = musicPositionNow(music)
  if (music.repeat_one && duration && duration > 0) return pos % duration
  return pos
}

/**
 * Проигрывание музыки комнаты у каждого участника + мини-плеер сверху.
 * YouTube играет во встроенном плеере, прямые файлы — через сервер хоста.
 * Громкость у каждого своя.
 */
export function RoomMusicPlayback({ roomId, music }: RoomMusicPlaybackProps) {
  const player = useMusicPlayer()
  const { reportEnded } = player
  const { progress, setProgress } = useMusicProgress()
  const audioRef = useRef<HTMLAudioElement>(null)
  const youtubeFrameRef = useRef<HTMLIFrameElement>(null)
  const [needsUnlock, setNeedsUnlock] = useState(false)
  const [streamError, setStreamError] = useState(false)
  const [ytReady, setYtReady] = useState(false)
  const musicRef = useRef(music)
  const durationRef = useRef<number | null>(null)
  const lastCorrectionRef = useRef(0)
  musicRef.current = music

  const active = Boolean(music.url && (music.playing || music.paused))
  const endedKey = `${music.url ?? ''}#${music.sync_seq}`
  const endedKeyRef = useRef(endedKey)
  endedKeyRef.current = endedKey

  const streamUrl = useMemo(() => {
    if (!active || !music.stream_token || !music.use_host_proxy) return null
    return getMusicStreamUrl(roomId, music.stream_token)
  }, [roomId, active, music.stream_token, music.use_host_proxy])

  const youtubeVideoId =
    active && !music.use_host_proxy && music.source === 'youtube' && music.video_id ? music.video_id : null
  // src собирается один раз на трек: дальше управляем плеером командами, без перезагрузки
  const youtubeEmbedSrc = useMemo(() => {
    if (!youtubeVideoId) return null
    const origin = typeof window !== 'undefined' ? window.location.origin : undefined
    const m = musicRef.current
    return youtubeEmbedUrl(youtubeVideoId, m.playing, origin, musicPositionNow(m))
  }, [youtubeVideoId])

  const ytCommand = useCallback((func: string, args: unknown[] = []) => {
    const target = youtubeFrameRef.current?.contentWindow
    if (!target) return
    target.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  }, [])

  const applyYoutubeVolume = useCallback(
    (vol: number) => {
      ytCommand('setVolume', [Math.max(0, Math.min(100, Math.round(vol)))])
      ytCommand(vol <= 0 ? 'mute' : 'unMute')
    },
    [ytCommand]
  )

  useEffect(() => {
    setYtReady(false)
    durationRef.current = null
    if (!youtubeEmbedSrc) return
    setProgress({ current: musicPositionNow(musicRef.current), duration: null })
  }, [youtubeEmbedSrc, setProgress])

  // Подписка на события встроенного плеера YouTube (без iframe_api скрипта)
  useEffect(() => {
    if (!youtubeEmbedSrc) return
    let attempts = 0
    const hello = window.setInterval(() => {
      const target = youtubeFrameRef.current?.contentWindow
      attempts += 1
      if (target) target.postMessage(JSON.stringify({ event: 'listening', id: 'vng-music', channel: 'widget' }), '*')
      if (attempts > 15) window.clearInterval(hello)
    }, 700)

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== youtubeFrameRef.current?.contentWindow) return
      let data: { event?: string; info?: unknown }
      try {
        data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
      } catch {
        return
      }
      if (!data || typeof data !== 'object') return
      window.clearInterval(hello)
      setYtReady(true)
      const m = musicRef.current
      let state: number | null = null
      if (data.event === 'onStateChange' && typeof data.info === 'number') state = data.info
      if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info && typeof data.info === 'object') {
        const info = data.info as { currentTime?: number; duration?: number; playerState?: number }
        if (typeof info.duration === 'number' && info.duration > 0) durationRef.current = info.duration
        if (typeof info.currentTime === 'number') {
          setProgress({ current: info.currentTime, duration: durationRef.current })
          // Догоняем комнату, если плеер отстал или убежал (буферизация, поздний вход)
          const expected = expectedPosition(m, durationRef.current)
          const now = Date.now()
          if (
            m.playing &&
            info.playerState === YT_PLAYING &&
            Math.abs(info.currentTime - expected) > 4 &&
            now - lastCorrectionRef.current > 8000
          ) {
            lastCorrectionRef.current = now
            ytCommand('seekTo', [expected, true])
          }
        }
        if (typeof info.playerState === 'number') state = info.playerState
      }
      if (state === YT_ENDED) {
        if (m.repeat_one) {
          ytCommand('seekTo', [0, true])
          ytCommand('playVideo')
        } else {
          reportEnded(endedKeyRef.current)
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.clearInterval(hello)
      window.removeEventListener('message', onMessage)
    }
  }, [youtubeEmbedSrc, setProgress, ytCommand, reportEnded])

  // Пауза / продолжение / перемотка от ГМа
  useEffect(() => {
    if (!ytReady || !youtubeEmbedSrc) return
    const m = musicRef.current
    ytCommand('seekTo', [expectedPosition(m, durationRef.current), true])
    ytCommand(m.playing ? 'playVideo' : 'pauseVideo')
  }, [ytReady, youtubeEmbedSrc, music.sync_seq, music.playing, ytCommand])

  useEffect(() => {
    if (ytReady) applyYoutubeVolume(player.volume)
  }, [ytReady, player.volume, applyYoutubeVolume])

  // Плеер без YouTube: показываем прогресс по часам комнаты
  useEffect(() => {
    if (youtubeEmbedSrc || streamUrl) return
    if (!music.url) {
      setProgress({ current: 0, duration: null })
      return
    }
    const tick = () => setProgress({ current: musicPositionNow(musicRef.current), duration: null })
    tick()
    if (!music.playing) return
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [youtubeEmbedSrc, streamUrl, music.url, music.playing, music.sync_seq, setProgress])

  // ---- Прямой аудиофайл через сервер хоста ----
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = player.volume / 100
  }, [player.volume])

  const tryPlay = useCallback(async () => {
    const el = audioRef.current
    if (!el || !streamUrl) return
    try {
      await el.play()
      setNeedsUnlock(false)
      setStreamError(false)
    } catch {
      setNeedsUnlock(true)
    }
  }, [streamUrl])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    if (!streamUrl) {
      el.pause()
      el.removeAttribute('src')
      el.load()
      return
    }

    setStreamError(false)
    el.src = streamUrl
    el.load()

    const onError = () => setStreamError(true)
    const onTime = () =>
      setProgress({ current: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : null })
    const onEnded = () => {
      if (!musicRef.current.repeat_one) reportEnded(endedKeyRef.current)
    }
    const onCanPlay = () => {
      const m = musicRef.current
      const pos = musicPositionNow(m)
      if (pos > 1 && el.seekable.length && el.seekable.end(el.seekable.length - 1) > pos) el.currentTime = pos
      if (m.playing) void tryPlay()
    }
    el.addEventListener('error', onError)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnded)
    el.addEventListener('canplay', onCanPlay, { once: true })
    return () => {
      el.removeEventListener('error', onError)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('canplay', onCanPlay)
    }
  }, [streamUrl, tryPlay, setProgress, reportEnded])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !streamUrl) return
    const m = musicRef.current
    const pos = musicPositionNow(m)
    if (el.seekable.length && el.seekable.end(el.seekable.length - 1) > pos && Math.abs(el.currentTime - pos) > 2) {
      el.currentTime = pos
    }
    if (m.playing) void tryPlay()
    else el.pause()
  }, [music.playing, music.sync_seq, streamUrl, tryPlay])

  const displayTitle = music.title?.trim() || 'Музыка'
  const proxyHint = music.proxy_error
  const isHostStreamMode = Boolean(streamUrl)
  const duration = progress.duration ?? player.currentTrack?.duration_sec ?? null
  const pct = duration ? Math.max(0, Math.min(100, (progress.current / duration) * 100)) : 0
  const cover = music.thumbnail_url

  return (
    <>
      <audio ref={audioRef} loop={music.repeat_one} preload="auto" className="hidden" aria-hidden />
      {youtubeEmbedSrc && (
        <iframe
          key={youtubeEmbedSrc}
          ref={youtubeFrameRef}
          src={youtubeEmbedSrc}
          title="Room music player"
          allow="autoplay; encrypted-media"
          className="absolute w-px h-px opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden
          onLoad={() => applyYoutubeVolume(player.volume)}
        />
      )}

      {proxyHint && (
        <div className="shrink-0 px-2 py-1 border-b border-vng-border text-xs text-center max-w-[1600px] mx-auto uppercase">
          {proxyHint}
        </div>
      )}

      {active && (
        <div className="vng-retro-music-bar vng-mp-mini shrink-0 z-30">
          <div className="vng-mp-mini__progress" aria-hidden>
            <div className="vng-mp-mini__progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="max-w-[1600px] mx-auto px-2 py-1 flex items-center gap-2 text-xs">
            {cover ? (
              <img src={cover} alt="" className="vng-mp-mini__cover" loading="lazy" />
            ) : (
              <span className="vng-mp-mini__cover vng-mp-mini__cover--empty" aria-hidden>♪</span>
            )}
            <div className="min-w-[4.5rem] flex-1">
              <p className="truncate text-vng-text font-semibold">
                {music.paused && <span className="text-vng-muted">[ПАУЗА] </span>}
                {displayTitle}
              </p>
              <p className="truncate text-[11px] text-vng-muted">
                {music.author ? `${music.author} · ` : ''}
                <span className="vng-mono">
                  {formatTrackTime(progress.current)} / {formatTrackTime(duration)}
                </span>
              </p>
            </div>
            {player.isGm && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" className="vng-mp-icon-btn" onClick={player.prev} title="Назад" aria-label="Назад">
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  className="vng-mp-icon-btn vng-mp-icon-btn--main"
                  onClick={player.togglePlay}
                  title={music.playing ? 'Пауза' : 'Играть'}
                  aria-label={music.playing ? 'Пауза' : 'Играть'}
                >
                  {music.playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button type="button" className="vng-mp-icon-btn" onClick={player.next} title="Дальше" aria-label="Дальше">
                  <SkipForward size={16} />
                </button>
              </div>
            )}
            <MusicVolumeControl volume={player.volume} onChange={player.setVolume} compact />
            {isHostStreamMode && needsUnlock && !streamError && (
              <button type="button" onClick={() => tryPlay()} className="vng-tui-btn shrink-0 text-xs">
                SOUND ON
              </button>
            )}
            {isHostStreamMode && streamError && music.playing && (
              <span className="text-xs text-vng-danger shrink-0" title="Ошибка потока с хоста">
                Ошибка потока
              </span>
            )}
            {player.isGm && (
              <button
                type="button"
                className="vng-mp-icon-btn shrink-0"
                onClick={player.openPlayer}
                title="Открыть плеер"
                aria-label="Открыть плеер"
              >
                <ListMusic size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
