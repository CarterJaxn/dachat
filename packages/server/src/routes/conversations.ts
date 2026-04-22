import type { FastifyPluginAsync } from 'fastify'
import { eq, desc, and, asc } from 'drizzle-orm'
import { z, ZodError } from 'zod'
import { db, conversations, messages, contacts, attachments, readReceipts } from '../db/index.js'
import { authPreHandler } from '../middleware/auth.js'
import { publishToRoom } from '../ws/pubsub.js'

const ListConversationsQuery = z.object({
  status: z.enum(['open', 'pending', 'resolved']).optional(),
  assignedOperatorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const CreateConversationBody = z
  .object({
    contactId: z.string().uuid().optional(),
    contact: z
      .object({
        email: z.string().email().optional(),
        name: z.string().optional(),
        avatarUrl: z.string().url().optional(),
        metadata: z.record(z.unknown()).optional(),
      })
      .optional(),
    assignedOperatorId: z.string().uuid().optional(),
  })
  .refine((d) => !!(d.contactId ?? d.contact), {
    message: 'Either contactId or contact must be provided',
  })

const UpdateConversationBody = z
  .object({
    status: z.enum(['open', 'pending', 'resolved']).optional(),
    assignedOperatorId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.status !== undefined || d.assignedOperatorId !== undefined, {
    message: 'At least one of status or assignedOperatorId is required',
  })

const ListMessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const CreateMessageBody = z.object({
  content: z.string().min(1),
  senderType: z.enum(['operator', 'contact']).default('operator'),
  senderId: z.string().uuid().optional(),
})

const UploadAttachmentBody = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive().max(10 * 1024 * 1024), // 10 MB limit
  data: z.string().min(1), // base64-encoded file contents
  senderType: z.enum(['operator', 'contact']).default('contact'),
  senderId: z.string().uuid().optional(),
})

export const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues })
    }
    throw error
  })

  // GET /conversations
  fastify.get('/conversations', { preHandler: authPreHandler }, async (request) => {
    const { status, assignedOperatorId, limit, offset } = ListConversationsQuery.parse(
      request.query,
    )

    const conditions = []
    if (status) conditions.push(eq(conversations.status, status))
    if (assignedOperatorId) conditions.push(eq(conversations.assignedOperatorId, assignedOperatorId))

    const rows = await db.query.conversations.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        contact: true,
        assignedOperator: { columns: { id: true, email: true, name: true, role: true } },
      },
      orderBy: [desc(conversations.updatedAt)],
      limit,
      offset,
    })

    return { conversations: rows, limit, offset }
  })

  // POST /conversations
  fastify.post('/conversations', { preHandler: authPreHandler }, async (request, reply) => {
    const body = CreateConversationBody.parse(request.body)

    let contactId: string

    if (body.contactId) {
      contactId = body.contactId
    } else {
      const contactData = body.contact!

      if (contactData.email) {
        const [upserted] = await db
          .insert(contacts)
          .values({
            email: contactData.email,
            name: contactData.name,
            avatarUrl: contactData.avatarUrl,
            metadata: contactData.metadata,
          })
          .onConflictDoUpdate({
            target: contacts.email,
            set: {
              name: contactData.name,
              avatarUrl: contactData.avatarUrl,
              metadata: contactData.metadata,
            },
          })
          .returning()
        contactId = upserted.id
      } else {
        const [inserted] = await db
          .insert(contacts)
          .values({
            name: contactData.name,
            avatarUrl: contactData.avatarUrl,
            metadata: contactData.metadata,
          })
          .returning()
        contactId = inserted.id
      }
    }

    const [conv] = await db
      .insert(conversations)
      .values({ contactId, assignedOperatorId: body.assignedOperatorId })
      .returning()

    reply.code(201)
    return { conversation: conv }
  })

  // GET /conversations/:id
  fastify.get('/conversations/:id', { preHandler: authPreHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const conv = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: {
        contact: true,
        assignedOperator: { columns: { id: true, email: true, name: true, role: true } },
      },
    })

    if (!conv) return reply.code(404).send({ error: 'Conversation not found' })

    return { conversation: conv }
  })

  // PATCH /conversations/:id
  fastify.patch('/conversations/:id', { preHandler: authPreHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = UpdateConversationBody.parse(request.body)

    const existing = await db.query.conversations.findFirst({
      where: eq(conversations.id, id),
    })
    if (!existing) return reply.code(404).send({ error: 'Conversation not found' })

    const updates = {
      updatedAt: new Date(),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.assignedOperatorId !== undefined && {
        assignedOperatorId: body.assignedOperatorId,
      }),
    }

    const [updated] = await db
      .update(conversations)
      .set(updates)
      .where(eq(conversations.id, id))
      .returning()

    publishToRoom(id, {
      type: 'conversation:updated',
      conversationId: id,
      ...(body.status !== undefined && { status: body.status }),
      ...(body.assignedOperatorId !== undefined && {
        assignedOperatorId: body.assignedOperatorId,
      }),
    })

    return { conversation: updated }
  })

  // GET /conversations/:id/messages
  fastify.get(
    '/conversations/:id/messages',
    { preHandler: authPreHandler },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { limit, offset } = ListMessagesQuery.parse(request.query)

      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
      })
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' })

      const rows = await db.query.messages.findMany({
        where: eq(messages.conversationId, id),
        with: { attachments: true },
        orderBy: [asc(messages.createdAt)],
        limit,
        offset,
      })

      return { messages: rows, limit, offset }
    },
  )

  // POST /conversations/:id/messages
  fastify.post(
    '/conversations/:id/messages',
    { preHandler: authPreHandler },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = CreateMessageBody.parse(request.body)

      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
      })
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' })

      const senderId =
        body.senderId ??
        (body.senderType === 'operator' ? request.user.sub : conv.contactId)

      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: id,
          content: body.content,
          senderType: body.senderType,
          senderId,
        })
        .returning()

      // Bump conversation so it surfaces at the top of the list
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .returning()

      publishToRoom(id, {
        type: 'message:new',
        conversationId: id,
        message: {
          id: msg.id,
          conversationId: msg.conversationId,
          senderType: msg.senderType as 'operator' | 'contact',
          senderId: msg.senderId,
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
        },
      })

      reply.code(201)
      return { message: msg }
    },
  )

  // POST /conversations/:id/attachments — upload a file as a new message
  fastify.post(
    '/conversations/:id/attachments',
    { preHandler: authPreHandler },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = UploadAttachmentBody.parse(request.body)

      const conv = await db.query.conversations.findFirst({
        where: eq(conversations.id, id),
      })
      if (!conv) return reply.code(404).send({ error: 'Conversation not found' })

      const senderId =
        body.senderId ??
        (body.senderType === 'operator' ? request.user.sub : conv.contactId)

      // Create a message that carries the attachment
      const [msg] = await db
        .insert(messages)
        .values({
          conversationId: id,
          content: body.filename,
          senderType: body.senderType,
          senderId,
        })
        .returning()

      const dataUrl = `data:${body.mimeType};base64,${body.data}`
      const [attachment] = await db
        .insert(attachments)
        .values({
          messageId: msg.id,
          url: dataUrl,
          filename: body.filename,
          size: body.size,
          mimeType: body.mimeType,
        })
        .returning()

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, id))

      publishToRoom(id, {
        type: 'message:new',
        conversationId: id,
        message: {
          id: msg.id,
          conversationId: msg.conversationId,
          senderType: msg.senderType as 'operator' | 'contact',
          senderId: msg.senderId,
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
          attachments: [
            {
              id: attachment.id,
              url: attachment.url,
              filename: attachment.filename,
              size: attachment.size,
              mimeType: attachment.mimeType,
            },
          ],
        },
      })

      reply.code(201)
      return { message: msg, attachment }
    },
  )

  // POST /messages/:id/read — record operator read receipt and broadcast over WS
  fastify.post(
    '/messages/:id/read',
    { preHandler: authPreHandler },
    async (request, reply) => {
      const { id: messageId } = request.params as { id: string }

      const msg = await db.query.messages.findFirst({
        where: eq(messages.id, messageId),
      })
      if (!msg) return reply.code(404).send({ error: 'Message not found' })

      await db
        .insert(readReceipts)
        .values({ messageId, operatorId: request.user.sub })
        .onConflictDoNothing()

      publishToRoom(msg.conversationId, {
        type: 'receipt:read',
        conversationId: msg.conversationId,
        messageId,
        readBy: request.user.sub,
      })

      reply.code(204)
    },
  )
}
