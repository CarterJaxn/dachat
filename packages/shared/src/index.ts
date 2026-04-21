// Shared types used by both API and widget

export type WorkspaceId = string;
export type ContactId = string;
export type ConversationId = string;
export type MessageId = string;

export interface Workspace {
  id: WorkspaceId;
  name: string;
  apiKey: string;
  createdAt: string;
}

export interface Contact {
  id: ContactId;
  workspaceId: WorkspaceId;
  externalId?: string;
  email?: string;
  name?: string;
  createdAt: string;
}

export interface Conversation {
  id: ConversationId;
  workspaceId: WorkspaceId;
  contactId: ContactId;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: MessageId;
  conversationId: ConversationId;
  role: "visitor" | "operator";
  body: string;
  createdAt: string;
}

// WebSocket message types (widget ↔ API)
export type WsClientMsg =
  | { type: "visitor.identify"; externalId?: string; email?: string; name?: string }
  | { type: "visitor.message"; body: string }
  | { type: "ping" };

export type WsServerMsg =
  | { type: "session.ready"; conversationId: ConversationId; contactId: ContactId }
  | { type: "message.new"; message: Message }
  | { type: "pong" }
  | { type: "error"; code: string; message: string };

// WebSocket message types (operator dashboard ↔ API)
export type WsOperatorClientMsg =
  | { type: "operator.message"; conversationId: ConversationId; body: string }
  | { type: "ping" };

export type WsOperatorServerMsg =
  | { type: "connected"; workspaceId: WorkspaceId }
  | { type: "message.new"; message: Message }
  | { type: "conversation.new"; conversation: Conversation }
  | { type: "pong" }
  | { type: "error"; code: string; message: string };
