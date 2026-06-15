import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { Server } from 'socket.io'
import { authRoutes } from './routes/auth'
import { marketRoutes } from './routes/market'
import { mailRoutes } from './routes/mail'
import { registerSocketHandlers } from './sockets'
import { loadMonsterTemplates } from './game/seedMonsters'
import { redis } from './lib/redis'

const fastify = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' } })

async function bootstrap() {
  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'

  await fastify.register(cors, { origin: clientUrl, credentials: true })
  await fastify.register(cookie)
  await fastify.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret-change-me' })

  await fastify.register(authRoutes,  { prefix: '/api/auth' })
  await fastify.register(marketRoutes, { prefix: '/api/market' })
  await fastify.register(mailRoutes,  { prefix: '/api/mail' })

  const io = new Server(fastify.server, {
    cors: { origin: clientUrl, methods: ['GET', 'POST'], credentials: true },
  })

  registerSocketHandlers(io)

  await redis.connect()
  await loadMonsterTemplates()

  const port = Number(process.env.PORT ?? 3000)
  await fastify.listen({ port, host: '0.0.0.0' })
  console.log(`[Server] Listening on port ${port}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
