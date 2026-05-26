import { Volume2, VolumeX } from 'lucide-react'

interface MusicVolumeControlProps {
  volume: number
  onChange: (volume: number) => void
  disabled?: boolean
  compact?: boolean
}

export function MusicVolumeControl({ volume, onChange, disabled, compact }: MusicVolumeControlProps) {
  const muted = volume === 0

  return (
    <div
      className={`flex items-center gap-1.5 shrink-0 ${compact ? '' : 'min-w-[120px]'}`}
      title="Громкость только у вас"
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(muted ? 70 : 0)}
        className="p-1 rounded text-vng-muted hover:text-vng-amber disabled:opacity-40"
        aria-label={muted ? 'Включить звук' : 'Выключить звук'}
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={volume}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 sm:w-20 h-1 accent-vng-amber cursor-pointer disabled:opacity-40"
        aria-label="Громкость"
      />
      <span className="text-xs font-mono text-vng-muted w-7 text-right tabular-nums">{volume}</span>
    </div>
  )
}
