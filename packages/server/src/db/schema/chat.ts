import { pgTable, text, timestamp, uuid, jsonb, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const operators = pgTable('operators', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('agent'), // admin | agent
  inviteToken: text('invite_token'),
  invitedAt: timestamp('invited_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  status: text('status').notNull().default('open'), // open | pending | resolved
  assignedOperatorId: uuid('assigned_operator_id').references(() => operators.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  senderType: text('sender_type').notNull(), // operator | contact
  senderId: uuid('sender_id').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id),
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const readReceipts = pgTable('read_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id),
  operatorId: uuid('operator_id')
    .notNull()
    .references(() => operators.id),
  readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
})

// Relations

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  assignedOperator: one(operators, {
    fields: [conversations.assignedOperatorId],
    references: [operators.id],
  }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  attachments: many(attachments),
  readReceipts: many(readReceipts),
}))

export const contactsRelations = relations(contacts, ({ many }) => ({
  conversations: many(conversations),
}))

export const operatorsRelations = relations(operators, ({ many }) => ({
  assignedConversations: many(conversations),
  readReceipts: many(readReceipts),
}))

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}))

export const readReceiptsRelations = relations(readReceipts, ({ one }) => ({
  message: one(messages, { fields: [readReceipts.messageId], references: [messages.id] }),
  operator: one(operators, { fields: [readReceipts.operatorId], references: [operators.id] }),
}))
