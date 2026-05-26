import { ChevronRight, Swords } from 'lucide-react'
import type { Encounter } from '@/types'
import { MOOD_LABELS } from '@/lib/encounterUtils'
interface EncounterBannerProps {
  encounter: Encounter
  onOpen: () => void
  showGmHint?: boolean
}

export function EncounterBanner({ encounter, onOpen, showGmHint }: EncounterBannerProps) {
  const mood = encounter.mood ? MOOD_LABELS[encounter.mood] : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="vng-encounter-banner w-full text-left shrink-0"
    >
      <div className="vng-encounter-banner__inner">
        <div className="vng-encounter-banner__icon" aria-hidden>
          <Swords size={28} />
        </div>
        <div className="vng-encounter-banner__body min-w-0 flex-1">
          <div className="vng-encounter-banner__tags">
            <span className="vng-encounter-banner__tag vng-encounter-banner__tag--fight">БОЙ</span>
            {mood && <span className="vng-encounter-banner__tag">{mood}</span>}
            {encounter.round > 0 && (
              <span className="vng-encounter-banner__tag">Раунд {encounter.round}</span>
            )}
          </div>
          <h2 className="vng-encounter-banner__title">{encounter.title || 'Энкаунтер'}</h2>
          {encounter.subtitle && <p className="vng-encounter-banner__subtitle">{encounter.subtitle}</p>}
          <p className="vng-encounter-banner__desc line-clamp-2">{encounter.description}</p>
          {showGmHint && (
            <p className="vng-encounter-banner__gm-hint">ГМ: настройка сцены — вкладка «ГМ»</p>
          )}
        </div>
        <div className="vng-encounter-banner__action shrink-0">
          <span className="vng-encounter-banner__open hidden sm:inline">Открыть</span>
          <ChevronRight size={20} />
        </div>
      </div>
    </button>
  )
}
