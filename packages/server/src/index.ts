import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { billingRoutes, billingWebhookRoute } from './routes/billing.js'

const server = Fastify({ logger: true })

await server.register(cors, { origin: true })
await server.register(websocket)

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

const port = Number(process.env.PORT ?? 3001)
await server.listen({ port, host: '0.0.0.0' })
