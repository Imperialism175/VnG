import { useEffect, useRef, type RefObject } from 'react'
import type { PremiumSceneHandle } from '@/lib/premiumUx/premiumScene'
import { getProMaxSettings } from '@/lib/cheatState'
import type { ProMaxSettings } from '@/lib/proMaxTheme'

export function usePremiumUx(
  shellRef: RefObject<HTMLElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  settings: ProMaxSettings | null,
  settingsTick = 0
) {
  const sceneRef = useRef<PremiumSceneHandle | null>(null)
  const motionCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const shell = shellRef.current
    const canvas = canvasRef.current
    const live = enabled ? getProMaxSettings() : null
    const motion = live?.motion ?? settings?.motion ?? 'full'
    const scene3d = Boolean(live?.scene3d ?? settings?.scene3d)

    const cleanup = () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
      motionCleanupRef.current?.()
      motionCleanupRef.current = null
    }

    if (!enabled || !shell || motion === 'off') {
      cleanup()
      return
    }

    let cancelled = false
    let onPointer: ((e: PointerEvent) => void) | null = null

    if (scene3d && canvas) {
      onPointer = (e: PointerEvent) => {
        const rect = shell.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2
        sceneRef.current?.setPointer(nx, ny)
      }
      shell.addEventListener('pointermove', onPointer)

      import('@/lib/premiumUx/premiumScene').then((sceneMod) => {
        if (cancelled) return
        sceneMod.createPremiumScene(canvas, live?.sceneShape ?? 'torus').then((scene) => {
          if (cancelled) {
            scene.dispose()
            return
          }
          sceneRef.current = scene
        })
      })
    }

    Promise.all([import('@/lib/premiumUx/premiumMotion'), import('gsap/ScrollTrigger')]).then(
      ([motionMod, scrollTriggerMod]) => {
        if (cancelled) return
        motionCleanupRef.current = motionMod.initPremiumMotion(shell, motion)
        window.setTimeout(() => scrollTriggerMod.ScrollTrigger.refresh(), 500)
      }
    )

    return () => {
      cancelled = true
      if (onPointer) shell.removeEventListener('pointermove', onPointer)
      cleanup()
    }
  }, [shellRef, canvasRef, enabled, settings?.motion, settings?.scene3d, settings?.sceneShape, settingsTick])
}
