import type { WsEvent } from '../types.js'

type Listener = (event: WsEvent) => void

class WsManager {
  private socket: WebSocket | null = null
  private listeners: Set<Listener> = new Set()
  private conversationId: string | null = null
  private token: string | null = null
  private retryDelay = 1000
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  connect(conversationId: string, token: string): void {
    if (this.socket && this.conversationId === conversationId) return
    this.conversationId = conversationId
    this.token = token
    this.destroyed = false
    this.openSocket()
  }

  private openSocket(): void {
    if (!this.conversationId || !this.token || this.destroyed) return

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${location.host}/ws?token=${encodeURIComponent(this.token)}&conversationId=${encodeURIComponent(this.conversationId)}`
    const ws = new WebSocket(url)
    this.socket = ws

    ws.onopen = () => {
      this.retryDelay = 1000
    }

    ws.onmessage = (ev) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(ev.data as string)
      } catch {
        return
      }
      this.listeners.forEach((l) => l(parsed as WsEvent))
    }

    ws.onclose = (ev) => {
      this.socket = null
      if (this.destroyed || ev.code === 1008) return
      this.retryTimer = setTimeout(() => {
        this.retryDelay = Math.min(this.retryDelay * 2, 30000)
        this.openSocket()
      }, this.retryDelay)
    }
  }

  send(msg: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg))
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  disconnect(): void {
    this.destroyed = true
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.socket?.close()
    this.socket = null
    this.conversationId = null
    this.token = null
  }
}

export const wsManager = new WsManager()
