import type { FastifyPluginAsync } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import type { FastifyRequest } from 'fastify'
import { ClientMessage } from './protocol.js'
import { subscribeRoom, publishToRoom } from './pubsub.js'

// Tracks all active WebSocket connections per conversation room
const rooms = new Map<string, Set<SocketStream>>()

function joinRoom(conversationId: string, connection: SocketStream): void {
  if (!rooms.has(conversationId)) rooms.set(conversationId, new Set())
  rooms.get(conversationId)!.add(connection)
}

function leaveRoom(conversationId: string, connection: SocketStream): void {
  const room = rooms.get(conversationId)
  if (!room) return
  room.delete(connection)
  if (room.size === 0) rooms.delete(conversationId)
}

export const wsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/ws',
    { websocket: true },
    (connection: SocketStream, request: FastifyRequest) => {
      const { socket } = connection

      // Auth and room are established from query params since browsers can't
      // set Upgrade request headers; JWT is the same token issued by /auth/login
      const url = new URL(request.url, 'http://localhost')
      const token = url.searchParams.get('token')
      const conversationId = url.searchParams.get('conversationId')

      if (!token || !conversationId) {
        socket.close(1008, 'Missing token or conversationId')
        return
      }

      let user: { sub: string; email: string; role: string }
      try {
        user = fastify.jwt.verify<{ sub: string; email: string; role: string }>(token)
      } catch {
        socket.close(1008, 'Invalid or expired token')
        return
      }

      const senderType: 'operator' | 'contact' =
        user.role === 'admin' || user.role === 'agent' ? 'operator' : 'contact'

      joinRoom(conversationId, connection)

      // Forward Redis pub/sub events to this socket
      const unsubscribeRedis = subscribeRoom(conversationId, (msg) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(msg))
        }
      })

      // Auto-stop typing after 5s of no typing:start refresh (guards against dropped connections)
      const typingTimer = { current: null as ReturnType<typeof setTimeout> | null }

      function clearTypingTimer() {
        if (typingTimer.current !== null) {
          clearTimeout(typingTimer.current)
          typingTimer.current = null
        }
      }

      socket.on('message', (raw: Buffer) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw.toString())
        } catch {
          return
        }

        const result = ClientMessage.safeParse(parsed)
        if (!result.success) return

        const msg = result.data

        // Only handle messages for the room this connection joined
        if (msg.conversationId !== conversationId) return

        switch (msg.type) {
          case 'typing:start': {
            clearTypingTimer()
            publishToRoom(conversationId, {
              type: 'typing:start',
              conversationId,
              senderId: user.sub,
              senderType,
            })
            // Auto-stop typing after 5s in case the client loses connectivity
            typingTimer.current = setTimeout(() => {
              publishToRoom(conversationId, {
                type: 'typing:stop',
                conversationId,
                senderId: user.sub,
                senderType,
              })
              typingTimer.current = null
            }, 5000)
            break
          }

          case 'typing:stop': {
            clearTypingTimer()
            publishToRoom(conversationId, {
              type: 'typing:stop',
              conversationId,
              senderId: user.sub,
              senderType,
            })
            break
          }

          case 'receipt:read': {
            publishToRoom(conversationId, {
              type: 'receipt:read',
              conversationId,
              messageId: msg.messageId,
              readBy: user.sub,
            })
            break
          }
        }
      })

      socket.on('close', () => {
        clearTypingTimer()
        unsubscribeRedis()
        leaveRoom(conversationId, connection)
      })
    },
  )
}
