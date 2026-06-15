import type { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { registerCombatHandlers } from './combatHandlers'
import { registerPartyHandlers } from './partyHandlers'
import { registerEquipHandlers } from './equipHandlers'
import { loadPlayerSkills } from '../game/skills'
import {
  ensureZoneInitialized,
  setPlayerPosition,
  updatePlayerSkills,
  removePlayerFromZone,
  getPlayerCount,
  getMonsterPosition,
  startZoneLoop,
  stopZoneLoop,
  clearDeadPlayer,
} from '../game/zoneLoop'
import { spawnMonstersForPlayer, despawnMonstersForPlayer, isKnownZone } from '../game/seedMonsters'
import {
  OFFLINE_GOLD_PER_SEC_PER_LEVEL,
  MAX_CHAT_LENGTH,
  GRID_COLS,
  GRID_ROWS,
} from '@idle-rpg/shared'

const DEFAULT_X = Math.floor(GRID_COLS / 2)
const DEFAULT_Y = Math.floor(GRID_ROWS / 2)

const pendingCleanup = new Map<string, ReturnType<typeof setTimeout>>()

async function broadcastOnlinePlayers(io: Server) {
  const all = await redis.hgetall('online_players')
  const list = Object.values(all ?? {}).map(raw => {
    const p = JSON.parse(raw)
    return { username: p.username, playerClass: p.playerClass, level: p.level, zone: p.zone }
  })
  io.emit('online_players', list)
}

export function registerSocketHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined
    if (!token) return next(new Error('No token'))

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret-change-me') as {
        id: string
        username: string
      }
      socket.data.playerId = payload.id
      socket.data.username = payload.username
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', async (socket: Socket) => {
    const { playerId, username } = socket.data as { playerId: string; username: string }

    const player = await prisma.player.findUnique({
      where:   { id: playerId },
      include: { inventory: { include: { item: true } } },
    })
    if (!player) return socket.disconnect()

    const isQuickReconnect = pendingCleanup.has(playerId)
    if (isQuickReconnect) {
      clearTimeout(pendingCleanup.get(playerId)!)
      pendingCleanup.delete(playerId)
    }

    await redis.hset('online_players', playerId, JSON.stringify({
      username, socketId: socket.id,
      playerClass: player.playerClass, level: player.level, zone: player.currentZone,
    }))
    await broadcastOnlinePlayers(io)

    const secondsAway = Math.floor((Date.now() - new Date(player.lastSeen).getTime()) / 1000)
    const offlineGold = Math.floor(secondsAway * OFFLINE_GOLD_PER_SEC_PER_LEVEL * player.level)

    if (offlineGold > 0) {
      await prisma.player.update({
        where: { id: playerId },
        data:  { gold: { increment: offlineGold }, lastSeen: new Date() },
      })
    }

    const skills = await loadPlayerSkills(prisma, playerId)
    socket.data.skills      = skills
    socket.data.level       = player.level
    socket.data.hp          = player.hp
    socket.data.maxHp       = player.maxHp
    socket.data.mana        = player.mana
    socket.data.maxMana     = player.maxMana
    socket.data.playerClass = player.playerClass
    socket.data.posX    = player.posX ?? DEFAULT_X
    socket.data.posY    = player.posY ?? DEFAULT_Y

    socket.emit('init', {
      player:      { ...player, gold: player.gold + offlineGold },
      offlineGold,
      skills,
    })

    // Fall back to town if the stored zone no longer has templates (e.g. after a remap)
    const rawZone = player.currentZone ?? 'town'
    const restoredZone = isKnownZone(rawZone) ? rawZone : 'town'
    if (restoredZone !== rawZone) {
      await prisma.player.update({ where: { id: playerId }, data: { currentZone: 'town' } })
    }
    socket.data.currentZone = restoredZone
    socket.join(`zone:${restoredZone}`)
    socket.emit('zone_entered', { zone: restoredZone })

    if (restoredZone !== 'town') {
      await ensureZoneInitialized(restoredZone)
      setPlayerPosition(restoredZone, playerId, socket.id, socket.data.posX, socket.data.posY, socket.data.skills ?? [])
      startZoneLoop(io, restoredZone)

      const zoneSockets = await io.in(`zone:${restoredZone}`).fetchSockets()
      const others = zoneSockets
        .filter(s => s.data.playerId !== playerId)
        .map(s => ({
          id:       s.data.playerId as string,
          username: s.data.username as string,
          level:    (s.data.level   as number) ?? 1,
          hp:       (s.data.hp      as number) ?? 1,
          maxHp:    (s.data.maxHp   as number) ?? 1,
          x:        (s.data.posX    as number) ?? DEFAULT_X,
          y:        (s.data.posY    as number) ?? DEFAULT_Y,
        }))
      socket.emit('zone_players', { players: others })

      socket.to(`zone:${restoredZone}`).emit('player_joined', {
        id:       playerId,
        username,
        level:    player.level,
        hp:       player.hp,
        maxHp:    player.maxHp,
        x:        socket.data.posX,
        y:        socket.data.posY,
      })

      const allMonsters = await redis.hgetall('monsters')
      for (const [id, raw] of Object.entries(allMonsters)) {
        const m = JSON.parse(raw)
        if (m.zone !== restoredZone) continue
        const pos = getMonsterPosition(id) ?? { tileX: m.spawnX, tileY: m.spawnY }
        socket.emit('monster_update', {
          id, name: m.name, level: m.level, hp: m.hp, maxHp: m.maxHp, zone: m.zone, ...pos,
        })
      }

      if (!isQuickReconnect) await spawnMonstersForPlayer(io, restoredZone, playerId)
    }

    registerCombatHandlers(io, socket, prisma)
    registerPartyHandlers(io, socket, prisma)
    registerEquipHandlers(io, socket, prisma)

    socket.on('travel', async ({ zone }: { zone: string }) => {
      if (!isKnownZone(zone)) {
        console.warn(`[travel] rejected unknown zone "${zone}" for player ${playerId}`)
        return
      }

      const prevZone: string = socket.data.currentZone ?? 'town'

      // Leave previous zone and clean up position tracking
      socket.leave(`zone:${prevZone}`)
      if (prevZone !== 'town') {
        removePlayerFromZone(prevZone, playerId)
        socket.to(`zone:${prevZone}`).emit('player_left', { id: playerId })
        if (getPlayerCount(prevZone) === 0) stopZoneLoop(prevZone)
        await despawnMonstersForPlayer(io, prevZone, playerId)
      }

      // Reset position to grid centre on zone change
      socket.data.posX = DEFAULT_X
      socket.data.posY = DEFAULT_Y
      socket.data.currentZone = zone
      socket.join(`zone:${zone}`)
      await prisma.player.update({ where: { id: playerId }, data: { currentZone: zone } })

      // Update zone in online players list
      const onlineRaw = await redis.hget('online_players', playerId)
      if (onlineRaw) {
        await redis.hset('online_players', playerId, JSON.stringify({ ...JSON.parse(onlineRaw), zone }))
        await broadcastOnlinePlayers(io)
      }

      // Heal and restore mana to full when returning to the safe zone
      if (zone === 'town') {
        clearDeadPlayer(playerId)
        const maxHp   = socket.data.maxHp   as number
        const maxMana = socket.data.maxMana as number
        await prisma.player.update({ where: { id: playerId }, data: { hp: maxHp, mana: maxMana } })
        socket.data.hp   = maxHp
        socket.data.mana = maxMana
        socket.emit('player_update', { hp: maxHp, mana: maxMana })
      }

      socket.emit('zone_entered', { zone })

      if (zone !== 'town') {
        await ensureZoneInitialized(zone)

        setPlayerPosition(zone, playerId, socket.id, DEFAULT_X, DEFAULT_Y, socket.data.skills ?? [])
        startZoneLoop(io, zone)

        // Tell the arriving player who else is already in the zone
        const zoneSockets = await io.in(`zone:${zone}`).fetchSockets()
        const others = zoneSockets
          .filter(s => s.data.playerId !== playerId)
          .map(s => ({
            id:       s.data.playerId as string,
            username: s.data.username as string,
            level:    (s.data.level   as number) ?? 1,
            hp:       (s.data.hp      as number) ?? 1,
            maxHp:    (s.data.maxHp   as number) ?? 1,
            x:        (s.data.posX    as number) ?? DEFAULT_X,
            y:        (s.data.posY    as number) ?? DEFAULT_Y,
          }))
        socket.emit('zone_players', { players: others })

        // Announce arrival to everyone already in the zone
        socket.to(`zone:${zone}`).emit('player_joined', {
          id:       playerId,
          username,
          level:    player.level,
          hp:       player.hp,
          maxHp:    player.maxHp,
          x:        DEFAULT_X,
          y:        DEFAULT_Y,
        })

        // Send monsters already in the zone to the arriving player
        const allMonsters = await redis.hgetall('monsters')
        for (const [id, raw] of Object.entries(allMonsters)) {
          const m = JSON.parse(raw)
          if (m.zone !== zone) continue
          const pos = getMonsterPosition(id) ?? { tileX: m.spawnX, tileY: m.spawnY }
          socket.emit('monster_update', {
            id, name: m.name, level: m.level, hp: m.hp, maxHp: m.maxHp, zone: m.zone, ...pos,
          })
        }

        // Spawn 4 monsters assigned to this player; broadcast goes to the whole zone room
        await spawnMonstersForPlayer(io, zone, playerId)
      }
    })

    socket.on('player_move', ({ x, y }: { x: number; y: number }) => {
      socket.data.posX = x
      socket.data.posY = y
      const zone: string = socket.data.currentZone ?? 'town'
      if (zone !== 'town') {
        // skills=[] → setPlayerPosition preserves cached skills, only updates coords
        setPlayerPosition(zone, playerId, socket.id, x, y)
        socket.to(`zone:${zone}`).emit('player_moved', { id: playerId, x, y })
      }
    })

    socket.on('chat', ({ message, channel }: { message: string; channel: 'global' | 'party' }) => {
      const safe   = String(message).slice(0, MAX_CHAT_LENGTH).replace(/</g, '&lt;')
      const packet = { from: username, message: safe, channel, timestamp: Date.now() }

      if (channel === 'global') {
        io.emit('chat', packet)
      } else if (channel === 'party' && socket.data.partyId) {
        io.to(`party:${socket.data.partyId}`).emit('chat', packet)
      }
    })

    socket.on('disconnect', async () => {
      const zone: string = socket.data.currentZone ?? 'town'

      if (zone !== 'town') {
        removePlayerFromZone(zone, playerId)
        socket.to(`zone:${zone}`).emit('player_left', { id: playerId })
        if (getPlayerCount(zone) === 0) stopZoneLoop(zone)
      }
      clearDeadPlayer(playerId)
      await redis.hdel('online_players', playerId)
      await broadcastOnlinePlayers(io)
      await prisma.player.update({
        where: { id: playerId },
        data: {
          lastSeen: new Date(),
          posX: (socket.data.posX as number | undefined) ?? DEFAULT_X,
          posY: (socket.data.posY as number | undefined) ?? DEFAULT_Y,
          ...(socket.data.mana != null ? { mana: socket.data.mana as number } : {}),
        },
      })

      // Delay monster despawn to preserve state across quick refreshes (< 5 s)
      const timer = setTimeout(() => {
        pendingCleanup.delete(playerId)
        if (zone !== 'town') despawnMonstersForPlayer(io, zone, playerId).catch(console.error)
      }, 5000)
      pendingCleanup.set(playerId, timer)
    })
  })
}
