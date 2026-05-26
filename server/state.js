import os from 'node:os'

const SERVER_PORT = Number(process.env.PORT) || 3001
const MAX_ROLLS = 100
const MAX_CHAT = 200

/** @type {Map<string, any>} */
const rooms = new Map()

export function getLanAddresses() {
  const ips = []
  for (const iface of Object.values(os.networkInterfaces())) {
    if (!iface) continue
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) ips.push(cfg.address)
    }
  }
  return ips
}

export { rooms, SERVER_PORT, MAX_ROLLS, MAX_CHAT }
