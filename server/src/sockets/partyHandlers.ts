import type { Server, Socket } from 'socket.io'
import type { PrismaClient } from '@prisma/client'

export function registerPartyHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  socket.on('create_party', async () => {
    await leaveCurrentParty(socket, prisma)

    const party = await prisma.party.create({
      data: {
        leaderId: socket.data.playerId,
        members:  { create: { playerId: socket.data.playerId } },
      },
    })

    socket.join(`party:${party.id}`)
    socket.data.partyId = party.id
    await broadcastPartyUpdate(io, party.id, prisma)
  })

  socket.on('join_party', async ({ partyId }: { partyId: string }) => {
    const party = await prisma.party.findUnique({ where: { id: partyId } })
    if (!party) return socket.emit('error', { message: 'Party not found' })

    const memberCount = await prisma.partyMember.count({ where: { partyId } })
    if (memberCount >= 4) return socket.emit('error', { message: 'Party is full (max 4)' })

    await leaveCurrentParty(socket, prisma)
    await prisma.partyMember.create({ data: { partyId, playerId: socket.data.playerId } })
    socket.join(`party:${partyId}`)
    socket.data.partyId = partyId
    await broadcastPartyUpdate(io, partyId, prisma)
  })

  socket.on('leave_party', () => leaveCurrentParty(socket, prisma))

  socket.on('disconnect', () => leaveCurrentParty(socket, prisma))
}

async function leaveCurrentParty(socket: Socket, prisma: PrismaClient) {
  const partyId: string | undefined = socket.data.partyId
  if (!partyId) return

  await prisma.partyMember.deleteMany({
    where: { playerId: socket.data.playerId, partyId },
  })
  socket.leave(`party:${partyId}`)
  socket.data.partyId = undefined

  const remaining = await prisma.partyMember.count({ where: { partyId } })
  if (remaining === 0) {
    await prisma.party.delete({ where: { id: partyId } })
  }
}

async function broadcastPartyUpdate(io: Server, partyId: string, prisma: PrismaClient) {
  const members = await prisma.partyMember.findMany({
    where:   { partyId },
    include: { player: { select: { id: true, username: true, hp: true, maxHp: true, level: true } } },
  })

  io.to(`party:${partyId}`).emit('party_update', {
    partyId,
    members: members.map((m) => m.player),
  })
}
