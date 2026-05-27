import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { generateId, generateRoomCode } from '@/lib/utils'
import type { Character, Encounter, Player, RollEvent, Room } from '@/types'

// ─── Mock storage (local dev without Supabase) ───────────────────────────────

interface MockStore {
  rooms: Record<string, Room>
  players: Record<string, Player>
  characters: Record<string, Character>
  rollEvents: Record<string, RollEvent>
  encounters: Record<string, Encounter>
}

const MOCK_KEY = 'vng_mock_store'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vng_sync') : null

function loadMockStore(): MockStore {
  const raw = localStorage.getItem(MOCK_KEY)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      /* fall through */
    }
  }
  return { rooms: {}, players: {}, characters: {}, rollEvents: {}, encounters: {} }
}

function saveMockStore(store: MockStore) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(store))
  channel?.postMessage({ type: 'sync' })
}

type MockListener = () => void
const mockListeners = new Set<MockListener>()

if (channel) {
  channel.onmessage = () => {
    mockListeners.forEach((fn) => fn())
  }
}

function subscribeMock(listener: MockListener): () => void {
  mockListeners.add(listener)
  return () => mockListeners.delete(listener)
}

function notifyMock() {
  mockListeners.forEach((fn) => fn())
}

// ─── Room API ────────────────────────────────────────────────────────────────

export async function createRoom(name: string, gmId: string, gmName: string): Promise<Room> {
  if (isSupabaseConfigured && supabase) {
    let code = generateRoomCode()
    let attempts = 0
    while (attempts < 10) {
      const { data: existing } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle()
      if (!existing) break
      code = generateRoomCode()
      attempts++
    }

    const room: Room = { id: generateId(), code, name, gm_id: gmId }
    const { error: roomErr } = await supabase.from('rooms').insert(room)
    if (roomErr) throw roomErr

    const player: Player = { id: gmId, room_id: room.id, name: gmName, is_gm: true }
    const { error: playerErr } = await supabase.from('players').insert(player)
    if (playerErr) throw playerErr

    return room
  }

  const store = loadMockStore()
  const room: Room = {
    id: generateId(),
    code: generateRoomCode(),
    name,
    gm_id: gmId,
    created_at: new Date().toISOString(),
  }
  store.rooms[room.id] = room
  store.players[gmId] = { id: gmId, room_id: room.id, name: gmName, is_gm: true, joined_at: new Date().toISOString() }
  saveMockStore(store)
  return room
}

export async function joinRoom(code: string, playerId: string, playerName: string): Promise<{ room: Room; player: Player }> {
  const normalizedCode = code.trim().toUpperCase()

  if (isSupabaseConfigured && supabase) {
    const { data: room, error } = await supabase.from('rooms').select('*').eq('code', normalizedCode).maybeSingle()
    if (error) throw error
    if (!room) throw new Error('Комната не найдена')

    const { data: existing } = await supabase.from('players').select('*').eq('id', playerId).maybeSingle()
    let player: Player

    if (existing && existing.room_id === room.id) {
      player = existing
    } else {
      player = { id: playerId, room_id: room.id, name: playerName, is_gm: false }
      const { error: pErr } = await supabase.from('players').upsert(player)
      if (pErr) throw pErr
    }

    return { room, player }
  }

  const store = loadMockStore()
  const room = Object.values(store.rooms).find((r) => r.code === normalizedCode)
  if (!room) throw new Error('Комната не найдена')

  let player = store.players[playerId]
  if (!player || player.room_id !== room.id) {
    player = {
      id: playerId,
      room_id: room.id,
      name: playerName,
      is_gm: playerId === room.gm_id,
      joined_at: new Date().toISOString(),
    }
    store.players[playerId] = player
    saveMockStore(store)
  }

  return { room, player }
}

export async function getRoomById(roomId: string): Promise<Room | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle()
    return data
  }
  return loadMockStore().rooms[roomId] ?? null
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from('rooms').select('*').eq('code', code.toUpperCase()).maybeSingle()
    return data
  }
  const store = loadMockStore()
  return Object.values(store.rooms).find((r) => r.code === code.toUpperCase()) ?? null
}

// ─── Players ─────────────────────────────────────────────────────────────────

export async function getPlayers(roomId: string): Promise<Player[]> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from('players').select('*').eq('room_id', roomId).order('joined_at')
    return data ?? []
  }
  const store = loadMockStore()
  return Object.values(store.players).filter((p) => p.room_id === roomId)
}

// ─── Characters ──────────────────────────────────────────────────────────────

export async function getCharacters(roomId: string): Promise<Character[]> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.from('characters').select('*').eq('room_id', roomId)
    return (data ?? []).map(normalizeCharacter)
  }
  const store = loadMockStore()
  return Object.values(store.characters).filter((c) => c.room_id === roomId)
}

export async function getCharacterByPlayer(roomId: string, playerId: string): Promise<Character | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from('characters')
      .select('*')
      .eq('room_id', roomId)
      .eq('player_id', playerId)
      .maybeSingle()
    return data ? normalizeCharacter(data) : null
  }
  const store = loadMockStore()
  return (
    Object.values(store.characters).find((c) => c.room_id === roomId && c.player_id === playerId) ?? null
  )
}

export async function upsertCharacter(character: Character): Promise<Character> {
  const normalized = normalizeCharacter(character)

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('characters')
      .upsert({ ...normalized, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return normalizeCharacter(data)
  }

  const store = loadMockStore()
  store.characters[normalized.id] = { ...normalized, updated_at: new Date().toISOString() }
  saveMockStore(store)
  return normalized
}

function normalizeCharacter(raw: Character): Character {
  return {
    ...raw,
    stats: Array.isArray(raw.stats) ? raw.stats : [],
    counters: Array.isArray(raw.counters) ? raw.counters : [],
  }
}

export function createEmptyCharacter(roomId: string, playerId: string, playerName: string): Character {
  return {
    id: generateId(),
    room_id: roomId,
    player_id: playerId,
    player_name: playerName,
    name: '',
    class_status: '',
    description: '',
    text_fields: [],
    special_field_locks: [],
    stat_points_locked: false,
    stats: [{ id: generateId(), name: 'ХП', value: '0' }],
    counters: [
      { id: generateId(), name: 'Здоровье', current: 0, max: 0 },
      { id: generateId(), name: 'Очки вдохновения', current: 0, max: 99 },
    ],
  }
}

// ─── Roll events ─────────────────────────────────────────────────────────────

export async function getRollEvents(roomId: string, limit = 50): Promise<RollEvent[]> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from('roll_events')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []).reverse()
  }
  const store = loadMockStore()
  return Object.values(store.rollEvents)
    .filter((e) => e.room_id === roomId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit)
}

export async function addRollEvent(event: Omit<RollEvent, 'id' | 'created_at'>): Promise<RollEvent> {
  const full: RollEvent = {
    ...event,
    id: generateId(),
    created_at: new Date().toISOString(),
  }

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('roll_events').insert(full).select().single()
    if (error) throw error
    return data
  }

  const store = loadMockStore()
  store.rollEvents[full.id] = full
  saveMockStore(store)
  return full
}

// ─── Encounters ──────────────────────────────────────────────────────────────

export async function getActiveEncounter(roomId: string): Promise<Encounter | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from('encounters')
      .select('*')
      .eq('room_id', roomId)
      .eq('is_active', true)
      .maybeSingle()
    return data
  }
  const store = loadMockStore()
  return (
    Object.values(store.encounters).find((e) => e.room_id === roomId && e.is_active) ?? null
  )
}

export async function setActiveEncounter(encounter: Encounter): Promise<Encounter> {
  if (isSupabaseConfigured && supabase) {
    await supabase.from('encounters').update({ is_active: false }).eq('room_id', encounter.room_id)
    const { data, error } = await supabase.from('encounters').upsert(encounter).select().single()
    if (error) throw error
    return data
  }

  const store = loadMockStore()
  Object.values(store.encounters)
    .filter((e) => e.room_id === encounter.room_id)
    .forEach((e) => {
      store.encounters[e.id].is_active = false
    })
  store.encounters[encounter.id] = encounter
  saveMockStore(store)
  return encounter
}

export async function clearActiveEncounter(roomId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.from('encounters').update({ is_active: false }).eq('room_id', roomId)
    return
  }
  const store = loadMockStore()
  Object.values(store.encounters)
    .filter((e) => e.room_id === roomId)
    .forEach((e) => {
      store.encounters[e.id].is_active = false
    })
  saveMockStore(store)
}

// ─── Realtime subscriptions ──────────────────────────────────────────────────

export function subscribeToRoom(
  roomId: string,
  onUpdate: () => void
): () => void {
  if (isSupabaseConfigured && supabase) {
    const client = supabase
    const channel = client
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, onUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `room_id=eq.${roomId}` }, onUpdate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'roll_events', filter: `room_id=eq.${roomId}` }, onUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encounters', filter: `room_id=eq.${roomId}` }, onUpdate)
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }

  const unsub = subscribeMock(onUpdate)
  const interval = setInterval(onUpdate, 2000)
  return () => {
    unsub()
    clearInterval(interval)
  }
}

export { isSupabaseConfigured, notifyMock }
