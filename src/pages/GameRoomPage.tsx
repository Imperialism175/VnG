import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Crown, Home, Loader2, Menu } from 'lucide-react'
import { RoomProvider, useRoom } from '@/context/RoomContext'
import { apiGetRoomById } from '@/lib/api'
import { fetchServerInfo, getInviteBaseUrl } from '@/lib/runtime'
import { clearSession, copyToClipboard, loadSession } from '@/lib/utils'
import { PartySheetBrowser } from '@/components/CharacterSheet/PartySheetBrowser'
import { DiceRoller } from '@/components/DiceRoller/DiceRoller'
import { RoomMainLayout, RoomSideFeed } from '@/components/RoomLayout/RoomSideFeed'
import { RoomPlayerRoster } from '@/components/RoomRoster/RoomPlayerRoster'
import { playAnnounceCue, resumeRoomAudio } from '@/lib/roomSounds'
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
import { getLevelPreset } from '@/lib/levels'
import { getStatEffectForCharacterSheet } from '@/lib/characterSheets'
import { RoomVoiceChat } from '@/components/VoiceChat/RoomVoiceChat'

const MOBILE_UI_SCALE_KEY = 'vng_mobile_ui_scale'

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
    room, session, players, characters, rollEvents, chatMessages,
    myCharacter, loading, connected, error, myTheme, music, activePoll, screenMessage, hallOfFame,
    stageFx,
    roomTheme,
    saveCharacter, rollDice, rerollInspired, sendChat, transferGm,
    adjustPlayerHp,
    adjustPlayerInspiration,
    setRoomTheme, clearPlayerTheme, setPersonalTheme, clearPersonalTheme,
    allowPlayerThemeEditing, setAllowPlayerThemeEditing,
    levelId, levelVariant, setLevelPreset, showLevelToPlayers, setShowLevelToPlayers,
    setMusic, startPoll, castVote, endPoll, clearPoll,
    showScreenMessage, dismissScreenMessage, setHallOfFame,
    setStageFx, setPlayerFlashlight,
    presence, canRollDice, diceCooldownSec, setHandRaised, pingPlayer,
    voiceBlockedPlayerIds, setPlayerVoiceAllowed, sendVoiceSignal, onVoiceSignal,
  } = useRoom()

  const [playerTab, setPlayerTab] = useState<PlayerTabId>('sheet')
  const [gmTab, setGmTab] = useState<GmTabId>('players')
  const [showGmPanel, setShowGmPanel] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lanIps, setLanIps] = useState<string[]>([])
  const [dismissedScreenId, setDismissedScreenId] = useState<string | null>(null)
  const [themePanelOpen, setThemePanelOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileUiScale, setMobileUiScale] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(MOBILE_UI_SCALE_KEY)
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? Math.max(0.85, Math.min(1.4, parsed)) : 1
    } catch {
      return 1
    }
  })
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const lastScreenSoundId = useRef<string | null>(null)
  const navigate = useNavigate()

  const showEncounterTab = false
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
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      if (mq.matches) setMobileNavOpen(false)
    }
    onChange()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  useEffect(() => {
    if (activePoll?.open) {
      if (session.isGm) setGmTab('vote')
      else setPlayerTab('vote')
    }
  }, [activePoll?.id, activePoll?.open, session.isGm])

  useEffect(() => {
    try {
      window.localStorage.setItem(MOBILE_UI_SCALE_KEY, String(mobileUiScale))
    } catch {
      /* ignore */
    }
  }, [mobileUiScale])

  const inviteUrl = getInviteBaseUrl()
  const sessionStartMs = getRoomSessionStartMs(room?.created_at)
  const activeLevel = getLevelPreset(levelId)
  const rawLevelLabel =
    activeLevel
      ? levelVariant === 'alt'
        ? `${activeLevel.title} → ${activeLevel.altTitle}`
        : activeLevel.title
      : null
  const levelLabel = session.isGm || showLevelToPlayers ? rawLevelLabel : null

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
      onToggleHand={setHandRaised}
      onSignalPlayer={pingPlayer}
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
    statOptions: (myCharacter?.stats ?? []).map((s) => s.name).filter(Boolean),
    statValues: Object.fromEntries((myCharacter?.stats ?? []).map((s) => [s.name, s.value])),
    statScaleValues: Object.fromEntries(
      (myCharacter?.stats ?? []).map((s) => {
        const statRaw = Number(s.value)
        const effect = Number.isFinite(statRaw)
          ? getStatEffectForCharacterSheet(myCharacter?.sheet_preset_id ?? null, myCharacter?.class_status ?? '', statRaw)
          : null
        return [s.name, typeof effect === 'number' && Number.isFinite(effect) ? effect : 0]
      })
    ),
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

  const encounterBanner = null

  const tabPanelClassMobile = 'min-h-0 flex flex-col flex-1 overflow-y-auto overflow-x-hidden lg:h-full lg:overflow-hidden'

  const handleMobileSwipeStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    touchStartXRef.current = touch.clientX
    touchStartYRef.current = touch.clientY
  }

  const handleMobileSwipeEnd = (e: TouchEvent) => {
    const sx = touchStartXRef.current
    const sy = touchStartYRef.current
    touchStartXRef.current = null
    touchStartYRef.current = null
    if (sx === null || sy === null) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - sx
    const dy = touch.clientY - sy
    if (!mobileNavOpen && sx <= 32 && dx > 44 && Math.abs(dy) < 56) {
      setMobileNavOpen(true)
    } else if (mobileNavOpen && dx < -44 && Math.abs(dy) < 56) {
      setMobileNavOpen(false)
    }
  }

  const mobileSidebar = (
    <aside
      className={`vng-mobile-drawer lg:hidden ${mobileNavOpen ? 'vng-mobile-drawer--open' : ''}`}
      aria-hidden={!mobileNavOpen}
      onTouchStart={handleMobileSwipeStart}
      onTouchEnd={handleMobileSwipeEnd}
    >
      <div className="vng-mobile-drawer__head">
        <span className="text-xs font-bold uppercase tracking-wider">Панель комнаты</span>
        <Button type="button" size="sm" variant="secondary" onClick={() => setMobileNavOpen(false)}>
          Закрыть
        </Button>
      </div>
      <div className="vng-mobile-drawer__zoom">
        <span className="text-xs uppercase tracking-wider text-vng-muted">Масштаб интерфейса</span>
        <div className="flex gap-2">
          {[0.9, 1, 1.15, 1.3].map((value) => (
            <button
              key={value}
              type="button"
              className={`vng-tui-btn text-xs ${Math.abs(mobileUiScale - value) < 0.01 ? 'vng-tui-btn--active' : ''}`}
              onClick={() => setMobileUiScale(value)}
            >
              {Math.round(value * 100)}%
            </button>
          ))}
        </div>
      </div>
      <div className="vng-mobile-drawer__tabs">
        {session.isGm ? (
          <GmTabBar
            active={gmTab}
            onChange={(next) => {
              setGmTab(next)
              setMobileNavOpen(false)
            }}
            showEncounter={showEncounterTab}
            showVote={showVoteTab}
          />
        ) : (
          <PlayerTabBar
            active={playerTab}
            onChange={(next) => {
              setPlayerTab(next)
              setMobileNavOpen(false)
            }}
            showEncounter={showEncounterTab}
            showVote={showVoteTab}
          />
        )}
      </div>
      <div className="vng-mobile-drawer__content">
        {playerRoster}
        {sideFeed}
      </div>
    </aside>
  )

  const voteView = activePoll && (
    <div className={tabPanelClassMobile}>
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
      <div className={`${tabPanelClassMobile} vng-retro-tab-content`}>
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
      mobileUiScale={mobileUiScale}
    >
      <RoomHud
        roomName={room?.name ?? 'Комната'}
        sessionStartMs={sessionStartMs}
        connected={connected}
        playerCount={players.filter((p) => !p.is_gm).length}
        playerName={session.playerName}
        isGm={session.isGm}
        levelLabel={levelLabel}
        copied={copied}
        onCopy={handleCopy}
        onLeave={handleLeave}
        themeOpen={themePanelOpen}
        showThemeToggle={session.isGm || allowPlayerThemeEditing}
        onToggleTheme={() => setThemePanelOpen((v) => !v)}
      />

      {themePanelOpen && (
        <div className="shrink-0 z-30 px-2 sm:px-3 py-2 border-b border-vng-border max-w-[1600px] w-full mx-auto overflow-x-hidden">
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
      <RoomVoiceChat
        sessionPlayerId={session.playerId}
        isGm={session.isGm}
        players={players}
        characters={characters}
        voiceBlockedPlayerIds={voiceBlockedPlayerIds}
        onSetPlayerVoiceAllowed={setPlayerVoiceAllowed}
        onSendVoiceSignal={sendVoiceSignal}
        onVoiceSignal={onVoiceSignal}
      />

      <div
        className="lg:hidden shrink-0 max-w-[1600px] w-full mx-auto px-2 sm:px-3 pb-2 overflow-x-hidden"
        onTouchStart={handleMobileSwipeStart}
        onTouchEnd={handleMobileSwipeEnd}
      >
        <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => setMobileNavOpen(true)}>
          <Menu size={16} /> Меню комнаты (вкладки / чат / игроки)
        </Button>
      </div>

      {!mobileNavOpen && (
        <div
          className="vng-mobile-edge-swipe lg:hidden"
          onTouchStart={handleMobileSwipeStart}
          onTouchEnd={handleMobileSwipeEnd}
          aria-hidden
        />
      )}
      {mobileNavOpen && <div className="vng-mobile-drawer__backdrop lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      {mobileSidebar}

      <main className="flex flex-1 flex-col min-h-0 max-w-[1600px] w-full mx-auto px-2 sm:px-3 py-2 sm:py-3 overflow-x-hidden">
        <RoomMainLayout
          encounterBanner={encounterBanner}
          roster={<div className="hidden lg:flex h-full">{playerRoster}</div>}
          sideFeed={<div className="hidden lg:flex h-full">{sideFeed}</div>}
        >
          <div className="flex flex-1 flex-col min-h-0 overflow-y-auto overflow-x-hidden lg:overflow-hidden">
          {session.isGm ? (
            <>
              {gmTab === 'players' && (
                <div className={`${tabPanelClassMobile} gap-3`}>
                  <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
                    <GmPlayerSheets
                      players={players}
                      characters={characters}
                      onSave={saveCharacter}
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
                <div className={tabPanelClassMobile}>
                  <DiceRoller onRoll={rollDice} fillHeight {...diceRollerProps} />
                </div>
              )}
              {gmTab === 'tops' && topsView}
              {gmTab === 'vote' && voteView}
              {gmTab === 'gm' && (
                <div className={`${tabPanelClassMobile} gap-3`}>
                  <div className="flex-1 min-h-0 lg:overflow-y-auto flex flex-col gap-3">
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
                      levelId={levelId}
                      levelVariant={levelVariant}
                      onSetLevelPreset={setLevelPreset}
                      showLevelToPlayers={showLevelToPlayers}
                      onSetShowLevelToPlayers={setShowLevelToPlayers}
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
                <div className={tabPanelClassMobile}>
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
                <div className={tabPanelClassMobile}>
                  <DiceRoller onRoll={rollDice} fillHeight {...diceRollerProps} />
                </div>
              )}
              {playerTab === 'tops' && topsView}
              {playerTab === 'vote' && voteView}
            </>
          )}
          <div className="hidden lg:block">
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
          </div>
        </RoomMainLayout>
      </main>

      {showGmPanel && session.isGm && room && (
        <GMPanel
          players={players}
          characters={characters}
          currentGmId={session.playerId}
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
