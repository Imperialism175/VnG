/** Извлекает ID видео из ссылки YouTube / YouTube Music */
export function parseYoutubeVideoId(url: string): string | null {
  const raw = url.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id || null
    }
    if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v')
      if (v) return v
      const m = u.pathname.match(/\/(?:embed|v|shorts|watch)\/([^/?]+)/)
      if (m?.[1]) return m[1]
    }
  } catch {
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw
  }
  return null
}

export function youtubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export function youtubeEmbedUrl(videoId: string, autoplay: boolean, origin?: string, startSec = 0) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    playsinline: '1',
  })
  if (origin) params.set('origin', origin)
  if (startSec >= 1) params.set('start', String(Math.floor(startSec)))
  return `https://www.youtube.com/embed/${videoId}?${params}`
}
