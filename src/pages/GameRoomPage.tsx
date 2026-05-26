import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Crown, Home, Loader2 } from 'lucide-react'
import { RoomProvider, useRoom } from '@/context/RoomContext'
import { apiGetRoomById } from '@/lib/api'
import { fetchServerInfo, getInviteBaseUrl } from '@/lib/runtime'
import { clearSession, copyToClipboard, loadSession } from '@/lib/utils'
import { PartySheetBrowser } from '@/components/CharacterSheet/PartySheetBrowser'
import { DiceRoller } from '@/components/DiceRoller/DiceRoller'
import { EncounterBanner } from '@/components/Encounter/EncounterBanner'
import { EncounterCard } from '@/components/Encounter/EncounterCard'
import { EncounterEditor } from '@/components/Encounter/EncounterEditor'
import { RoomMainLayout, RoomSideFeed } from '@/components/RoomLayout/RoomSideFeed'
import { RoomPlayerRoster } from '@/components/RoomRoster/RoomPlayerRoster'
import { playAnnounceCue, playBattleStartCue, resumeRoomAudio } from '@/lib/roomSounds'
import { GMPanel } from '@/components/GMPanel/GMPanel'
import { GmPlayerSheets } from '@/components/GmPlayerSheets/GmPlayerSheets'
import { GmRoomTools } from '@/components/GmTools/GmRoomTools'
import { RoomPollPanel } from '@/components/Poll/RoomPollPanel'
import { RoomMusicPlayback } from '@/components/RoomMusic/RoomMusicPlayback'
import { GmTabBar, PlayerTabBar, type GmTabId, type PlayerTabId } from '@/components/RoomTabs/RoomTabs'
import { RetroLeaderboard } from '@/components/Leaderboard/RetroLeaderboard'
import { RoomThemeApplier } from '@/components/RoomTheme/RoomThemeApplier'
import { ScreenMessageOverlay } from '@/components/ScreenMessage/ScreenMessageOverlay'
import { Button } from '@/components/ui/Button'
import { RoomHud } from '@/components/RoomHud/RoomHud'
import { ThemeColorEditor } from '@/components/RoomTheme/ThemeColorEditor'
import { getRoomSessionStartMs } from '@/lib/sessionTime'

export function GameRoomPage() {
  const { roomId: roomIdParam } = useParams<{ roomId: string }>()
  const [session] = useState(() => loadSession())
  const [verified, setVerified] = useState(false)
  const [resolving, setResolving] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!roomIdParam) {
      setNotFound(true)
      setResolving(false)
      return
    }
    if (!session) {
      navigate('/')
      return
    }
    apiGetRoomById(roomIdParam)
      .then((data) => {
        if (!data.room || data.room.id !== session.roomId || data.room.id !== roomIdParam) {
          setNotFound(true)
        } else {
          setVerified(true)
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setResolving(false))
  }, [roomIdParam, session, navigate])

  if (resolving) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-vng-amber" size={32} />
      </div>
    )
  }

  if (notFound || !session || !verified || !roomIdParam) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-vng-muted">Комната не найдена. Войдите через лобби на главной.</p>
        <Link to="/">
          <Button variant="secondary"><Home size={16} /> На главную</Button>
        </Link>
      </div>
    )
  }

  return (
    <RoomProvider
      roomId={roomIdParam}
      initialSession={{ playerId: session.playerId, playerName: session.name, isGm: session.isGm }}
    >
      <GameRoomContent />
    </RoomProvider>
  )
}

function GameRoomContent() {
  const {
    room, session, players, characters, rollEvents, chatMessages, activeEncounter,
    myCharacter, loading, connected, error, myTheme, music, activePoll, screenMessage, hallOfFame,
    stageFx,
    roomTheme,
    saveCharacter, rollDice, rerollInspired, sendChat, transferGm,
    publishEncounter, updateActiveEncounter, dismissEncounter, adjustPlayerHp,
    adjustPlayerInspiration,
    setRoomTheme, clearPlayerTheme, setPersonalTheme, clearPersonalTheme,
    allowPlayerThemeEditing, setAllowPlayerThemeEditing,
    setMusic, startPoll, castVote, endPoll, clearPoll,
    showScreenMessage, dismissScreenMessage, setHallOfFame,
    setStageFx, setPlayerFlashlight,
    createNpcCharacter, deleteNpcCharacter,
    presence, canRollDice, diceCooldownSec, setHandRaised, setDicePermission,
  } = useRoom()

  const [playerTab, setPlayerTab] = useState<PlayerTabId>('sheet')
  const [gmTab, setGmTab] = useState<GmTabId>('players')
  const [showGmPanel, setShowGmPanel] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lanIps, setLanIps] = useState<string[]>([])
  const [dismissedScreenId, setDismissedScreenId] = useState<string | null>(null)
  const [themePanelOpen, setThemePanelOpen] = useState(false)
  const lastEncounterId = useRef<string | null>(null)
  const lastScreenSoundId = useRef<string | null>(null)
  const navigate = useNavigate()

  const showEncounterTab = Boolean(activeEncounter)
  const showVoteTab = Boolean(activePoll)

  useEffect(() => {
    if (session.isGm) fetchServerInfo().then((info) => setLanIps(info?.addresses ?? []))
  }, [session.isGm])

  useEffect(() => {
    const onGesture = () => resumeRoomAudio()
    window.addEventListener('pointerdown', onGesture, { once: true })
    return () => window.removeEventListener('pointerdown', onGesture)
  }, [])

  useEffect(() => {
    const id = activeEncounter?.id ?? null
    if (id && id !== lastEncounterId.current) {
      lastEncounterId.current = id
      playBattleStartCue()
      if (session.isGm) setGmTab('encounter')
      else setPlayerTab('encounter')
    }
    if (!id) lastEncounterId.current = null
  }, [activeEncounter?.id, session.isGm])

  useEffect(() => {
    const msg = screenMessage
    if (!msg) return
    if (msg.target_player_id && msg.target_player_id !== session.playerId) return
    if (msg.id === lastScreenSoundId.current) return
    lastScreenSoundId.current = msg.id
    playAnnounceCue()
  }, [screenMessage?.id, screenMessage?.target_player_id, session.playerId])

  useEffect(() => {
    if (!session.isGm && !allowPlayerThemeEditing && themePanelOpen) {
      setThemePanelOpen(false)
    }
  }, [allowPlayerThemeEditing, session.isGm, themePanelOpen])

  useEffect(() => {
    if (activePoll?.open) {
      if (session.isGm) setGmTab('vote')
      else setPlayerTab('vote')
    }
  }, [activePoll?.id, activePoll?.open, session.isGm])

  const inviteUrl = getInviteBaseUrl()
  const sessionStartMs = getRoomSessionStartMs(room?.created_at)

  async function handleCopy() {
    const lines = [
      `Сессия: ${room?.name ?? 'ВнГ'}`,
      `Откройте лобби и выберите комнату в списке`,
      inviteUrl,
    ]
    if (lanIps.length) lines.push(`Сервер: http://${lanIps[0]}:5173`)
    await copyToClipboard(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleLeave() {
    clearSession()
    navigate('/')
  }

  const visibleScreenMessage =
    screenMessage &&
    screenMessage.id !== dismissedScreenId &&
    (!screenMessage.target_player_id || screenMessage.target_player_id === session.playerId)
      ? screenMessage
      : null

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-vng-amber" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-vng-danger">{error}</p>
        <Button variant="secondary" onClick={handleLeave}><Home size={16} /> На главную</Button>
      </div>
    )
  }

  const playerRoster = (
    <RoomPlayerRoster
      players={players}
      myPlayerId={session.playerId}
      isGm={session.isGm}
      handsRaised={presence.handsRaised}
      diceAllowed={presence.diceAllowed}
      onToggleHand={setHandRaised}
      onSetDicePermission={setDicePermission}
    />
  )

  const sideFeed = (
    <RoomSideFeed
      rollEvents={rollEvents}
      chatMessages={chatMessages}
      onSendChat={sendChat}
      gmPlayerId={room?.gm_id}
      disabled={!connected}
    />
  )

  const diceRollerProps = {
    playerId: session.playerId,
    rollEvents,
    disabled: !connected,
    canRoll: canRollDice,
    cooldownSec: diceCooldownSec,
    isGm: session.isGm,
    inspirationPoints: myCharacter?.counters.find((c) => /вдох|inspir/i.test(c.name))?.current ?? 0,
    onReroll: session.isGm
      ? undefined
      : (opts: { count: number; sides: number; modifier: number }) => {
          const char = myCharacter
          if (!char) return false
          const inspiration = char.counters.find((c) => /вдох|inspir/i.test(c.name))
          if (!inspiration || inspiration.current <= 0) return false
          rerollInspired(
            opts as { count: number; sides: 3 | 4 | 6 | 8 | 10 | 12 | 20 | 100; modifier: number }
          )
          return true
        },
  }

  const encounterBanner = activeEncounter ? (
    <EncounterBanner
      encounter={activeEncounter}
      showGmHint={session.isGm}
      onOpen={() => (session.isGm ? setGmTab('encounter') : setPlayerTab('encounter'))}
    />
  ) : null

  const tabPanelClass = 'h-full min-h-0 flex flex-col flex-1 lg:overflow-hidden'

  const encounterView = activeEncounter && (
    <div className={tabPanelClass}>
      <EncounterCard
        encounter={activeEncounter}
        showDismiss={session.isGm}
        onDismiss={dismissEncounter}
        showGmNotes={session.isGm}
      />
    </div>
  )

  const voteView = activePoll && (
    <div className={tabPanelClass}>
      <RoomPollPanel
        poll={activePoll}
        myPlayerId={session.playerId}
        players={players}
        isGm={session.isGm}
        onVote={castVote}
        onEnd={session.isGm ? endPoll : undefined}
        onClear={session.isGm ? clearPoll : undefined}
      />
    </div>
  )

  const topsView = (
    <div className={`${tabPanelClass} vng-retro-tab-content`}>
      <RetroLeaderboard
        hall={hallOfFame}
        isGm={session.isGm}
        fillHeight
        onUpdate={session.isGm ? setHallOfFame : undefined}
      />
    </div>
  )

  return (
    <RoomThemeApplier
      theme={myTheme}
      stageFx={stageFx}
      viewerPlayerId={session.playerId}
      viewerIsGm={session.isGm}
    >
      <RoomHud
        roomName={room?.name ?? 'Комната'}
        sessionStartMs={sessionStartMs}
        connected={connected}
        playerCount={players.filter((p) => !p.is_gm).length}
        playerName={session.playerName}
        isGm={session.isGm}
        copied={copied}
        onCopy={handleCopy}
        onLeave={handleLeave}
        themeOpen={themePanelOpen}
        showThemeToggle={session.isGm || allowPlayerThemeEditing}
        onToggleTheme={() => setThemePanelOpen((v) => !v)}
      />

      {themePanelOpen && (
        <div className="shrink-0 z-30 px-3 py-2 border-b border-vng-border max-w-[1600px] w-full mx-auto">
          {session.isGm || allowPlayerThemeEditing ? (
            <ThemeColorEditor
              title="Цвета только для вас"
              initial={myTheme}
              defaultDraft={roomTheme}
              onApply={setPersonalTheme}
              onReset={clearPersonalTheme}
            />
          ) : (
            <div className="vng-panel p-3">
              <p className="text-sm text-vng-muted">ГМ отключил смену личных цветов для игроков.</p>
            </div>
          )}
          {session.isGm && (
            <p className="text-xs text-vng-muted mt-2">
              Чтобы сменить цвета для всей комнаты — вкладка «ГМ» → блок «Цвета для комнаты».
            </p>
          )}
          {!session.isGm && !allowPlayerThemeEditing && (
            <p className="text-xs text-vng-muted mt-2">Попросите ГМа снова разрешить личные цвета.</p>
          )}
        </div>
      )}

      <RoomMusicPlayback roomId={room?.id ?? ''} music={music} />

      <main className="flex flex-1 flex-col min-h-0 max-w-[1600px] w-full mx-auto px-3 py-3">
        <RoomMainLayout encounterBanner={encounterBanner} roster={playerRoster} sideFeed={sideFeed}>
          <div className="flex flex-1 flex-col min-h-0 overflow-y-auto lg:overflow-hidden">
          {session.isGm ? (
            <>
              {gmTab === 'players' && (
                <div className={`${tabPanelClass} gap-3`}>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <GmPlayerSheets
                      players={players}
                      characters={characters}
                      gmPlayerId={session.playerId}
                      onSave={saveCharacter}
                      onCreateNpc={createNpcCharacter}
                      onDeleteNpc={deleteNpcCharacter}
                    />
                  </div>
                  <div className="shrink-0 flex justify-end">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setShowGmPanel(true)}>
                      <Crown size={14} /> Управление игроками
                    </Button>
                  </div>
                </div>
              )}
              {gmTab === 'dice' && (
                <div className={tabPanelClass}>
                  <DiceRoller onRoll={rollDice} fillHeight {...diceRollerProps} />
                </div>
              )}
              {gmTab === 'tops' && topsView}
              {gmTab === 'encounter' && encounterView}
              {gmTab === 'vote' && voteView}
              {gmTab === 'gm' && (
                <div className={`${tabPanelClass} gap-3 overflow-y-auto lg:overflow-hidden`}>
                  <div className="flex-1 min-h-0 lg:overflow-y-auto flex flex-col gap-3">
                    <div className="vng-encounter-editor-panel vng-encounter-editor-panel--primary shrink-0">
                      <EncounterEditor
                        activeEncounter={activeEncounter}
                        onPublish={publishEncounter}
                        onUpdate={updateActiveEncounter}
                        onDismiss={dismissEncounter}
                        compact
                        fillHeight={false}
                        prominent
                      />
                    </div>
                    <GmRoomTools
                      players={players}
                      roomTheme={roomTheme}
                      music={music}
                      onSetTheme={setRoomTheme}
                      onClearPlayerTheme={clearPlayerTheme}
                      onSetMusic={setMusic}
                      onStartPoll={startPoll}
                      onShowScreenMessage={showScreenMessage}
                      onDismissScreenMessage={dismissScreenMessage}
                      hasScreenMessage={Boolean(screenMessage)}
                      stageDarkness={stageFx.darkness}
                      onSetStageDarkness={setStageFx}
                      flashlightsEnabledFor={stageFx.flashlightsEnabledFor}
                      onSetPlayerFlashlight={setPlayerFlashlight}
                      allowPlayerThemeEditing={allowPlayerThemeEditing}
                      onSetAllowPlayerThemeEditing={setAllowPlayerThemeEditing}
                    />
                  </div>
                  <Button variant="secondary" className="shrink-0" onClick={() => setShowGmPanel(true)}>
                    <Crown size={16} /> Игроки и HP
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {playerTab === 'sheet' && (
                <div className={tabPanelClass}>
                  <PartySheetBrowser
                    viewerPlayerId={session.playerId}
                    viewerIsGm={false}
                    players={players}
                    characters={characters}
                    gmPlayerId={room?.gm_id ?? ''}
                    myCharacter={myCharacter}
                    onSaveOwn={saveCharacter}
                  />
                </div>
              )}
              {playerTab === 'dice' && (
                <div className={tabPanelClass}>
                  <DiceRoller onRoll={rollDice} fillHeight {...diceRollerProps} />
                </div>
              )}
              {playerTab === 'tops' && topsView}
              {playerTab === 'encounter' && encounterView}
              {playerTab === 'vote' && voteView}
            </>
          )}
          {session.isGm ? (
            <GmTabBar
              active={gmTab}
              onChange={setGmTab}
              showEncounter={showEncounterTab}
              showVote={showVoteTab}
            />
          ) : (
            <PlayerTabBar
              active={playerTab}
              onChange={setPlayerTab}
              showEncounter={showEncounterTab}
              showVote={showVoteTab}
            />
          )}
          </div>
        </RoomMainLayout>
      </main>

      {showGmPanel && session.isGm && room && (
        <GMPanel
          players={players}
          characters={characters}
          currentGmId={session.playerId}
          roomId={room.id}
          onPublishEncounter={publishEncounter}
          onClearEncounter={dismissEncounter}
          onTransferGm={transferGm}
          onAdjustHp={adjustPlayerHp}
          onAdjustInspiration={adjustPlayerInspiration}
          onClose={() => setShowGmPanel(false)}
        />
      )}

      {visibleScreenMessage && (
        <ScreenMessageOverlay
          message={visibleScreenMessage}
          canDismiss
          onDismiss={() => {
            setDismissedScreenId(visibleScreenMessage.id)
            if (session.isGm) dismissScreenMessage()
          }}
        />
      )}
    </RoomThemeApplier>
  )
}
