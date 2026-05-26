export const DICE_ROLL_COOLDOWN_MS = 5000

export function initRoomPresence(room) {
  if (!room.handsRaised) room.handsRaised = new Set()
  if (!room.diceAllowed) room.diceAllowed = new Set()
  if (!room.lastDiceRollAt) room.lastDiceRollAt = new Map()
}

export function serializePresence(room) {
  initRoomPresence(room)
  return {
    hands_raised: [...room.handsRaised],
    dice_allowed: [...room.diceAllowed],
  }
}

export function broadcastPresence(room, broadcast) {
  broadcast(room, { type: 'PRESENCE_UPDATE', ...serializePresence(room) })
}

export function clearPlayerPresence(room, playerId) {
  initRoomPresence(room)
  room.handsRaised.delete(playerId)
}
