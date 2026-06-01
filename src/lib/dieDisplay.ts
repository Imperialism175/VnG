import type { DiceSides } from '@/types'

const D3_ROMAN: Record<number, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
}

export function toD3Roman(value: number): string {
  return D3_ROMAN[value] ?? String(value)
}

/** Точка у 6 и 9 — чтобы отличать на «грани» куба; d3 — римские I–III */
export function formatDieFaceValue(
  value: number,
  sides: DiceSides
): { main: string; showDot: boolean } {
  if (sides === 3) {
    return { main: toD3Roman(value), showDot: false }
  }
  if (value === 6 || value === 9) {
    return { main: String(value), showDot: true }
  }
  return { main: String(value), showDot: false }
}

/** Контур грани куба в координатах viewBox 0 0 100 100 */
export function getDieFaceShape(sides: DiceSides): {
  tag: 'polygon' | 'rect' | 'circle'
  attrs: Record<string, string | number>
} {
  switch (sides) {
    case 3:
      return { tag: 'rect', attrs: { x: 18, y: 18, width: 64, height: 64, rx: 4 } }
    case 4:
      return { tag: 'polygon', attrs: { points: '50,12 88,78 12,78' } }
    case 6:
      return { tag: 'polygon', attrs: { points: '50,8 86,28 86,72 50,92 14,72 14,28' } }
    case 8:
      return { tag: 'polygon', attrs: { points: '50,10 90,50 50,90 10,50' } }
    case 10:
      return {
        tag: 'polygon',
        attrs: { points: '50,8 74,15 90,33 90,67 74,85 50,92 26,85 10,67 10,33 26,15' },
      }
    case 12:
      return {
        tag: 'polygon',
        attrs: { points: '50,6 86,22 94,50 86,78 50,94 14,78 6,50 14,22' },
      }
    case 20:
      return { tag: 'polygon', attrs: { points: '50,5 95,35 80,95 20,95 5,35' } }
    case 100:
      return { tag: 'circle', attrs: { cx: 50, cy: 50, r: 38 } }
    default:
      return { tag: 'rect', attrs: { x: 20, y: 20, width: 60, height: 60, rx: 4 } }
  }
}

export function dieFontSize(value: number, sides: DiceSides): number {
  if (sides === 3) return 30
  const display = formatDieFaceValue(value, sides).main
  const digits = display.length
  if (sides === 100 || digits >= 3) return 22
  if (digits === 2) return 28
  return 34
}
