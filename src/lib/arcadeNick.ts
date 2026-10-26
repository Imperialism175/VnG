export const ARCADE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')

export function normalizeArcadeNick(input: string): string {
  const upper = String(input ?? '').toUpperCase()
  const filtered = [...upper].filter((ch) => ARCADE_ALPHABET.includes(ch)).slice(0, 3)
  while (filtered.length < 3) filtered.push('A')
  return filtered.join('')
}
