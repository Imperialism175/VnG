const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

export function generateId(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID()
  }
  // HTTP по LAN/VPN — не secure context, randomUUID недоступен
  const bytes = new Uint8Array(16)
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getOrCreatePlayerId(): string {
  const key = 'vng_player_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = generateId()
    localStorage.setItem(key, id)
  }
  return id
}

export function saveSession(session: { playerId: string; name: string; roomId: string; isGm: boolean }) {
  localStorage.setItem('vng_session', JSON.stringify(session))
}

export function loadSession(): { playerId: string; name: string; roomId: string; isGm: boolean } | null {
  const raw = localStorage.getItem('vng_session')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem('vng_session')
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}
