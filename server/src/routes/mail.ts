import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { MAX_MAIL_INBOX } from '@idle-rpg/shared'

const SendMail = z.object({
  to:          z.string(),
  subject:     z.string().max(100),
  body:        z.string().max(1000),
  goldAmount:  z.number().int().min(0).default(0),
  attachments: z.array(z.object({ itemId: z.string(), quantity: z.number().int().positive() })).max(5).default([]),
})

export const mailRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (req, rep) => {
    try { await req.jwtVerify() } catch { rep.status(401).send({ error: 'Unauthorized' }) }
  })

  fastify.get('/inbox', async (request) => {
    const playerId = (request.user as any).id
    return prisma.mail.findMany({
      where:   { receiverId: playerId },
      include: { sender: { select: { username: true } }, attachments: { include: { item: true } } },
      orderBy: { createdAt: 'desc' },
      take:    MAX_MAIL_INBOX,
    })
  })

  fastify.post('/send', async (request, reply) => {
    const body = SendMail.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0].message })

    const senderId = (request.user as any).id
    const receiver = await prisma.player.findUnique({ where: { username: body.data.to }, select: { id: true } })
    if (!receiver)            return reply.status(404).send({ error: 'Player not found' })
    if (receiver.id === senderId) return reply.status(400).send({ error: 'Cannot mail yourself' })

    return prisma.$transaction(async (tx) => {
      if (body.data.goldAmount > 0) {
        const sender = await tx.player.findUnique({ where: { id: senderId }, select: { gold: true } })
        if (!sender || sender.gold < body.data.goldAmount) {
          return reply.status(400).send({ error: 'Not enough gold' })
        }
        await tx.player.update({ where: { id: senderId }, data: { gold: { decrement: body.data.goldAmount } } })
      }

      for (const att of body.data.attachments) {
        const inv = await tx.inventoryItem.findUnique({
          where: { playerId_itemId: { playerId: senderId, itemId: att.itemId } },
        })
        if (!inv || inv.quantity < att.quantity) {
          return reply.status(400).send({ error: `Insufficient quantity for item ${att.itemId}` })
        }
        await tx.inventoryItem.update({
          where: { playerId_itemId: { playerId: senderId, itemId: att.itemId } },
          data:  { quantity: { decrement: att.quantity } },
        })
      }

      return tx.mail.create({
        data: {
          senderId,
          receiverId:  receiver.id,
          subject:     body.data.subject,
          body:        body.data.body,
          goldAmount:  body.data.goldAmount,
          attachments: { create: body.data.attachments },
        },
      })
    })
  })

  fastify.post('/claim/:mailId', async (request, reply) => {
    const { mailId } = request.params as { mailId: string }
    const playerId   = (request.user as any).id

    return prisma.$transaction(async (tx) => {
      const mail = await tx.mail.findFirst({
        where:   { id: mailId, receiverId: playerId, claimed: false },
        include: { attachments: true },
      })
      if (!mail) return reply.status(404).send({ error: 'Mail not found or already claimed' })

      if (mail.goldAmount > 0) {
        await tx.player.update({ where: { id: playerId }, data: { gold: { increment: mail.goldAmount } } })
      }

      for (const att of mail.attachments) {
        await tx.inventoryItem.upsert({
          where:  { playerId_itemId: { playerId, itemId: att.itemId } },
          update: { quantity: { increment: att.quantity } },
          create: { playerId, itemId: att.itemId, quantity: att.quantity },
        })
      }

      await tx.mail.update({ where: { id: mailId }, data: { read: true, claimed: true } })
      return { success: true }
    })
  })

  fastify.delete('/:mailId', async (request, reply) => {
    const { mailId } = request.params as { mailId: string }
    const playerId   = (request.user as any).id

    const mail = await prisma.mail.findFirst({ where: { id: mailId, receiverId: playerId, claimed: true } })
    if (!mail) return reply.status(404).send({ error: 'Mail not found or has unclaimed items' })

    await prisma.mail.delete({ where: { id: mailId } })
    return { success: true }
  })
}
