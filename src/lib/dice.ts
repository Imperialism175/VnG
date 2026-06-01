import type { DiceRollResult, DiceSides } from '@/types'

const DICE_PATTERN = /(\d*)d(\d+)/gi

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

export function parseAndRoll(expression: string): DiceRollResult {
  const trimmed = expression.trim().toLowerCase().replace(/\s+/g, '')
  if (!trimmed) {
    throw new Error('Введите выражение для броска')
  }

  const rolls: number[] = []
  let modifier = 0
  let dicePart = trimmed

  const modMatch = trimmed.match(/([+-]\d+)$/)
  if (modMatch) {
    modifier = parseInt(modMatch[1], 10)
    dicePart = trimmed.slice(0, -modMatch[1].length)
  }

  if (dicePart) {
    let match: RegExpExecArray | null
    const regex = new RegExp(DICE_PATTERN.source, 'gi')
    let foundDice = false

    while ((match = regex.exec(dicePart)) !== null) {
      foundDice = true
      const count = match[1] ? parseInt(match[1], 10) : 1
      const sides = parseInt(match[2], 10)
      if (count < 1 || count > 100) throw new Error('Количество кубов: от 1 до 100')
      if (![3, 4, 5, 6, 8, 10, 12, 20, 100].includes(sides)) {
        throw new Error(`Неподдерживаемый куб: d${sides}`)
      }
      for (let i = 0; i < count; i++) {
        rolls.push(rollDie(sides))
      }
    }

    if (!foundDice) {
      throw new Error('Используйте формат: 2d20+5')
    }
  }

  const diceSum = rolls.reduce((a, b) => a + b, 0)
  const total = diceSum + modifier

  const details =
  rolls.length > 0
    ? `[${rolls.join(', ')}]${modifier !== 0 ? (modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`) : ''} = ${total}`
    : `${modifier}`

  return {
    expression: trimmed,
    total,
    details,
    rolls,
    modifier,
  }
}

export function quickRoll(sides: DiceSides, count = 1, modifier = 0): DiceRollResult {
  const expr =
    modifier !== 0
      ? `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier}`
      : `${count}d${sides}`
  return parseAndRoll(expr)
}

/** Значения кубов из поля event.details сервера: `[4, 2, 6] = 12` */
export function parseDieValuesFromDetails(details: string): number[] {
  const m = details.match(/\[([^\]]+)\]/)
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
}

export function randomDieValues(count: number, sides: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
}

export const DICE_TYPES: { label: string; sides: DiceSides }[] = [
  { label: 'D3', sides: 3 },
  { label: 'D4', sides: 4 },
  { label: 'D6', sides: 6 },
  { label: 'D8', sides: 8 },
  { label: 'D10', sides: 10 },
  { label: 'D12', sides: 12 },
  { label: 'D20', sides: 20 },
  { label: 'D100', sides: 100 },
]
