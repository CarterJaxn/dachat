import type { WsServerEvent } from '../types.js'

type Listener = (event: WsServerEvent) => void

class WsManager {
  private socket: WebSocket | null = null
  private conversationId: string | null = null
  private token: string | null = null
  private listeners = new Set<Listener>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private intentionalClose = false

  connect(conversationId: string, token: string): void {
    if (
      this.socket &&
      this.conversationId === conversationId &&
      this.socket.readyState === WebSocket.OPEN
    ) {
      return
    }
    this.conversationId = conversationId
    this.token = token
    this.intentionalClose = false
    this._open()
  }

  disconnect(): void {
    this.intentionalClose = true
    this._clearReconnect()
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.conversationId = null
    this.token = null
  }

  send(msg: { type: string; conversationId: string; messageId?: string }): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg))
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private _open(): void {
    if (!this.conversationId || !this.token) return

    const url = new URL('/ws', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('token', this.token)
    url.searchParams.set('conversationId', this.conversationId)

    const ws = new WebSocket(url.toString())
    this.socket = ws

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as WsServerEvent
        this.listeners.forEach((l) => l(event))
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = () => {
      if (this.intentionalClose) return
      this._scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onopen = () => {
      this.reconnectDelay = 1000
    }
  }

  private _scheduleReconnect(): void {
    this._clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000)
      this._open()
    }, this.reconnectDelay)
  }

  private _clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

export const wsManager = new WsManager()
