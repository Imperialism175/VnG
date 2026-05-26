export const DICE_ROLL_COOLDOWN_MS = 5000

export function diceCooldownRemainingMs(lastRollAtMs: number, now = Date.now()): number {
  if (!lastRollAtMs) return 0
  return Math.max(0, DICE_ROLL_COOLDOWN_MS - (now - lastRollAtMs))
}

export function diceCooldownRemainingSec(lastRollAtMs: number, now = Date.now()): number {
  return Math.ceil(diceCooldownRemainingMs(lastRollAtMs, now) / 1000)
}
