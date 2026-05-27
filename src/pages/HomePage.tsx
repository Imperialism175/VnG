import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, DoorOpen, Network, RefreshCw, Server, Users } from 'lucide-react'
import { apiCreateRoom, apiJoinRoom, apiListRooms, type RoomSummary } from '@/lib/api'
import { checkServerOnline, getServerHost, setServerHost } from '@/lib/runtime'
import { getOrCreatePlayerId, saveSession } from '@/lib/utils'
import { Button, Input } from '@/components/ui/Button'

type Mode = 'choose' | 'create' | 'join'
const ARCADE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')

function normalizeArcadeNick(input: string): string {
  const upper = String(input ?? '').toUpperCase()
  const filtered = [...upper].filter((ch) => ARCADE_ALPHABET.includes(ch)).slice(0, 3)
  while (filtered.length < 3) filtered.push('A')
  return filtered.join('')
}

function shiftArcadeChar(current: string, step: 1 | -1): string {
  const idx = ARCADE_ALPHABET.indexOf(current)
  const base = idx >= 0 ? idx : 0
  const next = (base + step + ARCADE_ALPHABET.length) % ARCADE_ALPHABET.length
  return ARCADE_ALPHABET[next]
}

export function HomePage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('choose')
  const [playerName, setPlayerName] = useState('AAA')
  const [roomName, setRoomName] = useState('')
  const [serverHost, setServerHostState] = useState(() => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h && h !== 'localhost' && h !== '127.0.0.1') return h
    }
    return getServerHost()
  })
  const [loading, setLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)

  useEffect(() => {
    checkServerOnline().then(setServerOnline)
  }, [serverHost])

  const loadRooms = useCallback(async () => {
    if (!serverOnline) return
    setRoomsLoading(true)
    try {
      const { rooms: list } = await apiListRooms()
      setRooms(list)
    } catch {
      setRooms([])
    } finally {
      setRoomsLoading(false)
    }
  }, [serverOnline])

  useEffect(() => {
    if (mode === 'join' && serverOnline) {
      loadRooms()
      const t = setInterval(loadRooms, 5000)
      return () => clearInterval(t)
    }
  }, [mode, serverOnline, loadRooms])

  function applyServerHost(host: string) {
    setServerHost(host)
    setServerHostState(host)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const nick = normalizeArcadeNick(playerName)
    if (!nick || !roomName.trim()) return
    setLoading(true)
    setError(null)
    try {
      applyServerHost(serverHost)
      const playerId = getOrCreatePlayerId()
      const { room } = await apiCreateRoom(roomName.trim(), playerId, nick)
      saveSession({ playerId, name: nick, roomId: room.id, isGm: true })
      navigate(`/room/${room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать комнату')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinRoom(roomId: string) {
    const nick = normalizeArcadeNick(playerName)
    if (!nick) {
      setError('Введите имя перед входом')
      return
    }
    setJoiningId(roomId)
    setError(null)
    try {
      applyServerHost(serverHost)
      const playerId = getOrCreatePlayerId()
      const { room, player } = await apiJoinRoom(roomId, playerId, nick)
      saveSession({ playerId, name: nick, roomId: room.id, isGm: player.is_gm })
      navigate(`/room/${room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти в комнату')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="vng-page vng-home-page min-h-full flex flex-col">
      <header className="vng-dos-hud border-b border-vng-border">
        <div className="vng-home-hero max-w-lg mx-auto px-4 py-6 text-center uppercase">
          <h1 className="vng-home-hero__title text-2xl font-bold mb-2 tracking-widest">VNG TABLETOP RPG</h1>
          <p className="vng-home-hero__subtitle text-vng-muted text-xs max-w-sm mx-auto">
            LAN / VPN — MS-DOS SESSION
          </p>
          <p
            className={`vng-home-hero__status mt-2 text-xs font-bold ${
              serverOnline ? 'vng-dos-hud__status--ok' : 'vng-dos-hud__status--err'
            }`}
          >
            {serverOnline === null ? 'PING…' : serverOnline ? 'SERVER: ONLINE' : 'SERVER: OFFLINE'}
          </p>
        </div>
      </header>

      <main className="vng-home-main flex-1 max-w-lg w-full mx-auto px-4 py-6 flex flex-col gap-4">
        <div className="vng-card vng-home-card p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-vng-muted flex items-center gap-1">
              <Server size={12} /> Адрес сервера хоста
            </span>
            <div className="vng-tui-field__row mt-1">
              <input
                value={serverHost}
                onChange={(e) => setServerHostState(e.target.value)}
                onBlur={() => applyServerHost(serverHost)}
                placeholder="127.0.0.1"
                className="vng-tui-input vng-home-input w-full text-sm uppercase"
              />
            </div>
          </label>
          <p className="vng-home-help text-xs sm:text-sm text-vng-muted mt-2 flex items-start gap-1">
            <Network size={12} className="shrink-0 mt-0.5" />
            Хост запускает <code className="text-vng-amber">start-vng.bat</code>. Игроки — тот же VPN/LAN IP.
          </p>
        </div>

        {mode === 'choose' && (
          <div className="flex flex-col gap-3">
            <Button size="lg" className="vng-home-action w-full justify-start" onClick={() => setMode('create')}>
              <Crown size={20} />
              <div className="text-left">
                <div className="font-bold">Создать комнату</div>
                <div className="text-xs opacity-80 font-normal">Я Гейм-мастер (хост)</div>
              </div>
            </Button>
            <Button size="lg" variant="secondary" className="vng-home-action w-full justify-start" onClick={() => setMode('join')}>
              <DoorOpen size={20} />
              <div className="text-left">
                <div className="font-bold">Войти в комнату</div>
                <div className="text-xs opacity-80 font-normal">Выбрать из списка сессий</div>
              </div>
            </Button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={handleCreate} className="vng-home-form flex flex-col gap-4">
            <h2 className="vng-home-section-title text-lg font-bold flex items-center gap-2">
              <Crown size={18} className="text-vng-amber" /> Новая сессия
            </h2>
            <ArcadeNickPicker value={playerName} onChange={setPlayerName} />
            <Input label="Название сессии" value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
            {error && <p className="text-sm text-vng-danger">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setMode('choose')}>Назад</Button>
              <Button type="submit" disabled={loading || !serverOnline} className="flex-1">
                {loading ? 'Создание…' : 'Создать комнату'}
              </Button>
            </div>
          </form>
        )}

        {mode === 'join' && (
          <div className="vng-home-form flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="vng-home-section-title text-lg font-bold flex items-center gap-2">
                <DoorOpen size={18} className="text-vng-blue" /> Доступные комнаты
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={loadRooms}
                disabled={roomsLoading || !serverOnline}
                title="Обновить список"
              >
                <RefreshCw size={16} className={roomsLoading ? 'animate-spin' : ''} />
              </Button>
            </div>

            <ArcadeNickPicker value={playerName} onChange={setPlayerName} />

            {error && <p className="text-sm text-vng-danger">{error}</p>}

            <div className="flex flex-col gap-2 min-h-[120px]">
              {roomsLoading && rooms.length === 0 && (
                <p className="text-sm text-vng-muted text-center py-8">Загрузка…</p>
              )}
              {!roomsLoading && rooms.length === 0 && (
                <div className="vng-card vng-home-card p-6 text-center">
                  <p className="text-sm text-vng-muted">Нет открытых комнат</p>
                  <p className="text-xs text-vng-muted/70 mt-1">Попросите ГМ создать сессию или обновите список</p>
                </div>
              )}
              {rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  disabled={!serverOnline || joiningId !== null}
                  onClick={() => handleJoinRoom(room.id)}
                  className="vng-card vng-home-room-card w-full text-left p-4 hover:border-vng-blue/35 hover:vng-glow-blue transition-all disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{room.name}</p>
                      <p className="text-xs text-vng-muted mt-0.5">ГМ: {room.gm_name}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-vng-muted shrink-0">
                      <Users size={14} />
                      {room.player_count}
                    </div>
                  </div>
                  <p className="text-xs text-vng-amber mt-2 font-medium uppercase tracking-wide">
                    {joiningId === room.id ? 'Вход…' : 'Войти'}
                  </p>
                </button>
              ))}
            </div>

            <Button type="button" variant="ghost" onClick={() => setMode('choose')}>
              Назад
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

function ArcadeNickPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const chars = normalizeArcadeNick(value).split('')
  return (
    <div className="vng-card vng-home-card p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-vng-muted mb-2">Ник игрока (3 символа)</p>
      <div className="grid grid-cols-3 gap-2">
        {chars.map((ch, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const next = [...chars]
                next[idx] = shiftArcadeChar(next[idx], 1)
                onChange(next.join(''))
              }}
            >
              ▲
            </Button>
            <div className="w-full text-center py-2 border border-vng-border bg-vng-bg font-bold text-lg vng-mono">
              {ch}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const next = [...chars]
                next[idx] = shiftArcadeChar(next[idx], -1)
                onChange(next.join(''))
              }}
            >
              ▼
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-vng-muted mt-2 uppercase">Итоговый ник: <span className="text-vng-amber">{chars.join('')}</span></p>
    </div>
  )
}
