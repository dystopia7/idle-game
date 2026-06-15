import type { Server } from 'socket.io'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { GRID_COLS, GRID_ROWS, MONSTERS_PER_PLAYER } from '@idle-rpg/shared'
import { addMonsterInstance, removeMonsterInstance, getZoneMonsterEntries, setMonsterOwner } from './zoneLoop'

interface MonsterTemplate {
  id: string; name: string; zone: string; level: number
  hp: number; maxHp: number; attack: number; defense: number
  expReward: number; goldMin: number; goldMax: number
  isBoss: boolean; respawnSecs: number
}

interface PlayerEntry {
  zone: string
  ids: string[]
}

// zone → templates (loaded once from Postgres at startup)
const zoneTemplates = new Map<string, MonsterTemplate[]>()
// playerId → { zone, ids } — zone stored so stale entries can be broadcast-despawned correctly
const playerInstances = new Map<string, PlayerEntry>()
let instanceCounter = 0

function randomSpawnTile(occupied: Set<string>): { x: number; y: number } {
  let x = 0, y = 0, attempts = 0
  do {
    x = 2 + Math.floor(Math.random() * (GRID_COLS - 4))
    y = 2 + Math.floor(Math.random() * (GRID_ROWS - 4))
    attempts++
  } while (occupied.has(`${x},${y}`) && attempts < 500)
  return { x, y }
}

/** True if the zone has at least one monster template loaded, or is the safe zone. */
export function isKnownZone(zone: string): boolean {
  return zone === 'town' || zoneTemplates.has(zone)
}

/** Load Postgres monsters as in-memory templates and wipe any stale Redis state. */
export async function loadMonsterTemplates(): Promise<void> {
  await redis.del('monsters')
  const monsters = await prisma.monster.findMany()
  for (const m of monsters) {
    if (!zoneTemplates.has(m.zone)) zoneTemplates.set(m.zone, [])
    zoneTemplates.get(m.zone)!.push(m as unknown as MonsterTemplate)
  }
  console.log(`[Game] Loaded monster templates: ${monsters.map(m => m.name).join(', ')}`)
}

/**
 * Spawn MONSTERS_PER_PLAYER instances in the zone assigned to this player.
 * Always cleans up any pre-existing instances first so double-invocation
 * (reconnect race, rapid travel clicks) never accumulates extra monsters.
 */
export async function spawnMonstersForPlayer(io: Server, zone: string, playerId: string): Promise<void> {
  const templates = zoneTemplates.get(zone) ?? []
  if (templates.length === 0) return

  // Defensive cleanup — guard against concurrent travel events or reconnect races
  const existing = playerInstances.get(playerId)
  if (existing && existing.ids.length > 0) {
    for (const id of existing.ids) {
      removeMonsterInstance(id)
      await redis.hdel('monsters', id)
      io.to(`zone:${existing.zone}`).emit('monster_update', {
        id, hp: 0, maxHp: 1, name: '', level: 1, zone: existing.zone, tileX: 0, tileY: 0,
      })
    }
  }

  // Fresh entry — replace any stale reference with a new array
  const entry: PlayerEntry = { zone, ids: [] }
  playerInstances.set(playerId, entry)

  // Avoid overlapping with any currently occupied tile
  const occupied = new Set<string>()
  for (const [, m] of getZoneMonsterEntries(zone)) {
    if (m.hp > 0) occupied.add(`${m.tileX},${m.tileY}`)
  }

  for (let i = 0; i < MONSTERS_PER_PLAYER; i++) {
    const template = templates[i % templates.length]
    const instanceId = `${zone}_inst_${++instanceCounter}`
    const { x, y } = randomSpawnTile(occupied)
    occupied.add(`${x},${y}`)

    const instance = {
      id: instanceId, name: template.name, zone,
      level: template.level, hp: template.maxHp, maxHp: template.maxHp,
      attack: template.attack, defense: template.defense,
      expReward: template.expReward, goldMin: template.goldMin, goldMax: template.goldMax,
      isBoss: template.isBoss, respawnSecs: template.respawnSecs,
      spawnX: x, spawnY: y,
    }

    await redis.hset('monsters', instanceId, JSON.stringify(instance))
    addMonsterInstance(instanceId, instance)
    setMonsterOwner(instanceId, playerId)
    entry.ids.push(instanceId)

    io.to(`zone:${zone}`).emit('monster_update', {
      id: instanceId, name: instance.name, level: instance.level,
      hp: instance.maxHp, maxHp: instance.maxHp, zone, tileX: x, tileY: y,
    })
  }
}

/**
 * Remove all monster instances owned by this player.
 * Uses the stored zone for the broadcast so it always reaches the right room.
 */
export async function despawnMonstersForPlayer(io: Server, _zone: string, playerId: string): Promise<void> {
  const entry = playerInstances.get(playerId)
  if (!entry || entry.ids.length === 0) return

  // Use the stored zone (player may have changed zones since spawning)
  const { zone: spawnedZone, ids } = entry
  playerInstances.delete(playerId)

  for (const id of ids) {
    removeMonsterInstance(id)
    await redis.hdel('monsters', id)
    io.to(`zone:${spawnedZone}`).emit('monster_update', {
      id, hp: 0, maxHp: 1, name: '', level: 1, zone: spawnedZone, tileX: 0, tileY: 0,
    })
  }
}
