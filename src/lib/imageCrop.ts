export const ENCOUNTER_IMAGE_ASPECT = 16 / 9
export const ENCOUNTER_IMAGE_MAX_WIDTH = 1200
export const ENCOUNTER_IMAGE_JPEG_QUALITY = 0.82

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Не удалось прочитать файл'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Ошибка чтения файла'))
    reader.readAsDataURL(file)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось загрузить картинку'))
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous'
    }
    img.src = src
  })
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export function cropImageToDataUrl(
  img: HTMLImageElement,
  crop: CropRect,
  maxWidth = ENCOUNTER_IMAGE_MAX_WIDTH,
  quality = ENCOUNTER_IMAGE_JPEG_QUALITY
): string {
  const sw = Math.max(1, Math.min(crop.width, img.naturalWidth - crop.x))
  const sh = Math.max(1, Math.min(crop.height, img.naturalHeight - crop.y))
  const sx = Math.max(0, Math.min(crop.x, img.naturalWidth - 1))
  const sy = Math.max(0, Math.min(crop.y, img.naturalHeight - 1))

  const outW = Math.min(maxWidth, Math.round(sw))
  const outH = Math.round(outW / (sw / sh))

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Минимальный масштаб, чтобы картинка закрывала область кадра */
export function coverScale(frameW: number, frameH: number, imgW: number, imgH: number): number {
  return Math.max(frameW / imgW, frameH / imgH)
}

export function clampPan(
  frameW: number,
  frameH: number,
  imgW: number,
  imgH: number,
  scale: number,
  x: number,
  y: number
): { x: number; y: number } {
  const dw = imgW * scale
  const dh = imgH * scale
  const minX = frameW - dw
  const minY = frameH - dh
  return {
    x: Math.min(0, Math.max(minX, x)),
    y: Math.min(0, Math.max(minY, y)),
  }
}

export function panToCropRect(
  frameW: number,
  frameH: number,
  scale: number,
  panX: number,
  panY: number
): CropRect {
  return {
    x: -panX / scale,
    y: -panY / scale,
    width: frameW / scale,
    height: frameH / scale,
  }
}
