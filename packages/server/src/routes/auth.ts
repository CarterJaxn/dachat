import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { z, ZodError } from 'zod'
import bcrypt from 'bcrypt'
import { randomBytes } from 'node:crypto'
import { db, operators } from '../db/index.js'
import { authPreHandler } from '../middleware/auth.js'

// Sentinel used for invite-pending rows before registration is complete
const INVITE_PENDING = '__invite_pending__'
const BCRYPT_ROUNDS = 12

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const InviteBody = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'agent']).default('agent'),
})

const RegisterBody = z.object({
  inviteToken: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(8),
})

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues })
    }
    throw error
  })

  // POST /auth/login — validate email+password, return signed JWT (24h)
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = LoginBody.parse(request.body)

    const operator = await db.query.operators.findFirst({
      where: eq(operators.email, email),
    })

    if (!operator || operator.passwordHash === INVITE_PENDING) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, operator.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign(
      { sub: operator.id, email: operator.email, role: operator.role },
      { expiresIn: '24h' },
    )

    return {
      token,
      operator: { id: operator.id, email: operator.email, name: operator.name, role: operator.role },
    }
  })

  // POST /auth/invite — admin creates invite token, returns invite URL
  fastify.post('/auth/invite', { preHandler: authPreHandler }, async (request, reply) => {
    if (request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' })
    }

    const { email, role } = InviteBody.parse(request.body)

    const existing = await db.query.operators.findFirst({
      where: eq(operators.email, email),
    })
    if (existing) {
      return reply.code(409).send({ error: 'Operator with this email already exists' })
    }

    const inviteToken = randomBytes(32).toString('hex')

    await db.insert(operators).values({
      email,
      passwordHash: INVITE_PENDING,
      name: '',
      role,
      inviteToken,
      invitedAt: new Date(),
    })

    const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000'
    const inviteUrl = `${baseUrl}/register?token=${inviteToken}`

    reply.code(201)
    return { inviteUrl, inviteToken }
  })

  // POST /auth/register — consume invite token, set name+password, activate operator
  fastify.post('/auth/register', async (request, reply) => {
    const { inviteToken, name, password } = RegisterBody.parse(request.body)

    const operator = await db.query.operators.findFirst({
      where: eq(operators.inviteToken, inviteToken),
    })

    if (!operator || operator.passwordHash !== INVITE_PENDING) {
      return reply.code(400).send({ error: 'Invalid or expired invite token' })
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    const [updated] = await db
      .update(operators)
      .set({ passwordHash, name, inviteToken: null })
      .where(eq(operators.id, operator.id))
      .returning()

    const token = fastify.jwt.sign(
      { sub: updated.id, email: updated.email, role: updated.role },
      { expiresIn: '24h' },
    )

    reply.code(201)
    return {
      token,
      operator: { id: updated.id, email: updated.email, name: updated.name, role: updated.role },
    }
  })

  // GET /auth/me — verify JWT, return current operator
  fastify.get('/auth/me', { preHandler: authPreHandler }, async (request, reply) => {
    const operator = await db.query.operators.findFirst({
      where: eq(operators.id, request.user.sub),
    })

    if (!operator) {
      return reply.code(404).send({ error: 'Operator not found' })
    }

    return {
      operator: { id: operator.id, email: operator.email, name: operator.name, role: operator.role },
    }
  })
}
