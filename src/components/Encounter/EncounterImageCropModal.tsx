import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  clampPan,
  coverScale,
  cropImageToDataUrl,
  ENCOUNTER_IMAGE_ASPECT,
  loadImage,
  panToCropRect,
} from '@/lib/imageCrop'
import { Button } from '@/components/ui/Button'

interface EncounterImageCropModalProps {
  src: string
  onApply: (dataUrl: string) => void
  onCancel: () => void
}

export function EncounterImageCropModal({ src, onApply, onCancel }: EncounterImageCropModalProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [frameSize, setFrameSize] = useState({ w: 320, h: 180 })
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  const resetView = useCallback((image: HTMLImageElement, fw: number, fh: number) => {
    const s = coverScale(fw, fh, image.naturalWidth, image.naturalHeight)
    const x = (fw - image.naturalWidth * s) / 2
    const y = (fh - image.naturalHeight * s) / 2
    setScale(s)
    setPan(clampPan(fw, fh, image.naturalWidth, image.naturalHeight, s, x, y))
  }, [])

  useEffect(() => {
    let cancelled = false
    setError(null)
    setImg(null)
    loadImage(src)
      .then((image) => {
        if (cancelled) return
        setImg(image)
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            'Картинку по ссылке нельзя обрезать (блокировка сайта). Загрузите файл с компьютера.'
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = () => {
      const rect = frame.getBoundingClientRect()
      const w = Math.max(280, Math.round(rect.width))
      const h = Math.round(w / ENCOUNTER_IMAGE_ASPECT)
      setFrameSize({ w, h })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (img) resetView(img, frameSize.w, frameSize.h)
  }, [img, resetView])

  useEffect(() => {
    if (!img) return
    setPan((p) => clampPan(frameSize.w, frameSize.h, img.naturalWidth, img.naturalHeight, scale, p.x, p.y))
  }, [frameSize.w, frameSize.h, img, scale])

  function setScaleClamped(next: number) {
    if (!img) return
    const { w, h } = frameSize
    const minS = coverScale(w, h, img.naturalWidth, img.naturalHeight)
    const s = Math.max(minS, Math.min(minS * 4, next))
    const cx = w / 2
    const cy = h / 2
    const imgCx = (cx - pan.x) / scale
    const imgCy = (cy - pan.y) / scale
    const nx = cx - imgCx * s
    const ny = cy - imgCy * s
    setScale(s)
    setPan(clampPan(w, h, img.naturalWidth, img.naturalHeight, s, nx, ny))
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!img || e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !img) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const { w, h } = frameSize
    setPan(
      clampPan(
        w,
        h,
        img.naturalWidth,
        img.naturalHeight,
        scale,
        dragRef.current.panX + dx,
        dragRef.current.panY + dy
      )
    )
  }

  function onPointerUp() {
    dragRef.current = null
  }

  const zoomSlider =
    img && frameSize.w > 0
      ? Math.round(
          ((scale / coverScale(frameSize.w, frameSize.h, img.naturalWidth, img.naturalHeight) - 1) / 3) * 100
        )
      : 0

  function handleApply() {
    if (!img) return
    const crop = panToCropRect(frameSize.w, frameSize.h, scale, pan.x, pan.y)
    try {
      const dataUrl = cropImageToDataUrl(img, crop)
      onApply(dataUrl)
    } catch {
      setError('Не удалось обрезать картинку')
    }
  }

  return (
    <div className="vng-crop-modal" role="dialog" aria-modal="true" aria-label="Обрезка картинки">
      <div className="vng-crop-modal__dialog">
        <header className="vng-crop-modal__head">
          <h3 className="vng-crop-modal__title">Обрезка картинки</h3>
          <button type="button" className="vng-crop-modal__icon-btn" onClick={onCancel} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        <p className="vng-crop-modal__hint">
          Перетащите картинку, колёсиком или ползунком — масштаб. В рамке — то, что увидят игроки.
        </p>

        {error ? (
          <p className="vng-crop-modal__error">{error}</p>
        ) : (
          <>
            <div
              ref={frameRef}
              className="vng-crop-modal__frame"
              style={{ aspectRatio: `${ENCOUNTER_IMAGE_ASPECT}` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={(e) => {
                e.preventDefault()
                setScaleClamped(scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08))
              }}
            >
              {img && (
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="vng-crop-modal__img"
                  style={{
                    width: img.naturalWidth * scale,
                    height: img.naturalHeight * scale,
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                  }}
                />
              )}
              <div className="vng-crop-modal__frame-border" aria-hidden />
            </div>

            <div className="vng-crop-modal__zoom">
              <button
                type="button"
                className="vng-crop-modal__icon-btn"
                onClick={() => setScaleClamped(scale / 1.12)}
                aria-label="Уменьшить"
              >
                <ZoomOut size={16} />
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.min(100, Math.max(0, zoomSlider))}
                onChange={(e) => {
                  if (!img) return
                  const minS = coverScale(frameSize.w, frameSize.h, img.naturalWidth, img.naturalHeight)
                  const t = Number(e.target.value) / 100
                  setScaleClamped(minS * (1 + t * 3))
                }}
                className="vng-crop-modal__range flex-1"
                aria-label="Масштаб"
              />
              <button
                type="button"
                className="vng-crop-modal__icon-btn"
                onClick={() => setScaleClamped(scale * 1.12)}
                aria-label="Увеличить"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </>
        )}

        <footer className="vng-crop-modal__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="button" onClick={handleApply} disabled={!img || Boolean(error)}>
            <Check size={16} /> Применить обрезку
          </Button>
        </footer>
      </div>
    </div>
  )
}
