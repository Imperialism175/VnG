import { useEffect, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import { normalizeEncounterImageUrl } from '@/lib/encounterImageUrl'

export type EncounterImageSize = 'compact' | 'editor' | 'card'

interface EncounterImageProps {
  src: string
  alt?: string
  size?: EncounterImageSize
  className?: string
}

export function EncounterImage({ src, alt = '', size = 'card', className = '' }: EncounterImageProps) {
  const [open, setOpen] = useState(false)
  const safeSrc = normalizeEncounterImageUrl(src)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`vng-encounter-img vng-encounter-img--${size} ${className}`.trim()}
        title="Открыть в полном размере"
        aria-label="Открыть картинку в полном размере"
      >
        <img src={safeSrc} alt={alt} className="vng-encounter-img__img" loading="lazy" />
        <span className="vng-encounter-img__zoom" aria-hidden>
          <Maximize2 size={size === 'compact' ? 14 : 18} />
        </span>
      </button>

      {open && (
        <div
          className="vng-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Картинка энкаунтера"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="vng-image-lightbox__close"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
          >
            <X size={22} />
          </button>
          <img
            src={safeSrc}
            alt={alt}
            className="vng-image-lightbox__img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
