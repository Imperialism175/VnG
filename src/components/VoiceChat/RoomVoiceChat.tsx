import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, Radio, Volume2 } from 'lucide-react'
import type { Character, Player, VoiceSignal } from '@/types'
import { Button } from '@/components/ui/Button'

interface RoomVoiceChatProps {
  sessionPlayerId: string
  isGm: boolean
  players: Player[]
  characters: Character[]
  voiceBlockedPlayerIds: string[]
  onSetPlayerVoiceAllowed: (playerId: string, allowed: boolean) => void
  onSendVoiceSignal: (targetPlayerId: string | null, signal: VoiceSignal) => void
  onVoiceSignal: (listener: (fromPlayerId: string, signal: VoiceSignal) => void) => () => void
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

function isMolchunCharacter(char: Character | null | undefined): boolean {
  if (!char) return false
  if (char.sheet_preset_id === 'molchun') return true
  return String(char.class_status ?? '').toLowerCase().includes('молч')
}

export function RoomVoiceChat({
  sessionPlayerId,
  isGm,
  players,
  characters,
  voiceBlockedPlayerIds,
  onSetPlayerVoiceAllowed,
  onSendVoiceSignal,
  onVoiceSignal,
}: RoomVoiceChatProps) {
  const [joined, setJoined] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [voicePeers, setVoicePeers] = useState<string[]>([])
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef(new Map<string, RTCPeerConnection>())
  const joinedRef = useRef(joined)
  const micEnabledRef = useRef(micEnabled)

  useEffect(() => {
    joinedRef.current = joined
  }, [joined])
  useEffect(() => {
    micEnabledRef.current = micEnabled
  }, [micEnabled])

  const playerIds = useMemo(
    () => players.map((p) => p.id).filter((id) => id !== sessionPlayerId),
    [players, sessionPlayerId]
  )

  const myCharacter = useMemo(
    () => characters.find((c) => c.player_id === sessionPlayerId) ?? null,
    [characters, sessionPlayerId]
  )
  const blockedByGm = voiceBlockedPlayerIds.includes(sessionPlayerId)
  const molchun = isMolchunCharacter(myCharacter)
  const canSpeak = !blockedByGm && !molchun

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStreamRef.current = stream
    return stream
  }, [])

  const syncVoicePeersList = useCallback(() => {
    setVoicePeers([...peersRef.current.keys()].sort())
  }, [])

  const closePeer = useCallback(
    (remoteId: string) => {
      const peer = peersRef.current.get(remoteId)
      if (!peer) return
      peer.close()
      peersRef.current.delete(remoteId)
      setRemoteStreams((prev) => {
        const next = { ...prev }
        delete next[remoteId]
        return next
      })
      syncVoicePeersList()
    },
    [syncVoicePeersList]
  )

  const addLocalTracksIfPossible = useCallback(
    async (peer: RTCPeerConnection) => {
      if (!joinedRef.current || !canSpeak) return
      const stream = await ensureLocalStream().catch(() => null)
      if (!stream) return
      for (const track of stream.getAudioTracks()) {
        track.enabled = micEnabledRef.current
        const already = peer.getSenders().some((s) => s.track?.id === track.id)
        if (!already) peer.addTrack(track, stream)
      }
    },
    [canSpeak, ensureLocalStream]
  )

  const getOrCreatePeer = useCallback(
    async (remoteId: string) => {
      let peer = peersRef.current.get(remoteId)
      if (peer) return peer
      peer = new RTCPeerConnection(ICE_SERVERS)
      peersRef.current.set(remoteId, peer)
      syncVoicePeersList()

      peer.onicecandidate = (event) => {
        if (!event.candidate) return
        onSendVoiceSignal(remoteId, { kind: 'ice', candidate: event.candidate.toJSON() })
      }
      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === 'failed' || peer?.connectionState === 'closed' || peer?.connectionState === 'disconnected') {
          closePeer(remoteId)
        }
      }
      peer.ontrack = (event) => {
        const [stream] = event.streams
        if (!stream) return
        setRemoteStreams((prev) => ({ ...prev, [remoteId]: stream }))
      }

      await addLocalTracksIfPossible(peer)
      return peer
    },
    [addLocalTracksIfPossible, closePeer, onSendVoiceSignal, syncVoicePeersList]
  )

  const createOfferTo = useCallback(
    async (remoteId: string) => {
      const peer = await getOrCreatePeer(remoteId)
      const offer = await peer.createOffer({ offerToReceiveAudio: true })
      await peer.setLocalDescription(offer)
      onSendVoiceSignal(remoteId, { kind: 'offer', sdp: offer })
    },
    [getOrCreatePeer, onSendVoiceSignal]
  )

  useEffect(() => {
    const unsub = onVoiceSignal((fromPlayerId, signal) => {
      if (!joinedRef.current) return
      void (async () => {
        if (signal.kind === 'join') {
          // Deterministic anti-glare: only lexicographically larger id initiates offer.
          if (sessionPlayerId > fromPlayerId) {
            await createOfferTo(fromPlayerId)
          }
          return
        }
        const peer = await getOrCreatePeer(fromPlayerId)
        if (signal.kind === 'offer' && signal.sdp) {
          await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          onSendVoiceSignal(fromPlayerId, { kind: 'answer', sdp: answer })
          return
        }
        if (signal.kind === 'answer' && signal.sdp) {
          await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          return
        }
        if (signal.kind === 'ice' && signal.candidate) {
          try {
            await peer.addIceCandidate(signal.candidate)
          } catch {
            /* ignore transient ice errors */
          }
        }
      })()
    })
    return unsub
  }, [createOfferTo, getOrCreatePeer, onSendVoiceSignal, onVoiceSignal, sessionPlayerId])

  useEffect(() => {
    if (!joined) return
    onSendVoiceSignal(null, { kind: 'join' })
  }, [joined, onSendVoiceSignal, playerIds.length])

  useEffect(() => {
    for (const remoteId of [...peersRef.current.keys()]) {
      if (!playerIds.includes(remoteId)) closePeer(remoteId)
    }
  }, [playerIds, closePeer])

  useEffect(() => {
    if (!joined || !canSpeak) {
      const stream = localStreamRef.current
      if (stream) {
        for (const track of stream.getAudioTracks()) track.enabled = false
      }
      return
    }
    void ensureLocalStream().then((stream) => {
      for (const track of stream.getAudioTracks()) track.enabled = micEnabled
      for (const peer of peersRef.current.values()) {
        void addLocalTracksIfPossible(peer)
      }
    }).catch(() => {
      /* mic permission denied: stay in listen-only mode */
    })
  }, [addLocalTracksIfPossible, canSpeak, ensureLocalStream, joined, micEnabled])

  useEffect(() => {
    if (joined) return
    for (const peer of peersRef.current.values()) peer.close()
    peersRef.current.clear()
    setRemoteStreams({})
    setVoicePeers([])
    const stream = localStreamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      localStreamRef.current = null
    }
  }, [joined])

  useEffect(
    () => () => {
      for (const peer of peersRef.current.values()) peer.close()
      const stream = localStreamRef.current
      if (stream) for (const track of stream.getTracks()) track.stop()
    },
    []
  )

  const roster = useMemo(() => players.filter((p) => !p.is_gm), [players])

  return (
    <section className="shrink-0 px-2 sm:px-3 pb-2 max-w-[1600px] w-full mx-auto">
      <div className="vng-panel p-2 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase text-vng-muted flex items-center gap-1">
          <Radio size={13} /> Voice
        </span>
        <Button type="button" size="sm" variant={joined ? 'secondary' : 'ghost'} onClick={() => setJoined((v) => !v)}>
          {joined ? 'Выйти из voice' : 'Войти в voice'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={micEnabled ? 'ghost' : 'secondary'}
          onClick={() => setMicEnabled((v) => !v)}
          disabled={!joined || !canSpeak}
        >
          {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
          {micEnabled ? 'Микр. вкл' : 'Микр. выкл'}
        </Button>
        <span className="text-xs text-vng-muted">В голосе: {voicePeers.length + (joined ? 1 : 0)}</span>
        {!canSpeak && (
          <span className="text-xs text-vng-danger">
            {molchun ? 'Лист Молчуна: говорить нельзя' : 'ГМ отключил вам право голоса'}
          </span>
        )}
      </div>

      {isGm && (
        <div className="mt-2 vng-panel p-2">
          <p className="text-xs uppercase text-vng-muted mb-1">Управление голосом (ГМ)</p>
          <div className="flex flex-wrap gap-2">
            {roster.map((p) => {
              const blocked = voiceBlockedPlayerIds.includes(p.id)
              const char = characters.find((c) => c.player_id === p.id)
              const isMolchun = isMolchunCharacter(char)
              return (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={blocked || isMolchun ? 'secondary' : 'ghost'}
                  onClick={() => onSetPlayerVoiceAllowed(p.id, blocked)}
                  disabled={isMolchun}
                  title={isMolchun ? 'Лист Молчуна не может говорить' : undefined}
                >
                  <Volume2 size={13} />
                  {p.name}: {isMolchun ? 'Молчун' : blocked ? 'Вернуть голос' : 'Забрать голос'}
                </Button>
              )
            })}
          </div>
        </div>
      )}

      {Object.entries(remoteStreams).map(([playerId, stream]) => (
        <audio
          key={playerId}
          autoPlay
          playsInline
          className="hidden"
          ref={(el) => {
            if (!el) return
            if (el.srcObject !== stream) el.srcObject = stream
          }}
        />
      ))}
    </section>
  )
}
