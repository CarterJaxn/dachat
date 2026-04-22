export interface Attachment {
  id: string
  url: string
  filename: string
  size: number
  mimeType: string
}

export interface Message {
  id: string
  conversationId: string
  senderType: 'operator' | 'contact'
  senderId: string
  content: string
  createdAt: string
  attachments?: Attachment[]
  read?: boolean
}

export type WsEvent =
  | {
      type: 'message:new'
      conversationId: string
      message: Message
    }
  | {
      type: 'typing:start'
      conversationId: string
      senderId: string
      senderType: 'operator' | 'contact'
    }
  | {
      type: 'typing:stop'
      conversationId: string
      senderId: string
      senderType: 'operator' | 'contact'
    }
  | {
      type: 'receipt:read'
      conversationId: string
      messageId: string
      readBy: string
    }
  | {
      type: 'conversation:updated'
      conversationId: string
      status?: 'open' | 'pending' | 'resolved'
      assignedOperatorId?: string | null
    }
