import { getApiBase } from '@/lib/runtime'

export interface RoomSummary {
  id: string
  name: string
  player_count: number
  gm_name: string
  created_at: number
}

export interface RoomInfo {
  id: string
  name: string
  gm_id: string
}

export interface PlaylistEntry {
  id: string
  title: string
  url: string
  thumbnail_url?: string
}

export interface PlaylistEntriesResponse {
  entries: PlaylistEntry[]
  next_cursor: string | null
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Ошибка сервера (${res.status})`)
  }
  return data as T
}

export async function apiListRooms() {
  return apiFetch<{ rooms: RoomSummary[] }>('/api/rooms')
}
 export async function apiLogin(email: string, password: string) {
   return apiFetch<{ ok: boolean; account: { id: string; email: string; displayName: string } }>('/api/auth/login', {
     method: 'POST',
     body: JSON.stringify({ email, password }),
   })
 }
 
 export async function apiRegister(email: string, password: string, displayName: string) {
   return apiFetch<{ ok: boolean; account: { id: string; email: string; displayName: string } }>('/api/auth/register', {
     method: 'POST',
     body: JSON.stringify({ email, password, displayName }),
   })
 }
 
 export async function apiGetMe(id: string) {
   return apiFetch<{ ok: boolean; account: { id: string; email: string; displayName: string } }>(`/api/auth/me?id=${encodeURIComponent(id)}`)
 }

export async function apiCreateRoom(name: string, playerId: string, playerName: string, inviteOnly = false) {
  return apiFetch<{
    room: RoomInfo
    player: { is_gm: boolean }
  }>('/api/rooms', { method: 'POST', body: JSON.stringify({ name, playerId, playerName, inviteOnly }) })
}

export async function apiJoinRoom(roomId: string, playerId: string, playerName: string) {
  return apiFetch<{
    room: RoomInfo
    player: { is_gm: boolean }
  }>('/api/rooms/join', { method: 'POST', body: JSON.stringify({ roomId, playerId, playerName }) })
}

export async function apiGetRoomById(roomId: string) {
  return apiFetch<{
    room: RoomInfo
  }>(`/api/rooms/${encodeURIComponent(roomId)}`)
}

export async function apiGetPlaylistEntries(url: string, cursor?: string) {
  const qs = new URLSearchParams({ url })
  if (cursor) qs.set('cursor', cursor)
  return apiFetch<PlaylistEntriesResponse>(`/api/music/playlist?${qs.toString()}`)
}
