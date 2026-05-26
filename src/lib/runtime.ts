const SERVER_HOST_KEY = 'vng_server_host'
const SERVER_PORT = 3001

function normalizeBaseUrl(
  hostOrUrl: string,
  port: number,
  protocol: 'http:' | 'https:' | 'ws:' | 'wss:'
): string {
  const value = hostOrUrl.trim()
  if (!value) return `${protocol}//127.0.0.1:${port}`
  try {
    const parsed = new URL(value)
    parsed.pathname = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    const hasPort = /:\d+$/.test(value)
    const host = hasPort ? value : `${value}:${port}`
    return `${protocol}//${host}`
  }
}

export function getServerPort(): number {
  if (typeof window !== 'undefined' && window.vng?.serverPort) {
    return Number(window.vng.serverPort)
  }
  return SERVER_PORT
}

/** IP или hostname сервера хоста (для Radmin VPN / Hamachi / LAN) */
export function getServerHost(): string {
  if (typeof window !== 'undefined' && window.vng?.apiBase) {
    try {
      return new URL(window.vng.apiBase).hostname
    } catch {
      /* fall through */
    }
  }
  const saved = localStorage.getItem(SERVER_HOST_KEY)
  if (saved?.trim()) return saved.trim()
  if (typeof window !== 'undefined') return window.location.hostname
  return '127.0.0.1'
}

export function setServerHost(host: string) {
  localStorage.setItem(SERVER_HOST_KEY, host.trim())
}

export function getApiBase(): string {
  if (typeof window !== 'undefined' && window.vng?.apiBase) {
    return window.vng.apiBase
  }
  const env = import.meta.env.VITE_API_URL
  if (env) return env.replace(/\/$/, '')
  if (import.meta.env.DEV) return ''
  const host = getServerHost()
  const port = getServerPort()
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:'
  return normalizeBaseUrl(host, port, protocol)
}

export function getWsUrl(roomId: string, playerId: string): string {
  if (typeof window !== 'undefined' && window.vng?.wsBase) {
    const url = new URL(window.vng.wsBase)
    url.searchParams.set('roomId', roomId)
    url.searchParams.set('playerId', playerId)
    return url.toString()
  }
  const envWs = import.meta.env.VITE_WS_URL
  if (envWs) {
    const url = new URL(envWs)
    url.searchParams.set('roomId', roomId)
    url.searchParams.set('playerId', playerId)
    return url.toString()
  }
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(playerId)}`
  }
  const host = getServerHost()
  const port = getServerPort()
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = normalizeBaseUrl(host, port, protocol)
  return `${base}/ws?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(playerId)}`
}

export function getInviteBaseUrl(): string {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const port = window.location.port || '5173'
    return `${window.location.protocol}//${window.location.hostname}:${port}`
  }
  if (typeof window !== 'undefined') return window.location.origin
  const port = getServerPort()
  return `http://${getServerHost()}:${port}`
}

export function getMusicStreamUrl(roomId: string, streamToken: string): string {
  const base = getApiBase()
  const q = new URLSearchParams({ token: streamToken })
  return `${base}/api/rooms/${encodeURIComponent(roomId)}/music/stream?${q}`
}

export async function checkServerOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/rooms/ping`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchServerInfo(): Promise<{ port: number; addresses: string[] } | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/server/info`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}
