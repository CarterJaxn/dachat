import { z } from 'zod'

// ─── Client → Server ─────────────────────────────────────────────────────────

export const ClientTypingStart = z.object({
  type: z.literal('typing:start'),
  conversationId: z.string().uuid(),
})

export const ClientTypingStop = z.object({
  type: z.literal('typing:stop'),
  conversationId: z.string().uuid(),
})

export const ClientReceiptRead = z.object({
  type: z.literal('receipt:read'),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
})

export const ClientMessage = z.discriminatedUnion('type', [
  ClientTypingStart,
  ClientTypingStop,
  ClientReceiptRead,
])

// ─── Server → Client ─────────────────────────────────────────────────────────

export const ServerMessageNew = z.object({
  type: z.literal('message:new'),
  conversationId: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    senderType: z.enum(['operator', 'contact']),
    senderId: z.string().uuid(),
    content: z.string(),
    createdAt: z.string(),
  }),
})

export const ServerTypingStart = z.object({
  type: z.literal('typing:start'),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderType: z.enum(['operator', 'contact']),
})

export const ServerTypingStop = z.object({
  type: z.literal('typing:stop'),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderType: z.enum(['operator', 'contact']),
})

export const ServerReceiptRead = z.object({
  type: z.literal('receipt:read'),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  readBy: z.string().uuid(),
})

export const ServerConversationUpdated = z.object({
  type: z.literal('conversation:updated'),
  conversationId: z.string().uuid(),
  status: z.enum(['open', 'pending', 'resolved']).optional(),
  assignedOperatorId: z.string().uuid().nullable().optional(),
})

export const ServerMessage = z.discriminatedUnion('type', [
  ServerMessageNew,
  ServerTypingStart,
  ServerTypingStop,
  ServerReceiptRead,
  ServerConversationUpdated,
])

export type ClientMessage = z.infer<typeof ClientMessage>
export type ServerMessage = z.infer<typeof ServerMessage>
