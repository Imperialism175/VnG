import type { ClientMessage, ServerMessage } from '@/lib/normalize'
import { getWsUrl } from '@/lib/runtime'

type MessageHandler = (msg: ServerMessage) => void
type StatusHandler = (connected: boolean) => void

export class RoomSocket {
  private ws: WebSocket | null = null
  private handlers = new Set<MessageHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private roomId: string
  private playerId: string
  private closed = false

  constructor(roomId: string, playerId: string) {
    this.roomId = roomId
    this.playerId = playerId
  }

  connect() {
    this.closed = false
    this.ws = new WebSocket(getWsUrl(this.roomId, this.playerId))

    this.ws.onopen = () => this.statusHandlers.forEach((h) => h(true))

    this.ws.onmessage = (ev) => {
      try {
        this.handlers.forEach((h) => h(JSON.parse(ev.data as string) as ServerMessage))
      } catch {
        /* ignore */
      }
    }

    this.ws.onclose = () => {
      this.statusHandlers.forEach((h) => h(false))
      if (!this.closed) this.reconnectTimer = setTimeout(() => this.connect(), 2000)
    }

    this.ws.onerror = () => this.ws?.close()
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  disconnect() {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}
