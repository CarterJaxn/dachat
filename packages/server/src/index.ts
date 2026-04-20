import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'

const server = Fastify({ logger: true })

await server.register(cors, { origin: true })
await server.register(websocket)

server.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

server.register(async function wsRoutes(fastify) {
  fastify.get('/ws', { websocket: true }, (socket) => {
    socket.on('message', (msg) => {
      socket.send(JSON.stringify({ echo: msg.toString() }))
    })
  })
})

const port = Number(process.env.PORT ?? 3001)
await server.listen({ port, host: '0.0.0.0' })
