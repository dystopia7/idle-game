import IORedis from 'ioredis'

export const redis = new IORedis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
})

redis.on('error', (err) => console.error('[Redis]', err.message))
