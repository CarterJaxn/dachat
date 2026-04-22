import type { FastifyPluginAsync } from 'fastify'
import { z, ZodError } from 'zod'
import { db, contacts, conversations } from '../db/index.js'

const StartSessionBody = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const widgetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues })
    }
    throw error
  })

  // POST /widget/sessions — public; creates (or reuses) a contact + conversation
  // Returns a short-lived widget JWT for use with /ws and message endpoints
  fastify.post('/widget/sessions', async (request, reply) => {
    const body = StartSessionBody.parse(request.body)

    let contactId: string

    if (body.email) {
      const [upserted] = await db
        .insert(contacts)
        .values({ email: body.email, name: body.name, metadata: body.metadata })
        .onConflictDoUpdate({
          target: contacts.email,
          set: { name: body.name, metadata: body.metadata },
        })
        .returning()
      contactId = upserted.id
    } else {
      const [inserted] = await db
        .insert(contacts)
        .values({ name: body.name, metadata: body.metadata })
        .returning()
      contactId = inserted.id
    }

    const [conv] = await db.insert(conversations).values({ contactId }).returning()

    // Widget JWTs use role:'contact' so the WS handler identifies them as contact senders
    const token = fastify.jwt.sign(
      { sub: contactId, email: body.email ?? '', role: 'contact' },
      { expiresIn: '7d' },
    )

    reply.code(201)
    return { token, conversationId: conv.id, contactId }
  })
}
