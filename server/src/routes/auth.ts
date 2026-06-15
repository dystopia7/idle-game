import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { CLASS_BASE_STATS, PLAYER_CLASSES, type PlayerClass } from '@idle-rpg/shared'

const STARTING_ITEMS: Record<PlayerClass, string[]> = {
  KNIGHT:   ['Worn Sword',    'Iron Cap',      'Padded Cuirass',   'Iron Greaves',    'Iron Sabatons'],
  PALADIN:  ['Shortbow',      "Scout's Cap",   "Scout's Jerkin",   "Scout's Leggings","Scout's Boots"],
  SORCERER: ['Cracked Wand',  'Novice Hood',   'Novice Robe',      'Novice Leggings', 'Novice Slippers'],
  DRUID:    ['Crooked Branch','Bark Cap',       'Bark Vest',        'Bark Leggings',   'Bark Shoes'],
}

const RegisterBody = z.object({
  username:    z.string().min(3).max(20).regex(/^\w+$/, 'Alphanumeric and underscores only'),
  email:       z.string().email(),
  password:    z.string().min(6).max(72),
  playerClass: z.enum(PLAYER_CLASSES),
})

const UsernameParam = z.string().min(3).max(20).regex(/^\w+$/, 'Alphanumeric and underscores only')

const LoginBody = z.object({
  username: z.string(),
  password: z.string(),
})

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/check-username', async (request, reply) => {
    const { username } = request.query as { username?: string }
    const parsed = UsernameParam.safeParse(username)
    if (!parsed.success) return reply.send({ available: false, error: parsed.error.issues[0].message })
    const existing = await prisma.player.findUnique({ where: { username: parsed.data }, select: { id: true } })
    return reply.send({ available: !existing })
  })

  fastify.post('/register', async (request, reply) => {
    const body = RegisterBody.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0].message })

    const hashed = await bcrypt.hash(body.data.password, 10)
    const stats  = CLASS_BASE_STATS[body.data.playerClass]
    try {
      const player = await prisma.player.create({
        data: {
          username:    body.data.username,
          email:       body.data.email,
          password:    hashed,
          playerClass: body.data.playerClass,
          hp:          stats.hp,
          maxHp:       stats.hp,
          mana:        stats.mana,
          maxMana:     stats.mana,
          attack:      stats.attack,
          defense:     stats.defense,
          speed:       stats.speed,
        },
        select: { id: true, username: true, level: true, gold: true },
      })
      const itemNames = STARTING_ITEMS[body.data.playerClass]
      const items = await prisma.item.findMany({ where: { name: { in: itemNames } } })
      if (items.length > 0) {
        await prisma.inventoryItem.createMany({
          data: items.map(item => ({ playerId: player.id, itemId: item.id, quantity: 1, equipped: true })),
          skipDuplicates: true,
        })
      }

      const token = fastify.jwt.sign({ id: player.id, username: player.username })
      return reply.send({ token, player })
    } catch (err: any) {
      if (err.code === 'P2002') return reply.status(409).send({ error: 'Username or email already taken' })
      throw err
    }
  })

  fastify.post('/login', async (request, reply) => {
    const body = LoginBody.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid input' })

    const player = await prisma.player.findUnique({ where: { username: body.data.username } })
    if (!player || !(await bcrypt.compare(body.data.password, player.password))) {
      return reply.status(401).send({ error: 'Invalid username or password' })
    }

    const token = fastify.jwt.sign({ id: player.id, username: player.username })
    return reply.send({
      token,
      player: { id: player.id, username: player.username, level: player.level, gold: player.gold },
    })
  })
}
