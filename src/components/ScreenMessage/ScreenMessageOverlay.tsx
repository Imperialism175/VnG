import { X } from 'lucide-react'
import type { ScreenMessage } from '@/types'
import { Button } from '@/components/ui/Button'

interface ScreenMessageOverlayProps {
  message: ScreenMessage
  onDismiss: () => void
  canDismiss: boolean
}

export function ScreenMessageOverlay({ message, onDismiss, canDismiss }: ScreenMessageOverlayProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        className="relative max-w-lg w-full rounded-2xl border border-vng-blue/40 p-6 sm:p-8 text-center vng-glow-blue"
        style={{
          background: `linear-gradient(165deg, rgb(12 16 24 / 0.98), rgb(6 8 12 / 0.99))`,
        }}
      >
        {canDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-3 right-3 p-2 rounded-lg text-vng-muted hover:text-vng-text hover:bg-vng-elevated/80"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        )}
        {message.title && (
          <p className="vng-display text-vng-amber text-sm uppercase tracking-[0.2em] mb-3">{message.title}</p>
        )}
        <p className="vng-narrative text-lg sm:text-xl leading-relaxed whitespace-pre-wrap">{message.text}</p>
        {canDismiss && (
          <Button type="button" className="mt-6" onClick={onDismiss}>
            Понятно
          </Button>
        )}
      </div>
    </div>
  )
}
