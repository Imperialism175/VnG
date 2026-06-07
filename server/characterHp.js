/** Счётчик здоровья / HP — игрок не может менять сам, только ГМ */
export function isHealthCounterName(name) {
  return /здор|хп|hp/i.test(String(name ?? ''))
}

export function isInspirationCounterName(name) {
  return /вдох|inspir/i.test(String(name ?? ''))
}

function roundCounter(n) {
  return Math.max(0, Math.round(Number(n) || 0))
}

/** Слияние HP: игрок не меняет current вручную, но max растёт от траты очков на ХП */
function mergeHealthCounter(prevHealth, incHealth) {
  if (!prevHealth && incHealth) {
    const max = roundCounter(incHealth.max)
    const current = roundCounter(incHealth.current)
    return [{ ...incHealth, max, current: Math.min(current, max) }]
  }
  if (prevHealth && !incHealth) return [{ ...prevHealth }]
  if (!prevHealth && !incHealth) return []

  const prevMax = roundCounter(prevHealth.max)
  const incMax = roundCounter(incHealth.max)
  const prevCurrent = roundCounter(prevHealth.current)
  const incCurrent = roundCounter(incHealth.current)

  let nextCurrent = prevCurrent
  if (incMax > prevMax) {
    nextCurrent = incMax
  } else if (incCurrent < prevCurrent) {
    nextCurrent = Math.max(0, Math.min(incCurrent, incMax))
  } else {
    nextCurrent = Math.min(prevCurrent, incMax)
  }

  return [
    {
      ...prevHealth,
      name: incHealth.name || prevHealth.name,
      max: incMax,
      current: nextCurrent,
    },
  ]
}

/** Игрок сохраняет лист: HP current только от ГМ/урона; max — от очков на ХП */
export function applyPlayerCounterPolicy(existing, incoming) {
  const prev = Array.isArray(existing?.counters) ? existing.counters : []
  const inc = Array.isArray(incoming?.counters) ? incoming.counters : []
  const prevHealth = prev.find((c) => isHealthCounterName(c.name))
  const incHealth = inc.find((c) => isHealthCounterName(c.name))
  const keptInspiration = prev.filter((c) => isInspirationCounterName(c.name))
  const mergedHealth = mergeHealthCounter(prevHealth, incHealth)
  const healthIds = new Set(mergedHealth.map((c) => String(c.id)))
  const inspirationIds = new Set(keptInspiration.map((c) => String(c.id)))
  const rest = inc.filter(
    (c) =>
      !isHealthCounterName(c.name) &&
      !isInspirationCounterName(c.name) &&
      !healthIds.has(String(c.id)) &&
      !inspirationIds.has(String(c.id))
  )
  return [...mergedHealth, ...keptInspiration, ...rest]
}

/** @deprecated use applyPlayerCounterPolicy */
export function preserveHealthCounters(existing, incoming) {
  return applyPlayerCounterPolicy(existing, incoming)
}
