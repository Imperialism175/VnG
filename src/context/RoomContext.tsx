import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Character,
  ChatMessage,
  Encounter,
  Player,
  RollEvent,
  Room,
  HallOfFame,
  RoomMusic,
  RoomPoll,
  RoomPresence,
  RoomStageFx,
  RoomTheme,
  ScreenMessage,
} from '@/types'
import { DICE_ROLL_COOLDOWN_MS } from '@/lib/diceCooldown'
import type { DiceSides } from '@/types'
import { syncLegacyHp } from '@/lib/encounterUtils'
import { ensureSpecialTextFields } from '@/lib/characterSheets'
import { mergeTheme } from '@/lib/theme'
import { parseRoomExtras, type RoomExtrasState } from '@/lib/roomExtras'
import { applyPublicState, normalizeCharacter, normalizeEncounter } from '@/lib/normalize'
import { RoomSocket } from '@/lib/wsClient'
import { generateId, saveSession } from '@/lib/utils'

interface Session {
  playerId: string
  playerName: string
  isGm: boolean
}

interface RoomContextValue {
  room: Room | null
  session: Session
  players: Player[]
  characters: Character[]
  rollEvents: RollEvent[]
  chatMessages: ChatMessage[]
  activeEncounter: Encounter | null
  roomTheme: RoomTheme
  playerThemes: Record<string, RoomTheme>
  myTheme: RoomTheme
  music: RoomMusic
  activePoll: RoomPoll | null
  screenMessage: ScreenMessage | null
  hallOfFame: HallOfFame
  stageFx: RoomStageFx
  allowPlayerThemeEditing: boolean
  presence: RoomPresence
  canRollDice: boolean
  diceCooldownSec: number
  myCharacter: Character | null
  loading: boolean
  connected: boolean
  error: string | null
  saveCharacter: (character: Character) => void
  rollDice: (opts: { count: number; sides: DiceSides; modifier: number }) => void
  rerollInspired: (opts: { count: number; sides: DiceSides; modifier: number }) => void
  sendChat: (text: string) => void
  transferGm: (newGmId: string) => void
  publishEncounter: (encounter: Omit<Encounter, 'room_id' | 'is_active'>) => void
  updateActiveEncounter: (encounter: Encounter) => void
  dismissEncounter: () => void
  adjustPlayerHp: (playerId: string, delta: number) => void
  adjustPlayerInspiration: (playerId: string, delta: number) => void
  setRoomTheme: (target: 'all' | string, theme: RoomTheme, clearOverrides?: boolean) => void
  clearPlayerTheme: (playerId: string) => void
  setPersonalTheme: (theme: RoomTheme) => void
  clearPersonalTheme: () => void
  setMusic: (url: string | null, playing: boolean) => void
  startPoll: (question: string, options: string[]) => void
  castVote: (optionId: string) => void
  endPoll: () => void
  clearPoll: () => void
  showScreenMessage: (opts: { title?: string; text: string; targetPlayerId?: string | null }) => void
  dismissScreenMessage: () => void
  setHallOfFame: (hall: HallOfFame) => void
  setStageFx: (darkness: number) => void
  setPlayerFlashlight: (playerId: string, enabled: boolean) => void
  setAllowPlayerThemeEditing: (enabled: boolean) => void
  createNpcCharacter: (name: string) => void
  deleteNpcCharacter: (playerId: string) => void
  setHandRaised: (raised: boolean) => void
  setDicePermission: (playerId: string, allowed: boolean) => void
}

const RoomContext = createContext<RoomContextValue | null>(null)

export function createEmptyCharacter(roomId: string, playerId: string, playerName: string): Character {
  return {
    id: generateId(),
    room_id: roomId,
    player_id: playerId,
    player_name: playerName,
    name: '',
    sheet_preset_id: null,
    class_status: '',
    description: '',
    text_fields: ensureSpecialTextFields([]),
    stats: [
      { id: generateId(), name: 'СИЛА', value: '0' },
      { id: generateId(), name: 'ЛОВКОСТЬ', value: '0' },
      { id: generateId(), name: 'ХАРИЗМА', value: '0' },
      { id: generateId(), name: 'ИНТЕЛЛЕКТ', value: '0' },
      { id: generateId(), name: 'УДАЧА', value: '0' },
    ],
    counters: [{ id: generateId(), name: 'ХП', current: 10, max: 10 }],
  }
}

function applyGmSession(roomId: string, playerId: string, playerName: string, isGm: boolean): Session {
  saveSession({ playerId, name: playerName, roomId, isGm })
  return { playerId, playerName, isGm }
}

function applyExtras(setters: {
  setRoomTheme: (t: RoomTheme) => void
  setPlayerThemes: (t: Record<string, RoomTheme>) => void
  setMusic: (m: RoomMusic) => void
  setActivePoll: (p: RoomPoll | null) => void
  setScreenMessage: (m: ScreenMessage | null) => void
  setHallOfFame: (h: HallOfFame) => void
  setStageFx: (s: RoomStageFx) => void
  setAllowPlayerThemeEditing: (enabled: boolean) => void
}, extras: RoomExtrasState) {
  setters.setRoomTheme(extras.roomTheme)
  setters.setPlayerThemes(extras.playerThemes)
  setters.setMusic(extras.music)
  setters.setActivePoll(extras.activePoll)
  setters.setScreenMessage(extras.screenMessage)
  setters.setHallOfFame(extras.hallOfFame)
  setters.setStageFx(extras.stageFx)
  setters.setAllowPlayerThemeEditing(extras.allowPlayerThemeEditing)
}

export function RoomProvider({
  roomId,
  initialSession,
  children,
}: {
  roomId: string
  initialSession: Session
  children: ReactNode
}) {
  const [session, setSession] = useState(initialSession)
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [rollEvents, setRollEvents] = useState<RollEvent[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [activeEncounter, setActiveEncounter] = useState<Encounter | null>(null)
  const [roomTheme, setRoomThemeState] = useState<RoomTheme>(() => parseRoomExtras({}).roomTheme)
  const [playerThemes, setPlayerThemes] = useState<Record<string, RoomTheme>>({})
  const [music, setMusicState] = useState<RoomMusic>({
    url: null,
    video_id: null,
    playing: false,
    title: null,
    volume: 70,
    source: null,
    stream_token: null,
    use_host_proxy: true,
    proxy_error: null,
  })
  const [activePoll, setActivePoll] = useState<RoomPoll | null>(null)
  const [screenMessage, setScreenMessage] = useState<ScreenMessage | null>(null)
  const [hallOfFame, setHallOfFameState] = useState<HallOfFame>(() => parseRoomExtras({}).hallOfFame)
  const [stageFx, setStageFxState] = useState<RoomStageFx>(() => parseRoomExtras({}).stageFx)
  const [allowPlayerThemeEditing, setAllowPlayerThemeEditingState] = useState<boolean>(
    () => parseRoomExtras({}).allowPlayerThemeEditing
  )
  const [presence, setPresence] = useState<RoomPresence>({ handsRaised: [], diceAllowed: [] })
  const [diceCooldownUntil, setDiceCooldownUntil] = useState(0)
  const [cooldownTick, setCooldownTick] = useState(0)
  const [myCharacter, setMyCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<RoomSocket | null>(null)

  const extrasSetters = useMemo(
    () => ({
      setRoomTheme: setRoomThemeState,
      setPlayerThemes,
      setMusic: setMusicState,
      setActivePoll,
      setScreenMessage,
      setHallOfFame: setHallOfFameState,
      setStageFx: setStageFxState,
      setAllowPlayerThemeEditing: setAllowPlayerThemeEditingState,
    }),
    []
  )

  const applyState = useCallback(
    (state: ReturnType<typeof applyPublicState>, playerId: string) => {
      setRoom(state.room)
      setPlayers(state.players)
      setCharacters(state.characters)
      setRollEvents(state.rollEvents)
      setChatMessages(state.chatMessages)
      setActiveEncounter(state.activeEncounter)
      setPresence(state.presence)
      applyExtras(extrasSetters, state.extras)

      const me = state.players.find((p) => p.id === playerId)
      if (me) {
        setSession((prev) => {
          const isGm = me.is_gm
          if (prev.isGm === isGm) return prev
          return applyGmSession(state.room.id, playerId, prev.playerName, isGm)
        })
      }

      const myChar = state.characters.find((c) => c.player_id === playerId)
      if (myChar) setMyCharacter(myChar)
      else if (me && !me.is_gm) setMyCharacter(createEmptyCharacter(state.room.id, playerId, me.name))
      else setMyCharacter(null)
    },
    [extrasSetters]
  )

  useEffect(() => {
    const socket = new RoomSocket(roomId, initialSession.playerId)
    socketRef.current = socket

    const unsubMsg = socket.onMessage((msg) => {
      switch (msg.type) {
        case 'STATE_SYNC':
          applyState(applyPublicState(msg.state), initialSession.playerId)
          if (typeof msg.your_gm === 'boolean') {
            setSession((prev) =>
              msg.your_gm !== prev.isGm
                ? applyGmSession(roomId, initialSession.playerId, prev.playerName, msg.your_gm as boolean)
                : prev
            )
          }
          setLoading(false)
          break
        case 'CHARACTER_UPDATED': {
          const char = normalizeCharacter(msg.character as unknown as Record<string, unknown>)
          setCharacters((prev) => {
            const i = prev.findIndex((c) => c.player_id === char.player_id)
            if (i >= 0) {
              const next = [...prev]
              next[i] = char
              return next
            }
            return [...prev, char]
          })
          if (char.player_id === initialSession.playerId) setMyCharacter(char)
          break
        }
        case 'CHARACTER_DELETED':
          setCharacters((prev) => prev.filter((c) => c.player_id !== msg.player_id))
          break
        case 'DICE_ROLL':
          setRollEvents((prev) => [...prev, msg.event])
          if (msg.event.player_id === initialSession.playerId) {
            setDiceCooldownUntil(Date.now() + DICE_ROLL_COOLDOWN_MS)
          }
          break
        case 'PRESENCE_UPDATE':
          setPresence({
            handsRaised: msg.hands_raised ?? [],
            diceAllowed: msg.dice_allowed ?? [],
          })
          break
        case 'CHAT_MESSAGE':
          setChatMessages((prev) => [...prev, msg.message])
          break
        case 'CHANGE_GM': {
          applyState(applyPublicState(msg.state), initialSession.playerId)
          const me = msg.state.players.find((p) => p.id === initialSession.playerId)
          if (me && !me.is_gm) {
            const existing = msg.state.characters.find((c) => c.player_id === initialSession.playerId)
            if (!existing) {
              const empty = createEmptyCharacter(roomId, initialSession.playerId, me.name)
              setMyCharacter(empty)
              socket.send({ type: 'UPDATE_CHARACTER', character: empty })
            }
          }
          break
        }
        case 'ENCOUNTER_UPDATE':
          setActiveEncounter(
            msg.encounter
              ? normalizeEncounter(msg.encounter as unknown as Record<string, unknown>)
              : null
          )
          break
        case 'ROOM_EXTRAS_UPDATE':
          applyExtras(extrasSetters, parseRoomExtras(msg.extras))
          break
        case 'ERROR':
          setError(msg.message)
          break
      }
    })

    const unsubStatus = socket.onStatus(setConnected)
    socket.connect()

    return () => {
      unsubMsg()
      unsubStatus()
      socket.disconnect()
    }
  }, [roomId, initialSession.playerId, applyState, extrasSetters])

  useEffect(() => {
    if (diceCooldownUntil <= Date.now()) return
    const id = window.setInterval(() => {
      if (Date.now() >= diceCooldownUntil) setDiceCooldownUntil(0)
      setCooldownTick((n) => n + 1)
    }, 250)
    return () => window.clearInterval(id)
  }, [diceCooldownUntil])

  const canRollDice =
    session.isGm || presence.diceAllowed.includes(initialSession.playerId)
  const diceCooldownSec =
    diceCooldownUntil > Date.now() ? Math.ceil((diceCooldownUntil - Date.now()) / 1000) : 0
  void cooldownTick

  const myTheme = useMemo(
    () => mergeTheme(roomTheme, playerThemes[initialSession.playerId]),
    [roomTheme, playerThemes, initialSession.playerId]
  )

  const saveCharacter = useCallback(
    (character: Character) => {
      const normalizedCharacter: Character = {
        ...character,
        text_fields: ensureSpecialTextFields(character.text_fields),
      }
      if (character.player_id === initialSession.playerId) {
        setMyCharacter(normalizedCharacter)
      }
      setCharacters((prev) => {
        const i = prev.findIndex((c) => c.player_id === normalizedCharacter.player_id)
        if (i >= 0) {
          const next = [...prev]
          next[i] = normalizedCharacter
          return next
        }
        return [...prev, normalizedCharacter]
      })
      socketRef.current?.send({ type: 'UPDATE_CHARACTER', character: normalizedCharacter })
    },
    [initialSession.playerId]
  )

  const rollDice = useCallback((opts: { count: number; sides: DiceSides; modifier: number }) => {
    socketRef.current?.send({ type: 'DICE_ROLL', ...opts })
  }, [])

  const rerollInspired = useCallback((opts: { count: number; sides: DiceSides; modifier: number }) => {
    socketRef.current?.send({ type: 'DICE_REROLL_INSPIRED', ...opts })
  }, [])

  const setHandRaised = useCallback((raised: boolean) => {
    socketRef.current?.send({ type: 'SET_HAND_RAISED', raised })
  }, [])

  const setDicePermission = useCallback((playerId: string, allowed: boolean) => {
    socketRef.current?.send({ type: 'SET_DICE_PERMISSION', player_id: playerId, allowed })
  }, [])

  const sendChat = useCallback((text: string) => {
    socketRef.current?.send({ type: 'CHAT_MESSAGE', text })
  }, [])

  const transferGm = useCallback((newGmId: string) => {
    socketRef.current?.send({ type: 'CHANGE_GM', new_gm_id: newGmId })
  }, [])

  const publishEncounter = useCallback((encounter: Omit<Encounter, 'room_id' | 'is_active'>) => {
    socketRef.current?.send({ type: 'SHOW_ENCOUNTER', encounter: syncLegacyHp(encounter as Encounter) })
  }, [])

  const updateActiveEncounter = useCallback((encounter: Encounter) => {
    const synced = syncLegacyHp(encounter)
    setActiveEncounter(synced)
    socketRef.current?.send({ type: 'UPDATE_ENCOUNTER', encounter: synced })
  }, [])

  const dismissEncounter = useCallback(() => {
    socketRef.current?.send({ type: 'HIDE_ENCOUNTER' })
  }, [])

  const adjustPlayerHp = useCallback(
    (playerId: string, delta: number) => {
      const char = characters.find((c) => c.player_id === playerId)
      if (!char) return
      const hpIdx = char.counters.findIndex((c) => /здор|хп|hp/i.test(c.name))
      const idx = hpIdx >= 0 ? hpIdx : 0
      if (!char.counters[idx]) return
      const updated: Character = {
        ...char,
        counters: char.counters.map((c, i) =>
          i === idx
            ? { ...c, current: Math.max(0, Math.min(c.max, c.current + delta)) }
            : c
        ),
      }
      saveCharacter(updated)
    },
    [characters, saveCharacter]
  )

  const adjustPlayerInspiration = useCallback(
    (playerId: string, delta: number) => {
      const char = characters.find((c) => c.player_id === playerId)
      if (!char) return
      const idx = char.counters.findIndex((c) => /вдох|inspir/i.test(c.name))
      let nextCounters = [...char.counters]

      if (idx < 0) {
        if (delta <= 0) return
        nextCounters.push({
          id: generateId(),
          name: 'Очки вдохновения',
          current: delta,
          max: 99,
        })
      } else {
        const counter = nextCounters[idx]
        nextCounters[idx] = {
          ...counter,
          current: Math.max(0, Math.min(counter.max, counter.current + delta)),
        }
      }

      saveCharacter({ ...char, counters: nextCounters })
    },
    [characters, saveCharacter]
  )

  const updateRoomTheme = useCallback((target: 'all' | string, theme: RoomTheme, clearOverrides?: boolean) => {
    socketRef.current?.send({
      type: 'SET_THEME',
      theme,
      target_player_id: target === 'all' ? null : target,
      clear_player_overrides: clearOverrides,
    })
  }, [])

  const clearPlayerTheme = useCallback((playerId: string) => {
    socketRef.current?.send({ type: 'CLEAR_PLAYER_THEME', target_player_id: playerId })
  }, [])

  const setPersonalTheme = useCallback((theme: RoomTheme) => {
    if (!session.isGm && !allowPlayerThemeEditing) return
    socketRef.current?.send({ type: 'SET_PLAYER_THEME', theme })
  }, [allowPlayerThemeEditing, session.isGm])

  const clearPersonalTheme = useCallback(() => {
    if (!session.isGm && !allowPlayerThemeEditing) return
    socketRef.current?.send({ type: 'CLEAR_MY_THEME' })
  }, [allowPlayerThemeEditing, session.isGm])

  const setAllowPlayerThemeEditing = useCallback((enabled: boolean) => {
    const next = Boolean(enabled)
    setAllowPlayerThemeEditingState(next)
    socketRef.current?.send({ type: 'SET_ALLOW_PLAYER_THEME_EDITING', enabled: next })
  }, [])

  const createNpcCharacter = useCallback((name: string) => {
    socketRef.current?.send({ type: 'CREATE_NPC_CHARACTER', name: name.trim() })
  }, [])

  const deleteNpcCharacter = useCallback((playerId: string) => {
    socketRef.current?.send({ type: 'DELETE_NPC_CHARACTER', player_id: playerId })
  }, [])

  const updateMusic = useCallback((url: string | null, playing: boolean) => {
    socketRef.current?.send({ type: 'SET_MUSIC', url, playing })
  }, [])

  const startPoll = useCallback((question: string, options: string[]) => {
    socketRef.current?.send({ type: 'START_POLL', question, options })
  }, [])

  const castVote = useCallback((optionId: string) => {
    socketRef.current?.send({ type: 'CAST_VOTE', option_id: optionId })
  }, [])

  const endPoll = useCallback(() => {
    socketRef.current?.send({ type: 'END_POLL' })
  }, [])

  const clearPoll = useCallback(() => {
    socketRef.current?.send({ type: 'CLEAR_POLL' })
  }, [])

  const showScreenMessage = useCallback(
    (opts: { title?: string; text: string; targetPlayerId?: string | null }) => {
      socketRef.current?.send({
        type: 'SHOW_SCREEN_MESSAGE',
        title: opts.title ?? '',
        text: opts.text,
        target_player_id: opts.targetPlayerId ?? null,
      })
    },
    []
  )

  const dismissScreenMessage = useCallback(() => {
    socketRef.current?.send({ type: 'DISMISS_SCREEN_MESSAGE' })
  }, [])

  const setHallOfFame = useCallback((hall: HallOfFame) => {
    setHallOfFameState(hall)
    socketRef.current?.send({ type: 'SET_HALL_OF_FAME', hall_of_fame: hall })
  }, [])

  const setStageFx = useCallback((darkness: number) => {
    const v = Math.max(0, Math.min(100, Math.round(darkness)))
    setStageFxState((prev) => ({ ...prev, darkness: v }))
    socketRef.current?.send({ type: 'SET_STAGE_FX', darkness: v })
  }, [])

  const setPlayerFlashlight = useCallback((playerId: string, enabled: boolean) => {
    setStageFxState((prev) => {
      const set = new Set(prev.flashlightsEnabledFor ?? [])
      if (enabled) set.add(playerId)
      else set.delete(playerId)
      const next = { ...prev, flashlightsEnabledFor: [...set] }
      socketRef.current?.send({
        type: 'SET_STAGE_FX',
        darkness: prev.darkness,
        flashlights_enabled_for: next.flashlightsEnabledFor,
      })
      return next
    })
  }, [])

  const value = useMemo<RoomContextValue>(
    () => ({
      room,
      session,
      players,
      characters,
      rollEvents,
      chatMessages,
      activeEncounter,
      roomTheme,
      playerThemes,
      myTheme,
      music,
      activePoll,
      screenMessage,
      hallOfFame,
      stageFx,
      allowPlayerThemeEditing,
      presence,
      canRollDice,
      diceCooldownSec,
      myCharacter,
      loading,
      connected,
      error,
      saveCharacter,
      rollDice,
      rerollInspired,
      setHandRaised,
      setDicePermission,
      sendChat,
      transferGm,
      publishEncounter,
      updateActiveEncounter,
      dismissEncounter,
      adjustPlayerHp,
      adjustPlayerInspiration,
      setRoomTheme: updateRoomTheme,
      clearPlayerTheme,
      setPersonalTheme,
      clearPersonalTheme,
      setAllowPlayerThemeEditing,
      setMusic: updateMusic,
      startPoll,
      castVote,
      endPoll,
      clearPoll,
      showScreenMessage,
      dismissScreenMessage,
      setHallOfFame,
      setStageFx,
      setPlayerFlashlight,
      createNpcCharacter,
      deleteNpcCharacter,
    }),
    [
      room,
      session,
      players,
      characters,
      rollEvents,
      chatMessages,
      activeEncounter,
      roomTheme,
      playerThemes,
      myTheme,
      music,
      activePoll,
      screenMessage,
      hallOfFame,
      stageFx,
      allowPlayerThemeEditing,
      presence,
      canRollDice,
      diceCooldownSec,
      myCharacter,
      loading,
      connected,
      error,
      saveCharacter,
      rollDice,
      rerollInspired,
      sendChat,
      transferGm,
      publishEncounter,
      updateActiveEncounter,
      dismissEncounter,
      adjustPlayerHp,
      adjustPlayerInspiration,
      updateRoomTheme,
      clearPlayerTheme,
      setPersonalTheme,
      clearPersonalTheme,
      setAllowPlayerThemeEditing,
      updateMusic,
      startPoll,
      castVote,
      endPoll,
      clearPoll,
      showScreenMessage,
      dismissScreenMessage,
      setHallOfFame,
      setStageFx,
      setPlayerFlashlight,
      createNpcCharacter,
      deleteNpcCharacter,
      setHandRaised,
      setDicePermission,
    ]
  )

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoom must be used within RoomProvider')
  return ctx
}
