import { useState, useEffect, useCallback } from 'react'
import { getApiBase } from '@/lib/runtime'

interface Wish {
  id: string
  playerId: string
  playerName: string
  contact: string
  text: string
  offeredPrice: string
  finalPrice: string
  status: WishStatus
  adminNote: string
  createdAt: string
  updatedAt: string
  doneAt: string | null
  isRead: boolean
}

type WishStatus =
  | 'new'
  | 'negotiating'
  | 'paid'
  | 'in_progress'
  | 'done'
  | 'rejected'
  | 'refunded'

const STATUS_LABELS: Record<WishStatus, string> = {
  new: 'Новая',
  negotiating: 'Обсуждается',
  paid: 'Оплачено',
  in_progress: 'В работе',
  done: 'Выполнено',
  rejected: 'Отклонено',
  refunded: 'Возврат',
}

const STATUS_ORDER: WishStatus[] = [
  'new',
  'negotiating',
  'paid',
  'in_progress',
  'done',
  'rejected',
  'refunded',
]

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function premiumApiUrl(path: string): string {
  return `${getApiBase()}${path}`
}

// ─── Пользовательская часть ─────────────────────────────────────────────────

interface UserPremiumViewProps {
  playerId: string
  playerName: string
}

function UserPremiumView({ playerId, playerName }: UserPremiumViewProps) {
  const [wishes, setWishes] = useState<Wish[]>([])
  const [premiumInfo, setPremiumInfo] = useState<{
    is_premium: boolean
    wish_used: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [text, setText] = useState('')
  const [contact, setContact] = useState('')
  const [offeredPrice, setOfferedPrice] = useState('')

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(
        premiumApiUrl(`/api/premium/wish?playerId=${encodeURIComponent(playerId)}`)
      )
      const data = await res.json()
      if (data.ok) {
        setWishes(data.wishes ?? [])
        setPremiumInfo(data.premiumInfo ?? null)
      }
    } catch {
      // игнорируем ошибки загрузки
    } finally {
      setLoading(false)
    }
  }, [playerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeWish = wishes.find(
    (w) => !['rejected', 'refunded'].includes(w.status)
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (text.trim().length < 10) {
      setError('Желание слишком короткое — минимум 10 символов.')
      return
    }
    if (text.trim().length > 2000) {
      setError('Желание слишком длинное — максимум 2000 символов.')
      return
    }
    if (!contact.trim()) {
      setError('Укажите контакт для связи.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(premiumApiUrl(`/api/premium/wish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          playerName,
          text: text.trim(),
          contact: contact.trim(),
          offeredPrice: offeredPrice.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setSuccess(true)
        setText('')
        setContact('')
        setOfferedPrice('')
        await loadData()
      } else {
        setError(data.error ?? 'Ошибка при отправке.')
      }
    } catch {
      setError('Не удалось связаться с сервером.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <p className="text-vng-muted text-sm text-center py-6">Загрузка...</p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Статус текущей заявки */}
      {activeWish && (
        <div className="vng-panel p-3 border border-vng-accent/40 space-y-1">
          <p className="text-xs text-vng-muted uppercase tracking-widest">
            Ваше желание
          </p>
          <p className="text-sm font-mono break-words">
            «{escapeHtml(activeWish.text)}»
          </p>
          <div className="flex flex-wrap gap-3 mt-1">
            <span className="text-xs text-vng-muted">
              Статус:{' '}
              <span className="text-vng-accent font-bold">
                [ {STATUS_LABELS[activeWish.status]} ]
              </span>
            </span>
            {activeWish.finalPrice && (
              <span className="text-xs text-vng-muted">
                Цена:{' '}
                <span className="text-vng-accent">{activeWish.finalPrice}</span>
              </span>
            )}
          </div>
          {activeWish.adminNote && (
            <p className="text-xs text-vng-muted border-t border-vng-border pt-1 mt-1">
              Заметка: {escapeHtml(activeWish.adminNote)}
            </p>
          )}
          <p className="text-xs text-vng-muted">
            Отправлено:{' '}
            {new Date(activeWish.createdAt).toLocaleDateString('ru-RU')}
          </p>
        </div>
      )}

      {/* Значок премиума */}
      {premiumInfo?.is_premium && (
        <div className="flex items-center gap-2 text-yellow-400">
          <span className="text-lg">★</span>
          <span className="text-xs font-bold uppercase tracking-widest">
            {premiumInfo.wish_used ? 'Желание выполнено' : 'Премиум активен'}
          </span>
        </div>
      )}

      {/* Форма или сообщение об активной заявке */}
      {activeWish ? (
        <p className="text-xs text-vng-muted">
          Новую заявку можно отправить после закрытия текущей.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-vng-muted mb-1 uppercase tracking-widest">
              Ваше желание *
            </label>
            <textarea
              className="vng-input w-full min-h-[80px] resize-y text-sm font-mono"
              placeholder="Опишите подробно, что вы хотите (10–2000 символов)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              disabled={submitting}
            />
            <p className="text-right text-xs text-vng-muted mt-0.5">
              {text.length}/2000
            </p>
          </div>
          <div>
            <label className="block text-xs text-vng-muted mb-1 uppercase tracking-widest">
              Контакт для связи * (Telegram, e-mail)
            </label>
            <input
              className="vng-input w-full text-sm font-mono"
              placeholder="@nickname или email@example.com"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-xs text-vng-muted mb-1 uppercase tracking-widest">
              Предлагаемая цена (необязательно)
            </label>
            <input
              className="vng-input w-full text-sm font-mono"
              placeholder="Например: 200 руб., 5 USD..."
              value={offeredPrice}
              onChange={(e) => setOfferedPrice(e.target.value)}
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="text-xs text-red-400 border border-red-400/30 rounded p-2">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-green-400 border border-green-400/30 rounded p-2">
              Желание отправлено! С вами свяжутся по указанному контакту.
            </p>
          )}
          <button
            type="submit"
            className="vng-tui-btn vng-tui-btn--primary w-full"
            disabled={submitting}
          >
            {submitting ? 'Отправка...' : '[ ОТПРАВИТЬ ЖЕЛАНИЕ ]'}
          </button>
        </form>
      )}
    </div>
  )
}

// ─── Админ-панель ────────────────────────────────────────────────────────────

interface AdminPanelProps {
  playerId: string
}

function AdminPanel({ playerId }: AdminPanelProps) {
  const [wishes, setWishes] = useState<Wish[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState<WishStatus | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<WishStatus>('new')
  const [editFinalPrice, setEditFinalPrice] = useState('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(
        premiumApiUrl(`/api/premium/admin/wishes?adminId=${encodeURIComponent(playerId)}`)
      )
      const data = await res.json()
      if (data.ok) {
        setWishes(data.wishes ?? [])
        setUnreadCount(data.unreadCount ?? 0)
      } else {
        setError(data.error ?? 'Ошибка загрузки.')
      }
    } catch {
      setError('Не удалось связаться с сервером.')
    } finally {
      setLoading(false)
    }
  }, [playerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  function startEdit(w: Wish) {
    setEditingId(w.id)
    setEditStatus(w.status)
    setEditFinalPrice(w.finalPrice ?? '')
    setEditNote(w.adminNote ?? '')
  }

  async function saveEdit(wishId: string) {
    setSaving(true)
    try {
      const res = await fetch(
        premiumApiUrl(`/api/premium/admin/wish/${wishId}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminId: playerId,
            status: editStatus,
            finalPrice: editFinalPrice.trim() || undefined,
            adminNote: editNote.trim() || undefined,
          }),
        }
      )
      const data = await res.json()
      if (data.ok) {
        setEditingId(null)
        await loadData()
      } else {
        setError(data.error ?? 'Ошибка сохранения.')
      }
    } catch {
      setError('Не удалось сохранить.')
    } finally {
      setSaving(false)
    }
  }

  const filtered =
    filterStatus === 'all'
      ? wishes
      : wishes.filter((w) => w.status === filterStatus)

  if (loading) {
    return (
      <p className="text-vng-muted text-sm text-center py-6">Загрузка...</p>
    )
  }

  if (error) {
    return (
      <p className="text-xs text-red-400 border border-red-400/30 rounded p-2">
        {error}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-vng-muted uppercase tracking-widest">
          Заявок: {wishes.length}
          {unreadCount > 0 && (
            <span className="ml-2 text-yellow-400 font-bold">
              [ +{unreadCount} новых ]
            </span>
          )}
        </p>
        <button
          className="vng-tui-btn vng-tui-btn--ghost text-xs"
          onClick={loadData}
        >
          Обновить
        </button>
      </div>

      {/* Фильтр по статусу */}
      <div className="flex flex-wrap gap-1">
        {(['all', ...STATUS_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`vng-tui-btn text-xs ${filterStatus === s ? 'vng-tui-btn--primary' : 'vng-tui-btn--ghost'}`}
          >
            {s === 'all' ? 'Все' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-xs text-vng-muted text-center py-4">
          Нет заявок.
        </p>
      )}

      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {filtered.map((w) => (
          <div
            key={w.id}
            className={`vng-panel p-3 space-y-1 border ${!w.isRead ? 'border-yellow-400/40' : 'border-vng-border'}`}
          >
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <span className="text-xs font-bold text-vng-accent">
                {w.playerName}
              </span>
              <span className="text-xs text-vng-muted">
                {new Date(w.createdAt).toLocaleString('ru-RU')}
              </span>
              {!w.isRead && (
                <span className="text-xs text-yellow-400">● новая</span>
              )}
            </div>
            <p className="text-xs font-mono break-words">
              «{escapeHtml(w.text)}»
            </p>
            <p className="text-xs text-vng-muted">
              Контакт: {escapeHtml(w.contact)}
              {w.offeredPrice && ` · Предлагает: ${escapeHtml(w.offeredPrice)}`}
            </p>

            {editingId === w.id ? (
              <div className="space-y-2 border-t border-vng-border pt-2 mt-2">
                <div>
                  <label className="text-xs text-vng-muted">Статус</label>
                  <select
                    className="vng-input w-full text-xs font-mono mt-0.5"
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as WishStatus)
                    }
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-vng-muted">
                    Итоговая цена
                  </label>
                  <input
                    className="vng-input w-full text-xs font-mono mt-0.5"
                    value={editFinalPrice}
                    onChange={(e) => setEditFinalPrice(e.target.value)}
                    placeholder="Например: 500 руб."
                  />
                </div>
                <div>
                  <label className="text-xs text-vng-muted">Заметка</label>
                  <textarea
                    className="vng-input w-full text-xs font-mono mt-0.5 min-h-[48px]"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Внутренняя заметка..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="vng-tui-btn vng-tui-btn--primary text-xs"
                    onClick={() => saveEdit(w.id)}
                    disabled={saving}
                  >
                    {saving ? 'Сохраняю...' : '[ Сохранить ]'}
                  </button>
                  <button
                    className="vng-tui-btn vng-tui-btn--ghost text-xs"
                    onClick={() => setEditingId(null)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 border-t border-vng-border pt-2 mt-1">
                <span className="text-xs text-vng-accent font-bold">
                  [ {STATUS_LABELS[w.status]} ]
                </span>
                {w.finalPrice && (
                  <span className="text-xs text-vng-muted">
                    · {escapeHtml(w.finalPrice)}
                  </span>
                )}
                <button
                  className="vng-tui-btn vng-tui-btn--ghost text-xs ml-auto"
                  onClick={() => startEdit(w)}
                >
                  Изменить
                </button>
              </div>
            )}
            {w.adminNote && editingId !== w.id && (
              <p className="text-xs text-vng-muted">
                Заметка: {escapeHtml(w.adminNote)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Главный модал ───────────────────────────────────────────────────────────

interface PremiumModalProps {
  onClose: () => void
  playerId: string
  playerName: string
  isAdmin: boolean
}

export function PremiumModal({
  onClose,
  playerId,
  playerName,
  isAdmin,
}: PremiumModalProps) {
  const [tab, setTab] = useState<'info' | 'admin'>('info')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="vng-card vng-card-glow w-full sm:max-w-xl max-h-[88vh] overflow-auto rounded-t-2xl sm:rounded-2xl">
        {/* Заголовок */}
        <header className="flex items-center justify-between p-4 border-b border-vng-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-yellow-400 text-xl select-none">★</span>
            <h2 className="font-mono font-bold tracking-widest text-sm uppercase text-vng-accent">
              VNG PREMIUM
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <button
                  className={`vng-tui-btn text-xs ${tab === 'info' ? 'vng-tui-btn--primary' : 'vng-tui-btn--ghost'}`}
                  onClick={() => setTab('info')}
                >
                  Форма
                </button>
                <button
                  className={`vng-tui-btn text-xs ${tab === 'admin' ? 'vng-tui-btn--primary' : 'vng-tui-btn--ghost'}`}
                  onClick={() => setTab('admin')}
                >
                  Заявки
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="vng-tui-btn vng-tui-btn--ghost text-xs"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="p-4 space-y-4">
          {tab === 'admin' && isAdmin ? (
            <AdminPanel playerId={playerId} />
          ) : (
            <>
              {/* Описание */}
              <div className="space-y-1">
                <p className="text-sm font-mono text-vng-accent font-bold">
                  Одно любое желание. Цена договорная.
                </p>
                <p className="text-xs text-vng-muted">
                  Кастомная тема, особый шаблон листа, новая функция,
                  оформление под вашу кампанию — и многое другое.
                </p>
              </div>

              {/* Условия */}
              <div className="vng-panel p-3 space-y-1 text-xs text-vng-muted border border-vng-border">
                <p className="font-bold text-vng-accent uppercase tracking-widest mb-2">
                  Условия
                </p>
                <p>
                  · Желание выполняется в рамках разумного; владелец вправе
                  отказать или предложить альтернативу.
                </p>
                <p>
                  · Если желание невыполнимо — деньги возвращаются или можно
                  заменить.
                </p>
                <p>· После выполнения возврат не предусмотрен.</p>
                <p>· Срок выполнения обсуждается индивидуально.</p>
                <p>
                  · Результат может быть доступен всем игрокам, если не
                  оговорено иное.
                </p>
                <p className="border-t border-vng-border pt-1 mt-1">
                  Цена обсуждается индивидуально. После отправки заявки с вами
                  свяжутся.
                </p>
              </div>

              {/* Пользовательская форма / статус */}
              <UserPremiumView
                playerId={playerId}
                playerName={playerName}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

