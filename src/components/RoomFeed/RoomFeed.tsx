import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollText } from 'lucide-react'
import type { ChatMessage, FeedItem, FeedTab, RollEvent } from '@/types'
import { formatRollFeedLine } from '@/lib/rollFeed'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { animatePremiumTabPane } from '@/lib/premiumUx/premiumMotion'

interface RoomFeedProps {
  rollEvents: RollEvent[]
  chatMessages: ChatMessage[]
  onSendChat: (text: string) => void
  gmPlayerId?: string
  disabled?: boolean
  fillHeight?: boolean
}

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'rolls', label: 'Броски' },
  { id: 'chat', label: 'Чат' },
]

function parseRollValues(event: RollEvent): number[] {
  const m = event.details.match(/\[([^\]]+)\]/)
  if (!m) return [event.total]
  return m[1]
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
}

function isCritRoll(event: RollEvent): boolean {
  if (!/d20\b/i.test(event.expression)) return false
  return parseRollValues(event).some((v) => v === 20)
}

function isNat1(event: RollEvent): boolean {
  if (!/d20\b/i.test(event.expression)) return false
  return parseRollValues(event).some((v) => v === 1)
}

export function RoomFeed({ rollEvents, chatMessages, onSendChat, gmPlayerId, disabled, fillHeight }: RoomFeedProps) {
  const [tab, setTab] = useState<FeedTab>('all')
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const feedPaneRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  const items = useMemo<FeedItem[]>(() => {
    const rolls: FeedItem[] = rollEvents.map((data) => ({ kind: 'roll', data }))
    const chats: FeedItem[] = chatMessages.map((data) => ({ kind: 'chat', data }))
    return [...rolls, ...chats].sort((a, b) => {
      const ta = a.kind === 'roll' ? a.data.created_at : a.data.created_at
      const tb = b.kind === 'roll' ? b.data.created_at : b.data.created_at
      return ta.localeCompare(tb)
    })
  }, [rollEvents, chatMessages])

  const filtered = useMemo(() => {
    if (tab === 'rolls') return items.filter((i) => i.kind === 'roll')
    if (tab === 'chat') return items.filter((i) => i.kind === 'chat')
    return items
  }, [items, tab])

  useEffect(() => {
    animatePremiumTabPane(feedPaneRef.current)
  }, [tab])

  useEffect(() => {
    if (stickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filtered.length, tab])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || disabled) return
    onSendChat(text)
    setDraft('')
    stickToBottom.current = true
  }

  return (
    <Panel
      title={fillHeight ? 'Лента' : 'Лента комнаты'}
      icon={fillHeight ? undefined : <ScrollText size={16} />}
      fillHeight={fillHeight}
      className={`vng-terminal-panel ${fillHeight ? 'vng-room-feed-panel h-full min-h-0' : 'max-h-[min(70vh,520px)] lg:max-h-[520px]'}`}
      action={
        <div className="vng-terminal-tabs vng-terminal-tabs--feed flex shrink-0" role="tablist" aria-label="Фильтр ленты">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={tab === id ? 'vng-tab--active font-bold' : 'text-vng-muted'}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div
        ref={feedPaneRef}
        className="vng-feed-tab-pane flex flex-1 min-h-0 flex-col overflow-hidden"
      >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="vng-feed-scroll flex-1 min-h-0 overflow-y-auto flex flex-col gap-1"
      >
        {filtered.length === 0 ? (
          <p className="text-sm text-vng-muted py-6">
            <span className="vng-dos-prompt vng-dos-prompt--cmd" />
            {tab === 'chat'
              ? 'Сообщений пока нет — напишите в поле ниже'
              : tab === 'rolls'
                ? 'Бросков пока нет — откройте вкладку «Кубы»'
                : 'Лента пуста — бросьте куб или напишите в чат'}
          </p>
        ) : (
          filtered.map((item) =>
            item.kind === 'roll' ? (
              <RollLine key={`r-${item.data.id}`} event={item.data} gmPlayerId={gmPlayerId} />
            ) : (
              <ChatLine key={`c-${item.data.id}`} message={item.data} />
            )
          )
        )}
      </div>
      </div>

      <form onSubmit={handleSend} className="vng-dos-chat-input-wrap shrink-0 mt-0">
        <span className="vng-dos-prompt vng-dos-prompt--cmd" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="сообщение в чат…"
          disabled={disabled}
          maxLength={500}
          className="vng-terminal-input flex-1 text-sm disabled:opacity-100"
          aria-label="Ввод сообщения"
        />
        <span className="vng-dos-cursor" aria-hidden>
          _
        </span>
        <Button type="submit" size="sm" disabled={disabled || !draft.trim()}>
          Отправить
        </Button>
      </form>
    </Panel>
  )
}

function RollLine({ event, gmPlayerId }: { event: RollEvent; gmPlayerId?: string }) {
  const crit = isCritRoll(event)
  const fumble = isNat1(event)
  const line = formatRollFeedLine(event, gmPlayerId)

  return (
    <article
      className={`vng-feed-roll vng-terminal-line ${crit ? 'vng-feed-roll--crit' : ''} ${fumble ? 'vng-feed-roll--fumble' : ''}`}
    >
      <p className="vng-terminal-line__body text-sm leading-snug mb-0">
        <span className="vng-dos-prompt vng-dos-prompt--cmd" />
        <span>
          [{formatTime(event.created_at)}] {line}
        </span>
      </p>
    </article>
  )
}

function ChatLine({ message }: { message: ChatMessage }) {
  const isAnnounce = message.text.startsWith('📢')
  const body = isAnnounce ? message.text.replace(/^📢\s*/, '') : message.text

  return (
    <article className={`vng-feed-chat vng-terminal-line ${isAnnounce ? 'vng-feed-announce' : ''}`}>
      <p className="vng-terminal-line__body vng-terminal-line__body--chat text-sm">
        <span className="vng-dos-prompt vng-dos-prompt--cmd" />
        <span className="text-vng-muted shrink-0">{message.player_name.toUpperCase()}: </span>
        <span className="vng-chat-line__text">{body}</span>
      </p>
    </article>
  )
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
