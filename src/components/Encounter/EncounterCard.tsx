import { MapPin, Swords, Target, X } from 'lucide-react'
import type { Encounter } from '@/types'
import { MOOD_LABELS } from '@/lib/encounterUtils'
import { EncounterImage } from '@/components/Encounter/EncounterImage'
import { SegmentedHpBar } from '@/components/ui/SegmentedHpBar'

interface EncounterCardProps {
  encounter: Encounter
  onDismiss?: () => void
  showDismiss?: boolean
  showGmNotes?: boolean
  compact?: boolean
}

export function EncounterCard({ encounter, onDismiss, showDismiss, showGmNotes, compact }: EncounterCardProps) {
  const moodLabel = encounter.mood ? MOOD_LABELS[encounter.mood] : null

  if (compact) {
    return (
      <article className="relative rounded-sm border-4 border-double border-vng-blue/40 bg-vng-surface overflow-hidden shadow-[4px_4px_0_rgb(0_0_0/0.5)]">
        {showDismiss && onDismiss && (
          <button type="button" onClick={onDismiss} className="absolute top-2 right-2 z-10 p-1 rounded-md bg-vng-bg/90 text-vng-muted hover:text-vng-text">
            <X size={14} />
          </button>
        )}
        <div className="flex gap-3 p-3 min-h-0">
          {encounter.image_url ? (
            <EncounterImage
              src={encounter.image_url}
              alt={encounter.title || ''}
              size="compact"
              className="shrink-0"
            />
          ) : (
            <div className="w-24 h-20 rounded-lg bg-vng-bg border border-vng-border flex items-center justify-center shrink-0">
              <Swords size={28} className="text-vng-blue/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              {moodLabel && (
                <span className="text-xs uppercase tracking-wide px-1.5 py-0.5 border border-vng-blue/40 bg-vng-blue/15 text-vng-blue vng-mono">
                  {moodLabel}
                </span>
              )}
              {encounter.round > 0 && (
                <span className="vng-arcade-hud">
                  <span className="vng-arcade-hud__label">RND</span>
                  <span className="vng-arcade-hud__value vng-glow-amber">{encounter.round}</span>
                </span>
              )}
            </div>
            <h2 className="font-bold text-vng-amber truncate">{encounter.title || 'Энкаунтер'}</h2>
            {encounter.subtitle && (
              <p className="text-xs text-vng-muted flex items-center gap-1 truncate">
                <MapPin size={10} /> {encounter.subtitle}
              </p>
            )}
            <p className="text-xs text-vng-text/80 line-clamp-2 mt-1">{encounter.description}</p>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="relative rounded-sm border-4 border-double border-vng-blue/45 bg-vng-surface overflow-hidden shadow-[4px_4px_0_rgb(0_0_0/0.55)] h-full flex flex-col min-h-0">
      {showDismiss && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-vng-bg/80 text-vng-muted hover:text-vng-text"
          aria-label="Скрыть энкаунтер"
        >
          <X size={16} />
        </button>
      )}

      {encounter.image_url ? (
        <div className="shrink-0 border-b border-vng-border p-2">
          <EncounterImage src={encounter.image_url} alt={encounter.title || 'Сцена боя'} size="card" />
        </div>
      ) : (
        <div className="h-20 shrink-0 bg-vng-bg flex items-center justify-center border-b border-vng-border">
          <Swords size={36} className="text-vng-blue/30" />
        </div>
      )}

      <div className="p-4 flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {encounter.round > 0 && (
            <span className="vng-arcade-hud">
              <span className="vng-arcade-hud__label">RND</span>
              <span className="vng-arcade-hud__value vng-glow-amber">{encounter.round}</span>
            </span>
          )}
          {moodLabel && (
            <span className="text-xs uppercase tracking-wide px-2 py-0.5 border border-vng-blue/40 bg-vng-blue/15 text-vng-blue vng-mono">
              {moodLabel}
            </span>
          )}
        </div>

        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-vng-amber leading-tight">
            {encounter.title || 'Без названия'}
          </h2>
          {encounter.subtitle && (
            <p className="text-sm text-vng-muted flex items-center gap-1 mt-0.5">
              <MapPin size={12} /> {encounter.subtitle}
            </p>
          )}
        </div>

        <p className="text-base text-vng-text/90 whitespace-pre-wrap leading-relaxed">{encounter.description}</p>

        {encounter.objectives && (
          <div className="p-3 rounded-lg bg-vng-amber/5 border border-vng-amber/20">
            <p className="text-xs uppercase tracking-wide text-vng-amber mb-1 flex items-center gap-1">
              <Target size={10} /> Цели
            </p>
            <p className="text-sm whitespace-pre-wrap">{encounter.objectives}</p>
          </div>
        )}

        {encounter.enemies.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-vng-muted">Противники</p>
            {encounter.enemies.map((enemy) => (
              <div key={enemy.id} className="p-2.5 rounded-lg bg-vng-bg border border-vng-border">
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <span className="font-semibold text-sm">{enemy.name}</span>
                  {enemy.armor && <span className="text-xs text-vng-muted font-mono">КБ {enemy.armor}</span>}
                </div>
                {enemy.hp !== null && enemy.hp_max !== null && (
                  <>
                    <div className="flex justify-between text-xs vng-mono mb-1">
                      <span className="text-vng-muted">HP</span>
                      <span className="text-vng-danger vng-glow-danger">
                        {enemy.hp} / {enemy.hp_max}
                      </span>
                    </div>
                    <SegmentedHpBar current={enemy.hp} max={enemy.hp_max} variant="enemy" />
                  </>
                )}
                {enemy.notes && <p className="text-xs text-vng-muted mt-1">{enemy.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {showGmNotes && encounter.gm_notes && (
          <div className="p-2 rounded border border-dashed border-vng-border text-xs text-vng-muted italic">
            <span className="not-italic font-semibold text-vng-amber">ГМ: </span>
            {encounter.gm_notes}
          </div>
        )}
      </div>
    </article>
  )
}
