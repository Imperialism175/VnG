/** Счётчик здоровья / HP — игрок не может менять сам, только ГМ */
export function isHealthCounterName(name) {
  return /здор|хп|hp/i.test(String(name ?? ''))
}

export function isInspirationCounterName(name) {
  return /вдох|inspir/i.test(String(name ?? ''))
}

/** Игрок сохраняет лист: HP остаётся как было, новые HP-счётчики не принимаются */
export function applyPlayerCounterPolicy(existing, incoming) {
  const prev = existing?.counters ?? []
  const inc = Array.isArray(incoming?.counters) ? incoming.counters : []
  const keptHealth = prev.filter((c) => isHealthCounterName(c.name))
  const keptInspiration = prev.filter((c) => isInspirationCounterName(c.name))
  const healthIds = new Set(keptHealth.map((c) => c.id))
  const inspirationIds = new Set(keptInspiration.map((c) => c.id))
  const rest = inc.filter(
    (c) =>
      !isHealthCounterName(c.name) &&
      !isInspirationCounterName(c.name) &&
      !healthIds.has(c.id) &&
      !inspirationIds.has(c.id)
  )
  return [...keptHealth, ...keptInspiration, ...rest]
}

/** @deprecated use applyPlayerCounterPolicy */
export function preserveHealthCounters(existing, incoming) {
  return applyPlayerCounterPolicy(existing, incoming)
}
