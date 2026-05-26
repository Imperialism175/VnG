const DICE_PATTERN = /(\d*)d(\d+)/gi
const ALLOWED = [3, 4, 6, 8, 10, 12, 20, 100]

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
