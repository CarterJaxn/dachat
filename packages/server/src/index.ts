import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import jwt from '@fastify/jwt'
import { billingRoutes, billingWebhookRoute } from './routes/billing.js'
import { authRoutes } from './routes/auth.js'

const server = Fastify({ logger: true })

await server.register(cors, { origin: true })
await server.register(websocket)

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('JWT_SECRET is required')
await server.register(jwt, { secret: jwtSecret })

// Global auth guard — all routes except /auth/* and a small public allowlist require a valid JWT
const PUBLIC_EXACT = new Set(['/health', '/billing/plans', '/billing/webhooks/stripe'])
server.addHook('onRequest', async (request, reply) => {
  const path = request.url.split('?')[0]
  if (path.startsWith('/auth/') || PUBLIC_EXACT.has(path)) return
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

server.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

server.register(async function wsRoutes(fastify) {
  fastify.get('/ws', { websocket: true }, (connection) => {
    connection.socket.on('message', (msg: Buffer) => {
      connection.socket.send(JSON.stringify({ echo: msg.toString() }))
    })
  })
})

// Billing webhook must be registered before billingRoutes because it scopes
// its own content-type parser to capture the raw body for Stripe sig verification
await server.register(billingWebhookRoute)
await server.register(billingRoutes)
await server.register(authRoutes)

const port = Number(process.env.PORT ?? 3001)
await server.listen({ port, host: '0.0.0.0' })
