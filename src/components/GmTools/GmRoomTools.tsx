import { useState } from 'react'
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
  const roster = players.filter((p) => !p.is_gm)
  const [themeTarget, setThemeTarget] = useState<'all' | string>('all')
  const [musicUrl, setMusicUrl] = useState(music.url ?? '')
  const [pollQ, setPollQ] = useState('')
  const [pollOpts, setPollOpts] = useState('Да\nНет')
  const [pollTimerSec, setPollTimerSec] = useState('0')
  const [msgTitle, setMsgTitle] = useState('')
  const [msgText, setMsgText] = useState('')
  const [msgTarget, setMsgTarget] = useState<'all' | string>('all')
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [playlistEntries, setPlaylistEntries] = useState<PlaylistEntry[]>([])
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [playlistError, setPlaylistError] = useState<string | null>(null)
  const [selectedPlaylistTrackUrl, setSelectedPlaylistTrackUrl] = useState('')

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
      const firstUrl = result.entries[0]?.url ?? ''
      setSelectedPlaylistTrackUrl(firstUrl)
      if (firstUrl) setMusicUrl(firstUrl)
    } catch (err) {
      setPlaylistEntries([])
      setSelectedPlaylistTrackUrl('')
      setPlaylistError(err instanceof Error ? err.message : 'Не удалось загрузить плейлист')
    } finally {
      setPlaylistLoading(false)
    }
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
          При выборе уровня цветовая палитра комнаты подстраивается автоматически.
        </p>
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
          Для host-proxy YouTube на хосте нужен{' '}
          <a
            className="text-vng-blue underline"
            href="https://github.com/yt-dlp/yt-dlp/releases"
            target="_blank"
            rel="noreferrer"
          >
            yt-dlp
          </a>
          . Или вставьте прямую ссылку на .mp3 / .ogg.
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
              variant="ghost"
              onClick={() => {
                setPlaylistEntries([])
                setSelectedPlaylistTrackUrl('')
                setPlaylistError(null)
              }}
              disabled={playlistLoading || playlistEntries.length === 0}
            >
              Очистить список
            </Button>
          </div>
          {playlistError && <p className="text-xs text-vng-danger">{playlistError}</p>}
          {playlistEntries.length > 0 && (
            <>
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
                  {playlistEntries.map((entry) => (
                    <option key={entry.id} value={entry.url}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </label>
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
