import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import jwt from '@fastify/jwt'
import { authRoutes } from './routes/auth.js'
import { conversationRoutes } from './routes/conversations.js'
import { widgetRoutes } from './routes/widget.js'
import { wsPlugin } from './ws/roomManager.js'

const server = Fastify({ logger: true })

await server.register(cors, { origin: true })
await server.register(websocket)

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) throw new Error('JWT_SECRET is required')
await server.register(jwt, { secret: jwtSecret })

// Global auth guard — all routes except /auth/* and a small public allowlist require a valid JWT
// /ws is excluded because WebSocket connections carry the JWT as a ?token= query param
const PUBLIC_EXACT = new Set(['/health', '/ws'])
server.addHook('onRequest', async (request, reply) => {
  const path = request.url.split('?')[0]
  if (path.startsWith('/auth/') || path.startsWith('/widget/') || PUBLIC_EXACT.has(path)) return
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

server.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

await server.register(wsPlugin)

await server.register(authRoutes)
await server.register(conversationRoutes)
await server.register(widgetRoutes)

const port = Number(process.env.PORT ?? 3001)
await server.listen({ port, host: '0.0.0.0' })
