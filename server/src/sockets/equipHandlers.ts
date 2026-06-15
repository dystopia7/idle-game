import type { Server, Socket } from 'socket.io'
import type { PrismaClient } from '@prisma/client'

export function registerEquipHandlers(_io: Server, socket: Socket, prisma: PrismaClient) {
  const playerId: string = socket.data.playerId

  socket.on('equip_item', async ({ inventoryItemId }: { inventoryItemId: string }) => {
    const invItem = await prisma.inventoryItem.findFirst({
      where:   { id: inventoryItemId, playerId },
      include: { item: true },
    })
    if (!invItem) return socket.emit('error', { message: 'Item not found' })
    if (invItem.equipped) return

    if (invItem.item.type === 'CONSUMABLE' || invItem.item.type === 'MATERIAL') {
      return socket.emit('error', { message: 'This item cannot be equipped' })
    }

    const playerLevel: number = socket.data.level ?? 1
    const playerClass: string = socket.data.playerClass ?? ''

    if (playerLevel < invItem.item.requiredLevel) {
      return socket.emit('error', { message: `Requires level ${invItem.item.requiredLevel}` })
    }
    if (invItem.item.requiredClass && invItem.item.requiredClass !== playerClass) {
      return socket.emit('error', { message: `Requires ${invItem.item.requiredClass} class` })
    }

    // Unequip the current item in the same slot type (if any)
    const currentlyEquipped = await prisma.inventoryItem.findMany({
      where:   { playerId, equipped: true },
      include: { item: { select: { type: true } } },
    })
    const sameSlot = currentlyEquipped.filter(e => e.item.type === invItem.item.type)
    if (sameSlot.length > 0) {
      await prisma.inventoryItem.updateMany({
        where: { id: { in: sameSlot.map(e => e.id) } },
        data:  { equipped: false },
      })
    }

    await prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data:  { equipped: true },
    })

    const inventory = await prisma.inventoryItem.findMany({
      where:   { playerId },
      include: { item: true },
    })
    socket.emit('inventory_update', inventory)
  })

  socket.on('unequip_item', async ({ inventoryItemId }: { inventoryItemId: string }) => {
    const invItem = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, playerId, equipped: true },
    })
    if (!invItem) return

    await prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data:  { equipped: false },
    })

    const inventory = await prisma.inventoryItem.findMany({
      where:   { playerId },
      include: { item: true },
    })
    socket.emit('inventory_update', inventory)
  })
}
