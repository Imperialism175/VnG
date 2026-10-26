import { randomUUID } from 'node:crypto'

const MAX_STROKES = 4000
const MAX_POINTS = 4000
const MAX_TEXT = 300
const TOOLS = ['pen', 'line', 'rect', 'ellipse', 'text']
const BACKGROUNDS = ['chalk', 'white', 'grid']

export function ensureBoard(room) {
  if (!room.board || !Array.isArray(room.board.strokes)) {
    room.board = { strokes: [], locked: false, background: 'chalk' }
  }
  if (typeof room.board.locked !== 'boolean') room.board.locked = false
  if (!BACKGROUNDS.includes(room.board.background)) room.board.background = 'chalk'
  return room.board
}

export function serializeBoard(room) {
  const board = ensureBoard(room)
  return { strokes: board.strokes, locked: board.locked, background: board.background }
}

export function canDrawOnBoard(room, isGm) {
  return isGm || !ensureBoard(room).locked
}

function clamp01(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.round(Math.max(-0.5, Math.min(1.5, n)) * 10000) / 10000
}

/** Точки хранятся в долях холста (0..1), чтобы доска одинаково выглядела на любом экране */
export function sanitizeStroke(raw, playerId) {
  const tool = TOOLS.includes(raw?.tool) ? raw.tool : 'pen'
  const color = typeof raw?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#f5f5f0'
  const widthRaw = Number(raw?.width)
  const width = Number.isFinite(widthRaw) ? Math.max(1, Math.min(80, Math.round(widthRaw))) : 4
  const src = Array.isArray(raw?.points) ? raw.points.slice(0, MAX_POINTS * 2) : []
  const points = []
  for (let i = 0; i + 1 < src.length; i += 2) {
    const x = clamp01(src[i])
    const y = clamp01(src[i + 1])
    if (x === null || y === null) continue
    points.push(x, y)
  }
  if (points.length < 2) return null
  const text = tool === 'text' ? String(raw?.text ?? '').trim().slice(0, MAX_TEXT) : ''
  if (tool === 'text' && !text) return null
  return {
    id: typeof raw?.id === 'string' && /^[\w-]{6,64}$/.test(raw.id) ? raw.id : randomUUID(),
    player_id: playerId,
    tool,
    color,
    width,
    points,
    ...(tool === 'text' ? { text } : {}),
  }
}

export function addStroke(room, stroke) {
  const board = ensureBoard(room)
  if (board.strokes.some((s) => s.id === stroke.id)) return false
  board.strokes.push(stroke)
  if (board.strokes.length > MAX_STROKES) board.strokes.splice(0, board.strokes.length - MAX_STROKES)
  return true
}

/** Игрок может стирать только свои штрихи, ГМ — любые */
export function removeStrokes(room, ids, playerId, isGm) {
  const board = ensureBoard(room)
  const wanted = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)))
  const removed = []
  board.strokes = board.strokes.filter((s) => {
    if (!wanted.has(s.id)) return true
    if (!isGm && s.player_id !== playerId) return true
    removed.push(s.id)
    return false
  })
  return removed
}

export function clearBoard(room) {
  ensureBoard(room).strokes = []
}

export function setBoardOptions(room, opts) {
  const board = ensureBoard(room)
  if (typeof opts?.locked === 'boolean') board.locked = opts.locked
  if (BACKGROUNDS.includes(opts?.background)) board.background = opts.background
}
