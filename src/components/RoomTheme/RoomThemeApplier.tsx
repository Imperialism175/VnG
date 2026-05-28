import { useEffect, useRef, useState } from 'react'
import type { RoomStageFx, RoomTheme } from '@/types'
import { applyThemeVars } from '@/lib/theme'

interface RoomThemeApplierProps {
  theme: RoomTheme
  stageFx?: RoomStageFx
  musicPlaying?: boolean
  viewerPlayerId?: string
  viewerIsGm?: boolean
  mobileUiScale?: number
  children: React.ReactNode
}

export function RoomThemeApplier({
  theme,
  stageFx,
  musicPlaying = false,
  viewerPlayerId,
  viewerIsGm,
  mobileUiScale = 1,
  children,
}: RoomThemeApplierProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pointer, setPointer] = useState({ x: 50, y: 50 })

  useEffect(() => {
    if (ref.current) applyThemeVars(ref.current, theme)
  }, [theme.blue, theme.gold, theme.bg])

  const flashlightEnabled = Boolean(
    !viewerIsGm &&
    viewerPlayerId &&
    stageFx?.flashlightsEnabledFor?.includes(viewerPlayerId)
  )
  const darknessOpacity = Math.max(0, Math.min(1, (100 - (stageFx?.darkness ?? 100)) / 100))
  const gmMonochromeAmount = viewerIsGm ? darknessOpacity : 0
  const beatFlickerEnabled = Boolean(stageFx?.beatFlickerEnabled && musicPlaying)
  const beatBpm = Math.max(50, Math.min(220, stageFx?.beatBpm ?? 120))
  const beatDurationMs = Math.round(60000 / beatBpm)
  const beatIntensity = Math.max(0, Math.min(100, stageFx?.beatIntensity ?? 40))

  return (
    <div
      ref={ref}
      className={`vng-room-shell vng-retro-shell vng-page flex flex-col w-full max-lg:min-h-full lg:h-dvh lg:max-h-dvh lg:overflow-hidden ${
        beatFlickerEnabled ? 'vng-room-shell--beat-flicker' : ''
      }`}
      style={{
        ['--vng-stage-light' as string]: String(stageFx?.darkness ?? 100),
        ['--vng-mobile-ui-scale' as string]: String(Math.max(0.8, Math.min(1.6, mobileUiScale))),
        ['--vng-beat-duration-ms' as string]: `${beatDurationMs}ms`,
        ['--vng-beat-intensity' as string]: String((beatIntensity / 100).toFixed(3)),
      }}
      onMouseMove={(e) => {
        if (!flashlightEnabled) return
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        setPointer({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
      }}
    >
      <div
        className={`relative z-[1] flex flex-col min-h-0 flex-1 ${
          beatFlickerEnabled ? 'vng-room-shell__beat-surface' : ''
        }`}
        style={viewerIsGm ? { filter: `grayscale(${gmMonochromeAmount})` } : undefined}
      >
        {children}
      </div>
      <div
        className="vng-stage-dark-overlay"
        style={
          viewerIsGm
            ? { opacity: 0 }
            : flashlightEnabled
            ? {
                opacity: 1,
                background: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(0,0,0,0) 0, rgba(0,0,0,0.2) 10%, rgba(0,0,0,${Math.min(
                  0.95,
                  darknessOpacity
                )}) 24%, rgba(0,0,0,${Math.min(0.98, darknessOpacity + 0.08)}) 100%)`,
              }
            : { opacity: darknessOpacity }
        }
      />
    </div>
  )
}
