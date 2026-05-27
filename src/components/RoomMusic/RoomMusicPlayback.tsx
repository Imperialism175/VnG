import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RoomMusic } from '@/types'
import { MusicVolumeControl } from '@/components/RoomMusic/MusicVolumeControl'
import { getMusicStreamUrl } from '@/lib/runtime'
import { youtubeEmbedUrl } from '@/lib/youtube'

const VOLUME_STORAGE_KEY = 'vng_local_music_volume'

interface RoomMusicPlaybackProps {
  roomId: string
  music: RoomMusic
}

function clampVolume(v: number) {
  return Math.max(0, Math.min(100, Math.round(v)))
}

function readStoredVolume(): number {
  try {
    const n = Number(localStorage.getItem(VOLUME_STORAGE_KEY))
    if (Number.isFinite(n)) return clampVolume(n)
  } catch {
    /* ignore */
  }
  return 70
}

/**
 * Музыка через прокси сервера хоста. Громкость — только локально у каждого игрока.
 */
export function RoomMusicPlayback({ roomId, music }: RoomMusicPlaybackProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [needsUnlock, setNeedsUnlock] = useState(false)
  const [streamError, setStreamError] = useState(false)
  const [localVolume, setLocalVolume] = useState(readStoredVolume)

  const streamUrl = useMemo(() => {
    if (!music.playing || !music.stream_token || !music.use_host_proxy) return null
    return getMusicStreamUrl(roomId, music.stream_token)
  }, [roomId, music.playing, music.stream_token, music.use_host_proxy])
  const youtubeEmbedSrc = useMemo(() => {
    if (!music.playing || music.use_host_proxy || music.source !== 'youtube' || !music.video_id) return null
    return youtubeEmbedUrl(music.video_id, true)
  }, [music.playing, music.use_host_proxy, music.source, music.video_id])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = localVolume / 100
  }, [localVolume])

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
    el.addEventListener('error', onError)

    if (music.playing) {
      const onCanPlay = () => {
        tryPlay()
      }
      el.addEventListener('canplay', onCanPlay, { once: true })
      return () => {
        el.removeEventListener('canplay', onCanPlay)
        el.removeEventListener('error', onError)
      }
    }

    el.pause()
    return () => el.removeEventListener('error', onError)
  }, [streamUrl, music.playing, tryPlay])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !streamUrl) return
    if (music.playing) tryPlay()
    else el.pause()
  }, [music.playing, streamUrl, tryPlay])

  function handleVolumeChange(vol: number) {
    const v = clampVolume(vol)
    setLocalVolume(v)
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(v))
    } catch {
      /* ignore */
    }
    if (audioRef.current) audioRef.current.volume = v / 100
  }

  const showBar = Boolean(music.playing && music.url)
  const displayTitle = music.title?.trim() || 'Музыка'
  const proxyHint = music.proxy_error
  const isHostStreamMode = Boolean(streamUrl)
  const sourceLabel = isHostStreamMode ? '· с сервера хоста' : '· YouTube direct'

  return (
    <>
      <audio ref={audioRef} loop preload="auto" className="hidden" aria-hidden />
      {youtubeEmbedSrc && (
        <iframe
          key={youtubeEmbedSrc}
          src={youtubeEmbedSrc}
          title="Room music player"
          allow="autoplay; encrypted-media"
          className="absolute w-px h-px opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden
        />
      )}

      {proxyHint && (
        <div className="shrink-0 px-2 py-1 border-b border-vng-border text-xs text-center max-w-[1600px] mx-auto uppercase">
          {proxyHint}
        </div>
      )}

      {showBar && (
        <div className="vng-retro-music-bar shrink-0 z-30">
          <div className="max-w-[1600px] mx-auto px-2 py-1 flex items-center gap-2 flex-wrap uppercase text-xs">
            <span className="text-vng-muted shrink-0">AUDIO:</span>
            <p className="min-w-0 flex-1 truncate">
              <span className="text-vng-text">{displayTitle}</span>
              <span className="text-xs text-vng-muted ml-1.5 hidden sm:inline">{sourceLabel}</span>
            </p>
            {isHostStreamMode && <MusicVolumeControl volume={localVolume} onChange={handleVolumeChange} compact />}
            {isHostStreamMode && needsUnlock && !streamError && (
              <button type="button" onClick={() => tryPlay()} className="vng-tui-btn shrink-0 text-xs">
                SOUND ON
              </button>
            )}
            {!isHostStreamMode && music.url && (
              <a
                href={music.url}
                target="_blank"
                rel="noreferrer"
                className="vng-tui-btn shrink-0 text-xs"
              >
                OPEN
              </a>
            )}
            {isHostStreamMode && streamError && (
              <span className="text-xs text-vng-danger shrink-0">Ошибка потока с хоста</span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
