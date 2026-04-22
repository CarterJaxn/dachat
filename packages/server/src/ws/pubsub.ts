import { Redis } from 'ioredis'
import type { ServerMessage } from './protocol.js'

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379'

export const publisher = new Redis(redisUrl)
const sub = new Redis(redisUrl)

// Suppress unhandled error events — connection retries are handled by ioredis internally
publisher.on('error', () => {})
sub.on('error', () => {})

// channel → active handlers
const channelHandlers = new Map<string, Set<(msg: ServerMessage) => void>>()

sub.on('message', (channel: string, raw: string) => {
  const handlers = channelHandlers.get(channel)
  if (!handlers) return
  let msg: ServerMessage
  try {
    msg = JSON.parse(raw) as ServerMessage
  } catch {
    return
  }
  for (const h of handlers) h(msg)
})

function channelFor(conversationId: string): string {
  return `dachat:room:${conversationId}`
}

export function subscribeRoom(
  conversationId: string,
  handler: (msg: ServerMessage) => void,
): () => void {
  const channel = channelFor(conversationId)

  if (!channelHandlers.has(channel)) {
    channelHandlers.set(channel, new Set())
    sub.subscribe(channel)
  }
  channelHandlers.get(channel)!.add(handler)

  return () => {
    const handlers = channelHandlers.get(channel)
    if (!handlers) return
    handlers.delete(handler)
    if (handlers.size === 0) {
      channelHandlers.delete(channel)
      sub.unsubscribe(channel)
    }
  }
}

export function publishToRoom(conversationId: string, message: ServerMessage): void {
  publisher.publish(channelFor(conversationId), JSON.stringify(message)).catch(() => {})
}
