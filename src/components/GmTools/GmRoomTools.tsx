import { useEffect, useMemo, useState } from 'react'
import { FlashlightOff, Flashlight, Music, Vote, MessageSquareQuote } from 'lucide-react'
import type { Player, RoomMusic, RoomTheme } from '@/types'
import { apiGetPlaylistEntries, type PlaylistEntry } from '@/lib/api'
import { parseYoutubeVideoId } from '@/lib/youtube'
import { LEVEL_PRESETS, type LevelVariant } from '@/lib/levels'
import { ThemeColorEditor } from '@/components/RoomTheme/ThemeColorEditor'
import { Button, Input, Textarea } from '@/components/ui/Button'

interface GmRoomToolsProps {
  players: Player[]
  roomTheme: RoomTheme
  music: RoomMusic
  onSetTheme: (target: 'all' | string, theme: RoomTheme, clearOverrides?: boolean) => void
  onClearPlayerTheme: (playerId: string) => void
  onSetMusic: (url: string | null, playing: boolean) => void
  onStartPoll: (question: string, options: string[], durationSec?: number) => void
  onShowScreenMessage: (opts: { title: string; text: string; targetPlayerId: string | null }) => void
  onDismissScreenMessage: () => void
  hasScreenMessage: boolean
  stageDarkness: number
  onSetStageDarkness: (value: number) => void
  flashlightsEnabledFor: string[]
  onSetPlayerFlashlight: (playerId: string, enabled: boolean) => void
  allowPlayerThemeEditing: boolean
  onSetAllowPlayerThemeEditing: (enabled: boolean) => void
  levelId: string | null
  levelVariant: LevelVariant
  onSetLevelPreset: (levelId: string | null, variant: LevelVariant) => void
  showLevelToPlayers: boolean
  onSetShowLevelToPlayers: (show: boolean) => void
}

export function GmRoomTools({
  players,
  roomTheme,
  music,
  onSetTheme,
  onClearPlayerTheme,
  onSetMusic,
  onStartPoll,
  onShowScreenMessage,
  onDismissScreenMessage,
  hasScreenMessage,
  stageDarkness,
  onSetStageDarkness,
  flashlightsEnabledFor,
  onSetPlayerFlashlight,
  allowPlayerThemeEditing,
  onSetAllowPlayerThemeEditing,
  levelId,
  levelVariant,
  onSetLevelPreset,
  showLevelToPlayers,
  onSetShowLevelToPlayers,
}: GmRoomToolsProps) {
  const PLAYLIST_DRAFT_STORAGE_KEY = 'vng_gm_playlist_draft_v1'
  const roster = players.filter((p) => !p.is_gm)
  const [themeTarget, setThemeTarget] = useState<'all' | string>('all')
  const [musicUrl, setMusicUrl] = useState(music.url ?? '')
  const [pollQ, setPollQ] = useState('')
  const [pollOpts, setPollOpts] = useState('Да\nНет')
  const [pollTimerSec, setPollTimerSec] = useState('0')
  const [msgTitle, setMsgTitle] = useState('')
  const [msgText, setMsgText] = useState('')
  const [msgTarget, setMsgTarget] = useState<'all' | string>('all')
  const [playlistUrl, setPlaylistUrl] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)
      if (!raw) return ''
      const parsed = JSON.parse(raw) as { playlistUrl?: string }
      return String(parsed.playlistUrl ?? '')
    } catch {
      return ''
    }
  })
  const [playlistEntries, setPlaylistEntries] = useState<PlaylistEntry[]>(() => {
    try {
      const raw = window.localStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { playlistEntries?: PlaylistEntry[] }
      return Array.isArray(parsed.playlistEntries) ? parsed.playlistEntries : []
    } catch {
      return []
    }
  })
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistLoadingMore, setPlaylistLoadingMore] = useState(false)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [selectedPlaylistTrackUrl, setSelectedPlaylistTrackUrl] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)
      if (!raw) return ''
      const parsed = JSON.parse(raw) as { selectedPlaylistTrackUrl?: string }
      return String(parsed.selectedPlaylistTrackUrl ?? '')
    } catch {
      return ''
    }
  })
  const [playlistSearch, setPlaylistSearch] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)
      if (!raw) return ''
      const parsed = JSON.parse(raw) as { playlistSearch?: string }
      return String(parsed.playlistSearch ?? '')
    } catch {
      return ''
    }
  })
  const [playlistShuffle, setPlaylistShuffle] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw) as { playlistShuffle?: boolean }
      return Boolean(parsed.playlistShuffle)
    } catch {
      return false
    }
  })
  const [playlistLoop, setPlaylistLoop] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)
      if (!raw) return true
      const parsed = JSON.parse(raw) as { playlistLoop?: boolean }
      return parsed.playlistLoop !== false
    } catch {
      return true
    }
  })
  const [playlistNextCursor, setPlaylistNextCursor] = useState<string | null>(() => {
    try {
      const raw = window.localStorage.getItem(PLAYLIST_DRAFT_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { playlistNextCursor?: string | null }
      const value = String(parsed.playlistNextCursor ?? '').trim()
      return value || null
    } catch {
      return null
    }
  })
  const selectedLevel = LEVEL_PRESETS.find((level) => level.id === levelId) ?? null

  const filteredPlaylistEntries = useMemo(() => {
    const query = playlistSearch.trim().toLowerCase()
    if (!query) return playlistEntries
    return playlistEntries.filter((entry) => {
      const title = String(entry.title ?? '').toLowerCase()
      const id = String(entry.id ?? '').toLowerCase()
      return title.includes(query) || id.includes(query)
    })
  }, [playlistEntries, playlistSearch])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PLAYLIST_DRAFT_STORAGE_KEY,
        JSON.stringify({
          playlistUrl,
          selectedPlaylistTrackUrl,
          playlistEntries,
          playlistSearch,
          playlistShuffle,
          playlistLoop,
          playlistNextCursor,
        })
      )
    } catch {
      /* ignore storage errors */
    }
  }, [playlistUrl, selectedPlaylistTrackUrl, playlistEntries, playlistSearch, playlistShuffle, playlistLoop, playlistNextCursor])

  const videoPreview = parseYoutubeVideoId(musicUrl)
  const isDirectAudio = /\.(mp3|ogg|opus|wav|m4a|aac|flac|webm)(\?|$)/i.test(musicUrl.trim())

  async function handleLoadPlaylist() {
    const url = playlistUrl.trim()
    if (!url) return
    setPlaylistLoading(true)
    setPlaylistError(null)
    try {
      const result = await apiGetPlaylistEntries(url)
      setPlaylistEntries(result.entries)
      setPlaylistNextCursor(result.next_cursor ?? null)
      const firstUrl = result.entries[0]?.url ?? ''
      setSelectedPlaylistTrackUrl(firstUrl)
      if (firstUrl) setMusicUrl(firstUrl)
      if (!result.entries.length) {
        setPlaylistError('Плейлист пустой или не удалось прочитать треки')
      }
    } catch (err) {
      setPlaylistEntries([])
      setSelectedPlaylistTrackUrl('')
      setPlaylistNextCursor(null)
      setPlaylistError(err instanceof Error ? err.message : 'Не удалось загрузить плейлист')
    } finally {
      setPlaylistLoading(false)
    }
  }

  async function handleLoadMorePlaylist() {
    const url = playlistUrl.trim()
    if (!url || !playlistNextCursor || playlistLoading || playlistLoadingMore) return
    setPlaylistLoadingMore(true)
    try {
      const result = await apiGetPlaylistEntries(url, playlistNextCursor)
      setPlaylistEntries((prev) => {
        if (!result.entries.length) return prev
        const next = [...prev]
        const seen = new Set(prev.map((entry) => `${entry.id}::${entry.url}`))
        for (const entry of result.entries) {
          const key = `${entry.id}::${entry.url}`
          if (seen.has(key)) continue
          seen.add(key)
          next.push(entry)
        }
        return next
      })
      setPlaylistNextCursor(result.next_cursor ?? null)
    } catch (err) {
      setPlaylistError(err instanceof Error ? err.message : 'Не удалось догрузить плейлист')
      setPlaylistNextCursor(null)
    } finally {
      setPlaylistLoadingMore(false)
    }
  }

  function chooseNextPlaylistTrack() {
    if (filteredPlaylistEntries.length === 0) return null
    if (playlistShuffle) {
      if (filteredPlaylistEntries.length === 1) return filteredPlaylistEntries[0]
      const currentIndex = filteredPlaylistEntries.findIndex((entry) => entry.url === selectedPlaylistTrackUrl)
      let nextIndex = Math.floor(Math.random() * filteredPlaylistEntries.length)
      if (currentIndex >= 0 && nextIndex === currentIndex) {
        nextIndex = (nextIndex + 1) % filteredPlaylistEntries.length
      }
      return filteredPlaylistEntries[nextIndex]
    }
    const currentIndex = filteredPlaylistEntries.findIndex((entry) => entry.url === selectedPlaylistTrackUrl)
    if (currentIndex < 0) return filteredPlaylistEntries[0]
    const nextIndex = currentIndex + 1
    if (nextIndex < filteredPlaylistEntries.length) return filteredPlaylistEntries[nextIndex]
    if (playlistLoop) return filteredPlaylistEntries[0]
    return null
  }

  return (
    <div className="flex flex-col gap-4 shrink-0">
      <ThemeColorEditor
        title="Цвета для комнаты (мастер)"
        initial={roomTheme}
        defaultDraft={roomTheme}
        onApply={(theme) => {
          if (themeTarget === 'all') onSetTheme('all', theme, true)
          else onSetTheme(themeTarget, theme)
        }}
        showTargetSelect={
          <select
            value={themeTarget}
            onChange={(e) => setThemeTarget(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-vng-bg border border-vng-border"
          >
            <option value="all">Для всех в комнате</option>
            {roster.map((p) => (
              <option key={p.id} value={p.id}>
                Только для: {p.name}
              </option>
            ))}
          </select>
        }
        extraActions={
          themeTarget !== 'all' ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onClearPlayerTheme(themeTarget)}>
              Убрать личные у игрока
            </Button>
          ) : undefined
        }
      />
      <section className="vng-panel p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-vng-muted">Личные цвета игроков</h3>
        <p className="text-xs text-vng-muted">
          Когда отключено, игроки не могут менять или сбрасывать свои персональные цвета.
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-vng-muted">
            Сейчас: {allowPlayerThemeEditing ? 'игрокам разрешено менять цвета' : 'личные цвета игроков заблокированы'}
          </span>
          <Button
            type="button"
            size="sm"
            variant={allowPlayerThemeEditing ? 'secondary' : 'ghost'}
            onClick={() => onSetAllowPlayerThemeEditing(!allowPlayerThemeEditing)}
          >
            {allowPlayerThemeEditing ? 'Запретить' : 'Разрешить'}
          </Button>
        </div>
      </section>

      <section className="vng-panel p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-vng-muted">Уровень сцены</h3>
        <select
          value={levelId ?? ''}
          onChange={(e) => onSetLevelPreset(e.target.value || null, levelVariant)}
          className="w-full px-2 py-1.5 text-sm bg-vng-bg border border-vng-border"
        >
          <option value="">Без выбранного уровня</option>
          {LEVEL_PRESETS.map((level) => (
            <option key={level.id} value={level.id}>
              {level.title} ({level.altTitle})
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-vng-muted shrink-0">Режим:</span>
          <select
            value={levelVariant}
            onChange={(e) => onSetLevelPreset(levelId, (e.target.value === 'alt' ? 'alt' : 'main'))}
            className="flex-1 px-2 py-1.5 text-sm bg-vng-bg border border-vng-border"
          >
            <option value="main">Основная сцена</option>
            <option value="alt">Альтернатива</option>
          </select>
        </div>
        <p className="text-[11px] text-vng-muted">
          Выбор уровня больше не меняет цвета автоматически. Цвета настраиваются вручную в блоке выше.
        </p>
        {selectedLevel && (
          <div className="border border-vng-border bg-vng-bg/50 p-2">
            <p className="text-xs text-vng-muted">Выбранный уровень:</p>
            <p className="text-xs leading-relaxed break-words">
              {selectedLevel.title || '—'}
              {selectedLevel.altTitle ? ` (${selectedLevel.altTitle})` : ''}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-vng-border">
          <span className="text-xs text-vng-muted">Показывать уровень игрокам</span>
          <Button
            type="button"
            size="sm"
            variant={showLevelToPlayers ? 'secondary' : 'ghost'}
            onClick={() => onSetShowLevelToPlayers(!showLevelToPlayers)}
          >
            {showLevelToPlayers ? 'ВКЛ' : 'ВЫКЛ'}
          </Button>
        </div>
      </section>

      <section className="vng-panel p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-vng-muted flex items-center gap-1.5">
          <Music size={14} className="text-vng-amber" /> Музыка (YouTube)
        </h3>
        <input
          value={musicUrl}
          onChange={(e) => setMusicUrl(e.target.value)}
          placeholder="YouTube / YouTube Music или прямая ссылка .mp3…"
          className="w-full px-3 py-2 text-sm bg-vng-bg border border-vng-border focus:outline-none focus:border-vng-blue/50"
        />
        {(videoPreview || isDirectAudio) && (
          <p className="text-xs text-vng-green font-mono">
            {isDirectAudio ? 'Прямой аудиофайл' : `YouTube ID: ${videoPreview}`}
          </p>
        )}
        <p className="text-xs text-vng-muted">
          YouTube теперь запускается у игроков напрямую (embed), чтобы не зависеть от потока хоста.
          Прямые аудиофайлы (.mp3/.ogg) всё ещё идут через <strong className="text-vng-amber">сервер хоста</strong>.
          Для стабильности используйте YouTube ссылки или прямую ссылку на .mp3 / .ogg.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!videoPreview && !isDirectAudio}
            onClick={() => onSetMusic(musicUrl, true)}
          >
            ▶ Включить
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onSetMusic(musicUrl || null, false)}>
            Пауза
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setMusicUrl(''); onSetMusic(null, false) }}>
            Стоп
          </Button>
        </div>
        <div className="border-t border-vng-border pt-2 space-y-2">
          <Input
            label="Плейлист (YouTube URL)"
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://www.youtube.com/playlist?list=..."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void handleLoadPlaylist()} disabled={!playlistUrl.trim() || playlistLoading}>
              {playlistLoading ? 'Загрузка...' : 'Загрузить треки'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={playlistShuffle ? 'secondary' : 'ghost'}
              onClick={() => setPlaylistShuffle((v) => !v)}
              disabled={playlistLoading || playlistLoadingMore || playlistEntries.length === 0}
            >
              Перемешать: {playlistShuffle ? 'ВКЛ' : 'ВЫКЛ'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={playlistLoop ? 'secondary' : 'ghost'}
              onClick={() => setPlaylistLoop((v) => !v)}
              disabled={playlistLoading || playlistLoadingMore || playlistEntries.length === 0}
            >
              Цикл: {playlistLoop ? 'ВКЛ' : 'ВЫКЛ'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setPlaylistEntries([])
                setSelectedPlaylistTrackUrl('')
                setPlaylistNextCursor(null)
                setPlaylistError(null)
              }}
              disabled={playlistLoading || playlistLoadingMore || playlistEntries.length === 0}
            >
              Очистить список
            </Button>
          </div>
          {playlistError && <p className="text-xs text-vng-danger">{playlistError}</p>}
          {playlistEntries.length > 0 && (
            <>
              <Input
                label={`Поиск в плейлисте (${filteredPlaylistEntries.length} из ${playlistEntries.length})`}
                value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                placeholder="Искать по названию или ID"
              />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-vng-muted uppercase">Трек из плейлиста</span>
                <select
                  className="w-full px-2 py-1.5 text-sm bg-vng-bg border border-vng-border"
                  value={selectedPlaylistTrackUrl}
                  onChange={(e) => {
                    const next = e.target.value
                    setSelectedPlaylistTrackUrl(next)
                    setMusicUrl(next)
                  }}
                >
                  {filteredPlaylistEntries.map((entry) => (
                    <option key={entry.id} value={entry.url}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="max-h-72 overflow-y-auto border border-vng-border bg-vng-bg/50 p-2 space-y-2"
                onScroll={(e) => {
                  const el = e.currentTarget
                  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 64
                  if (nearBottom) void handleLoadMorePlaylist()
                }}
              >
                {filteredPlaylistEntries.map((entry) => {
                  const selected = selectedPlaylistTrackUrl === entry.url
                  return (
                    <button
                      key={`${entry.id}-card`}
                      type="button"
                      onClick={() => {
                        setSelectedPlaylistTrackUrl(entry.url)
                        setMusicUrl(entry.url)
                      }}
                      className={`w-full text-left p-2 border flex items-center gap-2 ${
                        selected ? 'border-vng-blue bg-vng-blue/10' : 'border-vng-border hover:bg-vng-elevated'
                      }`}
                    >
                      {entry.thumbnail_url ? (
                        <img
                          src={entry.thumbnail_url}
                          alt={entry.title}
                          className="w-20 h-12 object-cover border border-vng-border shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-20 h-12 border border-vng-border shrink-0 flex items-center justify-center text-[10px] text-vng-muted">
                          no preview
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{entry.title}</p>
                        <p className="text-[10px] text-vng-muted truncate">{entry.id}</p>
                      </div>
                    </button>
                  )
                })}
                {playlistLoadingMore && (
                  <p className="text-[11px] text-vng-muted px-1">Подгружаю ещё треки...</p>
                )}
                {!playlistLoadingMore && playlistNextCursor && (
                  <p className="text-[11px] text-vng-muted px-1">Прокрутите вниз, чтобы подгрузить ещё</p>
                )}
                {!playlistLoadingMore && !playlistNextCursor && playlistEntries.length > 0 && (
                  <p className="text-[11px] text-vng-muted px-1">Загружены все доступные треки</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!selectedPlaylistTrackUrl) return
                    setMusicUrl(selectedPlaylistTrackUrl)
                    onSetMusic(selectedPlaylistTrackUrl, true)
                  }}
                  disabled={!selectedPlaylistTrackUrl}
                >
                  ▶ Включить выбранный трек
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const nextEntry = chooseNextPlaylistTrack()
                    if (!nextEntry) return
                    setSelectedPlaylistTrackUrl(nextEntry.url)
                    setMusicUrl(nextEntry.url)
                    onSetMusic(nextEntry.url, true)
                  }}
                  disabled={filteredPlaylistEntries.length === 0}
                >
                  Следующий ({playlistShuffle ? 'случайно' : playlistLoop ? 'с циклом' : 'по порядку'})
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="vng-panel p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-vng-muted flex items-center gap-1.5">
          <Vote size={14} className="text-vng-blue" /> Голосование
        </h3>
        <Input label="Вопрос" value={pollQ} onChange={(e) => setPollQ(e.target.value)} placeholder="Куда идём?" />
        <Textarea
          label="Варианты (по строке)"
          value={pollOpts}
          onChange={(e) => setPollOpts(e.target.value)}
          rows={3}
        />
        <Input
          label="Таймер (секунды, 0 = без лимита)"
          type="number"
          min={0}
          max={7200}
          value={pollTimerSec}
          onChange={(e) => setPollTimerSec(e.target.value)}
          placeholder="0"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => onStartPoll(pollQ, pollOpts.split('\n'), Math.max(0, Number(pollTimerSec) || 0))}
          disabled={!pollQ.trim()}
        >
          Запустить
        </Button>
      </section>

      <section className="vng-panel p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-vng-muted">Ландшафт и свет</h3>
        <p className="text-xs text-vng-muted">
          100% = полный свет, 0% = чёрный экран.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-vng-muted shrink-0">Свет:</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={stageDarkness}
            onChange={(e) => onSetStageDarkness(Number(e.target.value))}
            className="flex-1"
            aria-label="Затемнение сцены"
          />
          <span className="text-xs vng-mono w-10 text-right">{stageDarkness}%</span>
        </div>
        <p className="text-[11px] text-vng-muted">
          Сейчас: {stageDarkness === 100 ? 'полный свет' : stageDarkness === 0 ? 'чёрный экран' : 'приглушено'}
        </p>
        <div className="border-t border-vng-border pt-2">
          <p className="text-xs text-vng-muted mb-2">Фонарики игроков:</p>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {roster.map((p) => {
              const enabled = flashlightsEnabledFor.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  className="flex items-center justify-between px-2 py-1 border border-vng-border text-xs bg-vng-bg hover:bg-vng-elevated"
                  onClick={() => onSetPlayerFlashlight(p.id, !enabled)}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 flex items-center gap-1 text-vng-muted">
                    {enabled ? <Flashlight size={12} /> : <FlashlightOff size={12} />}
                    {enabled ? 'ВКЛ' : 'ВЫКЛ'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <section className="vng-panel p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-vng-muted flex items-center gap-1.5">
          <MessageSquareQuote size={14} className="text-vng-amber" /> Сообщение на экран
        </h3>
        <select
          value={msgTarget}
          onChange={(e) => setMsgTarget(e.target.value)}
          className="w-full px-2 py-1.5 text-sm bg-vng-bg border border-vng-border"
        >
          <option value="all">Всем</option>
          {roster.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Input label="Заголовок" value={msgTitle} onChange={(e) => setMsgTitle(e.target.value)} placeholder="Необязательно" />
        <Textarea label="Текст" value={msgText} onChange={(e) => setMsgText(e.target.value)} rows={3} placeholder="Текст на весь экран…" />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!msgText.trim()}
            onClick={() => {
              onShowScreenMessage({
                title: msgTitle,
                text: msgText,
                targetPlayerId: msgTarget === 'all' ? null : msgTarget,
              })
              setMsgText('')
            }}
          >
            Показать
          </Button>
          {hasScreenMessage && (
            <Button type="button" size="sm" variant="secondary" onClick={onDismissScreenMessage}>
              Скрыть
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
