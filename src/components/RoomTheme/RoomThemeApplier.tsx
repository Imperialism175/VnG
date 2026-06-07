import { useEffect, useRef, useState } from 'react'
import type { RoomStageFx, RoomTheme } from '@/types'
import { getProMaxSettings, isProMaxActive, subscribeCheat } from '@/lib/cheatState'
import { applyProMaxStyleVars, clearProMaxStyleVars } from '@/lib/proMaxTheme'
import { applyThemeVars, resolveTheme } from '@/lib/theme'
import { usePremiumUx } from '@/hooks/usePremiumUx'

interface RoomThemeApplierProps {
  theme: RoomTheme
  stageFx?: RoomStageFx
  viewerPlayerId?: string
  viewerIsGm?: boolean
  mobileUiScale?: number
  bypassDarkness?: boolean
  children: React.ReactNode
}

export function RoomThemeApplier({
  theme,
  stageFx,
  viewerPlayerId,
  viewerIsGm,
  mobileUiScale = 1,
  bypassDarkness = false,
  children,
}: RoomThemeApplierProps) {
  const ref = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pointer, setPointer] = useState({ x: 50, y: 50 })
  const [cheatTick, setCheatTick] = useState(0)
  const isPremium = isProMaxActive() && resolveTheme(theme).variant === 'premium'

  useEffect(() => subscribeCheat(() => setCheatTick((n) => n + 1)), [])

  useEffect(() => {
    if (!ref.current) return
    applyThemeVars(ref.current, theme)
    if (isPremium) {
      applyProMaxStyleVars(ref.current, getProMaxSettings())
    } else {
      clearProMaxStyleVars(ref.current)
    }
  }, [theme.blue, theme.gold, theme.bg, theme.variant, isPremium, cheatTick])

  const proMaxSettings = isPremium ? getProMaxSettings() : null
  usePremiumUx(ref, canvasRef, isPremium, proMaxSettings, cheatTick)

  const flashlightEnabled = Boolean(
    !viewerIsGm &&
    viewerPlayerId &&
    stageFx?.flashlightsEnabledFor?.includes(viewerPlayerId)
  )
  const darknessOpacity = bypassDarkness
    ? 0
    : Math.max(0, Math.min(1, (100 - (stageFx?.darkness ?? 100)) / 100))
  const showStageDarkness = darknessOpacity > 0.001
  const gmMonochromeAmount = viewerIsGm && showStageDarkness ? darknessOpacity : 0

  return (
    <div
      ref={ref}
      className={`vng-room-shell vng-retro-shell vng-page flex flex-col w-full max-lg:min-h-full lg:h-dvh lg:max-h-dvh lg:overflow-hidden${isPremium ? ' vng-room-shell--premium' : ''}`}
      style={{
        ['--vng-stage-light' as string]: String(stageFx?.darkness ?? 100),
        ['--vng-mobile-ui-scale' as string]: String(Math.max(0.8, Math.min(1.6, mobileUiScale))),
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
      {isPremium && proMaxSettings?.scene3d ? (
        <canvas
          ref={canvasRef}
          className="vng-premium-canvas pointer-events-none"
          aria-hidden
        />
      ) : null}
      <div
        className="relative z-[1] flex flex-col min-h-0 flex-1"
        style={gmMonochromeAmount > 0 ? { filter: `grayscale(${gmMonochromeAmount})` } : undefined}
      >
        {children}
      </div>
      {showStageDarkness && !viewerIsGm ? (
        <div
          className="vng-stage-dark-overlay"
          style={
            flashlightEnabled
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
      ) : null}
    </div>
  )
}
