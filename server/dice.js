const DICE_PATTERN = /(\d*)d(\d+)/gi
const ALLOWED = [3, 4, 6, 8, 10, 12, 20, 100]
const MAX_DICE_PER_ROLL = 10

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1
}

export function parseAndRoll(expression) {
  const trimmed = expression.trim().toLowerCase().replace(/\s+/g, '')
  if (!trimmed) throw new Error('Пустое выражение')

  const rolls = []
  let modifier = 0
  let dicePart = trimmed
  const modMatch = trimmed.match(/([+-]\d+)$/)
  if (modMatch) {
    modifier = parseInt(modMatch[1], 10)
    dicePart = trimmed.slice(0, -modMatch[1].length)
  }

  const regex = new RegExp(DICE_PATTERN.source, 'gi')
  let match
  let found = false
  while ((match = regex.exec(dicePart)) !== null) {
    found = true
    const count = match[1] ? parseInt(match[1], 10) : 1
    const sides = parseInt(match[2], 10)
    if (!ALLOWED.includes(sides)) throw new Error(`Куб d${sides} не поддерживается`)
    if (count < 1 || count > MAX_DICE_PER_ROLL) {
      throw new Error(`Можно бросать от 1 до ${MAX_DICE_PER_ROLL} кубиков за раз`)
    }
    for (let i = 0; i < count; i++) rolls.push(rollDie(sides))
  }
  if (!found) throw new Error('Формат: 2d20+3')

  const total = rolls.reduce((a, b) => a + b, 0) + modifier
  return { expression: trimmed, total, rolls, modifier }
}

export function buildRollExpression(count, sides, modifier = 0) {
  if (modifier === 0) return `${count}d${sides}`
  return `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier}`
}

export function formatRollChatMessage(playerName, expression, rolls, modifier, total, isGm = false) {
  const who = isGm ? 'ГМ' : playerName
  const displayExpr = expression.replace(/([+-])/g, ' $1 ')
  const rollsPart = rolls.length ? `(${rolls.join(', ')})` : '—'
  const modSuffix = modifier !== 0 ? ` ${modifier > 0 ? '+ ' + modifier : '− ' + Math.abs(modifier)}` : ''
  return `${who} бросил ${displayExpr}. Выпало: ${rollsPart}${modSuffix}. Итог: ${total}`
}

export function extractAbilitySlotsFromText(text) {
  const src = String(text ?? '')
  const levels = []
  const regex = /(?:ур(?:овень)?\.?\s*|lvl\s*|level\s*)([1-7])|([1-7])\s*(?:ур(?:овень)?\.?|lvl|level)/gi
  let m
  while ((m = regex.exec(src)) !== null) {
    const value = Number(m[1] ?? m[2] ?? 0)
    if (value >= 1 && value <= 7 && !levels.includes(value)) levels.push(value)
  }
  for (let i = 1; i <= 7; i++) {
    if (!levels.includes(i) && new RegExp(`(^|\\D)${i}(\\D|$)`).test(src)) levels.push(i)
  }
  return levels.sort((a, b) => a - b)
}

export function extractAbilitySlotModesFromText(text) {
  const src = String(text ?? '')
  const base = []
  const plus = []
  const regex =
    /(?:ур(?:овень)?\.?\s*|lvl\s*|level\s*)([1-7])(\+)?|([1-7])(\+)?\s*(?:ур(?:овень)?\.?|lvl|level)/gi
  let m
  while ((m = regex.exec(src)) !== null) {
    const value = Number(m[1] ?? m[3] ?? 0)
    const isPlus = Boolean(m[2] ?? m[4])
    if (value < 1 || value > 7) continue
    if (isPlus) {
      if (!plus.includes(value)) plus.push(value)
    } else if (!base.includes(value)) {
      base.push(value)
    }
  }
  for (let i = 1; i <= 7; i++) {
    if (new RegExp(`(?:ур(?:овень)?\\.?\\s*|lvl\\s*|level\\s*)${i}\\+`, 'i').test(src) && !plus.includes(i)) {
      plus.push(i)
    }
    if (!base.includes(i) && new RegExp(`(^|\\D)${i}(\\D|$)`).test(src)) base.push(i)
  }
  return {
    base: base.sort((a, b) => a - b),
    plus: plus.sort((a, b) => a - b),
  }
}
