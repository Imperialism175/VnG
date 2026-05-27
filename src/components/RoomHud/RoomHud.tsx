import { SessionTimer } from '@/components/RoomHud/SessionTimer'
import { Button } from '@/components/ui/Button'

interface RoomHudProps {
  roomName: string
  sessionStartMs: number
  connected: boolean
  playerCount: number
  playerName: string
  isGm: boolean
  levelLabel?: string | null
  copied: boolean
  onCopy: () => void
  onLeave: () => void
  themeOpen?: boolean
  showThemeToggle?: boolean
  onToggleTheme?: () => void
}

export function RoomHud({
  roomName,
  sessionStartMs,
  connected,
  playerCount,
  playerName,
  isGm,
  levelLabel,
  copied,
  onCopy,
  onLeave,
  themeOpen,
  showThemeToggle = true,
  onToggleTheme,
}: RoomHudProps) {
  return (
    <header className="vng-retro-header vng-dos-hud shrink-0 z-40" aria-label="Панель сессии">
      <div className="vng-dos-hud__grid max-w-[1600px] mx-auto">
        <div className="vng-dos-hud__row vng-dos-hud__row--primary">
          <span className="vng-dos-hud__brand">ВнГ</span>
          <span className="vng-dos-hud__sep" aria-hidden>
            │
          </span>
          <div className="vng-dos-hud__pair vng-dos-hud__pair--timer">
            <span className="vng-dos-hud__label">Сессия</span>
            <SessionTimer startMs={sessionStartMs} />
          </div>
          <span className="vng-dos-hud__sep" aria-hidden>
            │
          </span>
          <div className="vng-dos-hud__pair vng-dos-hud__pair--room min-w-0 flex-1">
            <span className="vng-dos-hud__label">Комната</span>
            <span className="vng-dos-hud__value truncate">{roomName}</span>
          </div>
        </div>

        <div className="vng-dos-hud__row vng-dos-hud__row--secondary">
          <div className="vng-dos-hud__pair">
            <span className="vng-dos-hud__label">Сеть</span>
            <span
              className={`vng-dos-hud__value ${connected ? 'vng-dos-hud__status--ok' : 'vng-dos-hud__status--err'}`}
            >
              {connected ? 'подключено' : 'нет связи'}
            </span>
          </div>
          <span className="vng-dos-hud__sep" aria-hidden>
            │
          </span>
          <div className="vng-dos-hud__pair">
            <span className="vng-dos-hud__label">Игроков</span>
            <span className="vng-dos-hud__value">{playerCount}</span>
          </div>
          <span className="vng-dos-hud__sep" aria-hidden>
            │
          </span>
          <div className="vng-dos-hud__pair min-w-0">
            <span className="vng-dos-hud__label">Вы</span>
            <span className="vng-dos-hud__value truncate max-w-[10rem]">{playerName}</span>
          </div>
          {levelLabel ? (
            <>
              <span className="vng-dos-hud__sep" aria-hidden>
                │
              </span>
              <div className="vng-dos-hud__pair min-w-0">
                <span className="vng-dos-hud__label">Уровень</span>
                <span className="vng-dos-hud__value truncate max-w-[14rem]">{levelLabel}</span>
              </div>
            </>
          ) : null}
          <div className="vng-dos-hud__actions ml-auto flex items-center gap-2 shrink-0">
            {onToggleTheme && showThemeToggle && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="vng-tui-btn vng-tui-btn--ghost text-xs"
                aria-expanded={themeOpen}
              >
                {themeOpen ? 'Скрыть цвета' : 'Цвета'}
              </button>
            )}
            {isGm && (
              <button type="button" onClick={onCopy} className="vng-tui-btn vng-tui-btn--ghost text-xs">
                {copied ? 'Скопировано' : 'Пригласить'}
              </button>
            )}
            <Button size="sm" variant="ghost" onClick={onLeave} className="shrink-0">
              Выйти
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
