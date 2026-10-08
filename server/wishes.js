// VNG Premium — файловое хранилище заявок
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), 'data', 'wishes.json')
const data = loadData()
const wishes = new Map(data.wishes.map((wish) => [wish.id, wish]))
const premiumPlayers = new Map(Object.entries(data.premiumPlayers))

function loadData() {
  try {
    if (existsSync(DATA_FILE)) {
      const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
      return {
        wishes: Array.isArray(parsed.wishes) ? parsed.wishes : [],
        premiumPlayers: parsed.premiumPlayers && typeof parsed.premiumPlayers === 'object' ? parsed.premiumPlayers : {},
      }
    }
  } catch (error) {
    console.error('[premium] Не удалось загрузить заявки:', error)
  }
  return { wishes: [], premiumPlayers: {} }
}

function persistData() {
  mkdirSync(dirname(DATA_FILE), { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify({
    wishes: [...wishes.values()],
    premiumPlayers: Object.fromEntries(premiumPlayers),
  }, null, 2), 'utf8')
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/**
 * @param {string} playerId
 * @param {string} playerName
 * @param {{ text: string, contact: string, offeredPrice?: string }} opts
 * @returns {object} Wish
 */
export function createWish(playerId, playerName, { text, contact, offeredPrice }) {
  if (!text || typeof text !== 'string' || text.trim().length < 10 || text.trim().length > 2000) {
    throw new Error('Текст желания должен содержать от 10 до 2000 символов')
  }
  if (!contact || typeof contact !== 'string' || !contact.trim()) {
    throw new Error('Контакт обязателен')
  }

  const TERMINAL = ['rejected', 'refunded', 'done']
  const playerWishes = [...wishes.values()].filter((w) => w.playerId === playerId)

  // Check for active wish
  const hasActive = playerWishes.some((w) => !TERMINAL.includes(w.status))
  if (hasActive) {
    throw new Error('У вас уже есть активная заявка. Дождитесь её завершения')
  }

  // Rate limiting: не более 3 заявок за 24 часа
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const recentCount = playerWishes.filter((w) => new Date(w.createdAt).getTime() >= dayAgo).length
  if (recentCount >= 3) {
    throw new Error('Превышен лимит заявок: не более 3 за 24 часа')
  }

  const now = new Date().toISOString()
  const wish = {
    id: generateId(),
    playerId,
    playerName,
    contact: contact.trim(),
    text: text.trim(),
    offeredPrice: offeredPrice ? String(offeredPrice).trim() : null,
    finalPrice: null,
    status: 'new',
    adminNote: null,
    createdAt: now,
    updatedAt: now,
    doneAt: null,
    isRead: false,
  }
  wishes.set(wish.id, wish)
  persistData()
  return wish
}

/**
 * @param {string} playerId
 * @returns {object[]}
 */
export function getWishesByPlayer(playerId) {
  return [...wishes.values()].filter((w) => w.playerId === playerId)
}

/**
 * @returns {object[]}
 */
export function getAllWishes() {
  return [...wishes.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

/**
 * @param {string} wishId
 * @param {{ status?: string, finalPrice?: string, adminNote?: string }} updates
 * @param {string} adminPlayerId
 * @returns {object} Wish
 */
export function updateWish(wishId, updates, adminPlayerId) {
  const wish = wishes.get(wishId)
  if (!wish) throw new Error('Заявка не найдена')

  const ALLOWED_STATUSES = ['new', 'negotiating', 'paid', 'in_progress', 'done', 'rejected', 'refunded']

  if (updates.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(updates.status)) {
      throw new Error(`Недопустимый статус: ${updates.status}`)
    }
    wish.status = updates.status
  }
  if (updates.finalPrice !== undefined) {
    wish.finalPrice = updates.finalPrice ? String(updates.finalPrice).trim() : null
  }
  if (updates.adminNote !== undefined) {
    wish.adminNote = updates.adminNote !== null ? String(updates.adminNote) : null
  }

  wish.isRead = true
  wish.updatedAt = new Date().toISOString()

  // Side-effects based on status transitions
  if (wish.status === 'paid') {
    setPremiumPlayer(wish.playerId, { is_premium: true, wish_used: false })
  } else if (wish.status === 'done') {
    wish.doneAt = new Date().toISOString()
    setPremiumPlayer(wish.playerId, { is_premium: true, wish_used: true })
  } else if (wish.status === 'rejected' || wish.status === 'refunded') {
    setPremiumPlayer(wish.playerId, { is_premium: false, wish_used: false })
  }

  wishes.set(wishId, wish)
  persistData()
  return wish
}

/**
 * @returns {number}
 */
export function getUnreadCount() {
  let count = 0
  for (const w of wishes.values()) {
    if (!w.isRead) count++
  }
  return count
}

/**
 * @param {string} playerId
 * @returns {{ is_premium: boolean, wish_used: boolean } | null}
 */
export function getPremiumPlayer(playerId) {
  return premiumPlayers.get(playerId) ?? null
}

/**
 * @param {string} playerId
 * @param {{ is_premium: boolean, wish_used: boolean }} data
 */
export function setPremiumPlayer(playerId, data) {
  premiumPlayers.set(playerId, { is_premium: Boolean(data.is_premium), wish_used: Boolean(data.wish_used) })
  persistData()
}
