import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { MARKET_ITEMS_PER_PAGE, MARKET_MAX_DURATION_HOURS } from '@idle-rpg/shared'

const jwtHook: FastifyPluginAsync['prototype']['addHook'] = async (request: any, reply: any) => {
  try { await request.jwtVerify() } catch { reply.status(401).send({ error: 'Unauthorized' }) }
}

const CreateListing = z.object({
  itemId:        z.string(),
  quantity:      z.number().int().positive(),
  priceEach:     z.number().int().positive(),
  durationHours: z.number().int().min(1).max(MARKET_MAX_DURATION_HOURS).default(24),
})

export const marketRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (req, rep) => {
    try { await req.jwtVerify() } catch { rep.status(401).send({ error: 'Unauthorized' }) }
  })

  // List active market listings
  fastify.get('/listings', async (request) => {
    const { itemId, page = '1' } = request.query as Record<string, string>
    const pg = Math.max(1, Number(page))
    const where = {
      active:    true,
      expiresAt: { gte: new Date() },
      ...(itemId ? { itemId } : {}),
    }

    const [listings, total] = await prisma.$transaction([
      prisma.marketListing.findMany({
        where,
        include:  { item: true, seller: { select: { username: true } } },
        orderBy:  { priceEach: 'asc' },
        take:     MARKET_ITEMS_PER_PAGE,
        skip:     (pg - 1) * MARKET_ITEMS_PER_PAGE,
      }),
      prisma.marketListing.count({ where }),
    ])

    return { listings, total, page: pg }
  })

  // Create a listing
  fastify.post('/list', async (request, reply) => {
    const body = CreateListing.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0].message })

    const playerId = (request.user as any).id

    return prisma.$transaction(async (tx) => {
      const inv = await tx.inventoryItem.findUnique({
        where: { playerId_itemId: { playerId, itemId: body.data.itemId } },
      })
      if (!inv || inv.quantity < body.data.quantity) {
        return reply.status(400).send({ error: 'Insufficient item quantity' })
      }

      await tx.inventoryItem.update({
        where: { playerId_itemId: { playerId, itemId: body.data.itemId } },
        data:  { quantity: { decrement: body.data.quantity } },
      })

      return tx.marketListing.create({
        data: {
          sellerId:  playerId,
          itemId:    body.data.itemId,
          quantity:  body.data.quantity,
          priceEach: body.data.priceEach,
          expiresAt: new Date(Date.now() + body.data.durationHours * 3_600_000),
        },
      })
    })
  })

  // Buy a listing
  fastify.post('/buy/:listingId', async (request, reply) => {
    const { listingId } = request.params as { listingId: string }
    const buyerId = (request.user as any).id

    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketListing.findFirst({
        where: { id: listingId, active: true, expiresAt: { gte: new Date() } },
      })
      if (!listing)                    return reply.status(404).send({ error: 'Listing not found or expired' })
      if (listing.sellerId === buyerId) return reply.status(400).send({ error: 'Cannot buy your own listing' })

      const totalCost = listing.priceEach * listing.quantity
      const buyer     = await tx.player.findUnique({ where: { id: buyerId }, select: { gold: true } })
      if (!buyer || buyer.gold < totalCost) return reply.status(400).send({ error: 'Not enough gold' })

      await tx.player.update({ where: { id: buyerId },          data: { gold: { decrement: totalCost } } })
      await tx.player.update({ where: { id: listing.sellerId }, data: { gold: { increment: totalCost } } })

      await tx.inventoryItem.upsert({
        where:  { playerId_itemId: { playerId: buyerId, itemId: listing.itemId } },
        update: { quantity: { increment: listing.quantity } },
        create: { playerId: buyerId, itemId: listing.itemId, quantity: listing.quantity },
      })

      await tx.marketListing.update({ where: { id: listingId }, data: { active: false } })
      return { success: true, totalCost }
    })
  })

  // Cancel own listing (returns items)
  fastify.delete('/listing/:listingId', async (request, reply) => {
    const { listingId } = request.params as { listingId: string }
    const playerId = (request.user as any).id

    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketListing.findFirst({
        where: { id: listingId, sellerId: playerId, active: true },
      })
      if (!listing) return reply.status(404).send({ error: 'Listing not found' })

      await tx.marketListing.update({ where: { id: listingId }, data: { active: false } })
      await tx.inventoryItem.upsert({
        where:  { playerId_itemId: { playerId, itemId: listing.itemId } },
        update: { quantity: { increment: listing.quantity } },
        create: { playerId, itemId: listing.itemId, quantity: listing.quantity },
      })
      return { success: true }
    })
  })
}
