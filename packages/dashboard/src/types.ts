export interface Operator {
  id: string
  email: string
  name: string
  role: 'admin' | 'agent'
}

export interface Contact {
  id: string
  email?: string | null
  name?: string | null
  avatarUrl?: string | null
  metadata?: Record<string, unknown> | null
}

export interface Conversation {
  id: string
  contactId: string
  status: 'open' | 'pending' | 'resolved'
  assignedOperatorId?: string | null
  contact: Contact
  assignedOperator?: { id: string; email: string; name: string; role: string } | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  conversationId: string
  senderType: 'operator' | 'contact'
  senderId: string
  content: string
  createdAt: string
}

export type WsServerEvent =
  | { type: 'message:new'; conversationId: string; message: Message }
  | { type: 'typing:start'; conversationId: string; senderId: string; senderType: 'operator' | 'contact' }
  | { type: 'typing:stop'; conversationId: string; senderId: string; senderType: 'operator' | 'contact' }
  | { type: 'receipt:read'; conversationId: string; messageId: string; readBy: string }
  | { type: 'conversation:updated'; conversationId: string; status?: 'open' | 'pending' | 'resolved'; assignedOperatorId?: string | null }
