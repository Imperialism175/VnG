/** Минимальные типы YouTube IFrame API */

export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  stopVideo(): void
  loadVideoById(videoId: string): void
  destroy(): void
  setVolume(volume: number): void
  getVolume(): number
  getPlayerState(): number
}

interface YTPlayerConstructor {
  new (
    element: HTMLElement | string,
    options: {
      height?: string | number
      width?: string | number
      videoId?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: { target: YTPlayer }) => void
        onStateChange?: (e: { data: number; target: YTPlayer }) => void
        onError?: () => void
      }
    }
  ): YTPlayer
}

interface YTNamespace {
  Player: YTPlayerConstructor
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace> | null = null

export function loadYoutubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const done = () => {
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube API failed to load'))
    }

    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      done()
    }

    if (!document.querySelector('script[data-vng-yt-api]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      tag.async = true
      tag.dataset.vngYtApi = '1'
      tag.onerror = () => reject(new Error('YouTube API script error'))
      document.head.appendChild(tag)
    } else {
      const poll = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(poll)
          done()
        }
      }, 100)
      setTimeout(() => {
        clearInterval(poll)
        if (!window.YT?.Player) reject(new Error('YouTube API timeout'))
      }, 15000)
    }
  })

  return apiPromise
}

export const YT_PLAYING = 1
export const YT_PAUSED = 2
