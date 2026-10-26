import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ArcadeNickPicker } from '@/components/ArcadeNick/ArcadeNickPicker'
import { normalizeArcadeNick } from '@/lib/arcadeNick'

interface ChangeNickModalProps {
  currentName: string
  onSave: (name: string) => void
  onClose: () => void
}

export function ChangeNickModal({ currentName, onSave, onClose }: ChangeNickModalProps) {
  const [draft, setDraft] = useState(() => normalizeArcadeNick(currentName))
  const unchanged = draft === normalizeArcadeNick(currentName)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="vng-card vng-card-glow w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between p-4 border-b border-vng-border">
          <h2 className="font-mono font-bold tracking-widest text-sm uppercase text-vng-accent">Сменить ник</h2>
          <button type="button" className="vng-tui-btn vng-tui-btn--ghost text-xs" onClick={onClose}>
            ✕
          </button>
        </header>
        <form
          className="p-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!unchanged) onSave(draft)
            onClose()
          }}
        >
          <ArcadeNickPicker value={draft} onChange={setDraft} />
          <p className="text-[11px] text-vng-muted">Новый ник сразу увидят все в комнате. Старые сообщения в чате останутся со старым ником.</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
            <Button type="submit" className="flex-1" disabled={unchanged}>Сохранить</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
