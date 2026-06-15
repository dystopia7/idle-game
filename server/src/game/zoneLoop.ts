import type { Server } from 'socket.io'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { getEffectiveStats } from './combat'
import { grantSkillPoints } from './skills'
import { GRID_COLS, GRID_ROWS, MONSTER_TICK_MS, MONSTER_ATTACK_MS } from '@idle-rpg/shared'

interface MonsterPos {
  tileX:   number
  tileY:   number
  spawnX:  number
  spawnY:  number
  hp:      number
  maxHp:   number
  attack:  number
  defense: number
  name:    string
  zone:    string
}

interface ZonePlayer {
  x:        number
  y:        number
  socketId: string
  playerId: string
  skills:   Array<{ skill: string; level: number }>
}

// monsterId → current position + stats (ephemeral, in-memory)
const monsterPositions = new Map<string, MonsterPos>()

// monsterId → playerId this monster is assigned to chase/attack
const monsterOwners = new Map<string, string>()

// playerIds currently in the 15-second death window
const deadPlayers = new Set<string>()

// monsterId → timestamp of last independent attack
const monsterAttackCooldowns = new Map<string, number>()

// zone → playerId → position + context
const zonePlayerPositions = new Map<string, Map<string, ZonePlayer>>()

// zone → setInterval handle
const zoneIntervals = new Map<string, ReturnType<typeof setInterval>>()

// zones already loaded from Redis this server lifetime
const initializedZones = new Set<string>()

// ── Public API ────────────────────────────────────────────────────────────────

/** Load monster spawn positions and stats from Redis the first time a zone is entered. */
export async function ensureZoneInitialized(zone: string): Promise<void> {
  if (initializedZones.has(zone)) return
  initializedZones.add(zone)

  const allMonsters = await redis.hgetall('monsters')
  for (const [id, raw] of Object.entries(allMonsters)) {
    const m = JSON.parse(raw)
    if (m.zone !== zone) continue
    monsterPositions.set(id, {
      tileX:   m.spawnX,
      tileY:   m.spawnY,
      spawnX:  m.spawnX,
      spawnY:  m.spawnY,
      hp:      m.hp,
      maxHp:   m.maxHp,
      attack:  m.attack,
      defense: m.defense,
      name:    m.name,
      zone:    m.zone,
    })
  }
}

/**
 * Register or update a player's position in a zone.
 * Existing cached skills are preserved on position-only updates (pass skills=[] then).
 */
export function setPlayerPosition(
  zone: string,
  playerId: string,
  socketId: string,
  x: number,
  y: number,
  skills: Array<{ skill: string; level: number }> = [],
) {
  if (!zonePlayerPositions.has(zone)) zonePlayerPositions.set(zone, new Map())
  const existing = zonePlayerPositions.get(zone)!.get(playerId)
  zonePlayerPositions.get(zone)!.set(playerId, {
    x, y, socketId, playerId,
    // Preserve cached skills if they already exist; use provided value on first entry
    skills: existing ? existing.skills : skills,
  })
}

/** Call whenever a player's skills change so monster attacks use fresh effective stats. */
export function updatePlayerSkills(
  zone: string,
  playerId: string,
  skills: Array<{ skill: string; level: number }>,
) {
  const record = zonePlayerPositions.get(zone)?.get(playerId)
  if (record) record.skills = skills
}

export function removePlayerFromZone(zone: string, playerId: string) {
  zonePlayerPositions.get(zone)?.delete(playerId)
}

export function isPlayerDead(playerId: string): boolean {
  return deadPlayers.has(playerId)
}

export function clearDeadPlayer(playerId: string): void {
  deadPlayers.delete(playerId)
}

export function getPlayerCount(zone: string): number {
  return zonePlayerPositions.get(zone)?.size ?? 0
}

export function getMonsterPosition(monsterId: string): { tileX: number; tileY: number } | null {
  const m = monsterPositions.get(monsterId)
  return m ? { tileX: m.tileX, tileY: m.tileY } : null
}

export function setMonsterHp(monsterId: string, hp: number) {
  const m = monsterPositions.get(monsterId)
  if (m) m.hp = hp
}

export function resetMonsterToSpawn(monsterId: string, newHp: number) {
  const m = monsterPositions.get(monsterId)
  if (!m) return
  m.hp    = newHp
  m.tileX = m.spawnX
  m.tileY = m.spawnY
}

/** Add a dynamically spawned monster instance to live tracking. */
export function addMonsterInstance(
  id: string,
  data: { name: string; zone: string; hp: number; maxHp: number; attack: number; defense: number; spawnX: number; spawnY: number },
) {
  monsterPositions.set(id, {
    tileX: data.spawnX, tileY: data.spawnY,
    spawnX: data.spawnX, spawnY: data.spawnY,
    hp: data.hp, maxHp: data.maxHp,
    attack: data.attack, defense: data.defense,
    name: data.name, zone: data.zone,
  })
}

/** Assign a monster to a specific player so the tick targets only them. */
export function setMonsterOwner(monsterId: string, playerId: string) {
  monsterOwners.set(monsterId, playerId)
}

/** Remove a monster instance from live tracking (scaling down or zone empty). */
export function removeMonsterInstance(id: string) {
  monsterPositions.delete(id)
  monsterAttackCooldowns.delete(id)
  monsterOwners.delete(id)
}

/** Return all [id, position] pairs for monsters currently in a zone. */
export function getZoneMonsterEntries(zone: string): [string, MonsterPos][] {
  return Array.from(monsterPositions.entries()).filter(([, m]) => m.zone === zone)
}

export function startZoneLoop(io: Server, zone: string) {
  if (zoneIntervals.has(zone)) return
  const handle = setInterval(() => tickZone(io, zone), MONSTER_TICK_MS)
  zoneIntervals.set(zone, handle)
}

export function stopZoneLoop(zone: string) {
  const handle = zoneIntervals.get(zone)
  if (handle) {
    clearInterval(handle)
    zoneIntervals.delete(zone)
  }
}

// ── Zone tick ─────────────────────────────────────────────────────────────────

function chebyshev(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function tickZone(io: Server, zone: string) {
  const players = zonePlayerPositions.get(zone)
  if (!players || players.size === 0) return

  const zoneMonsters = Array.from(monsterPositions.entries())
    .filter(([, m]) => m.zone === zone)

  // Occupancy set: all player tiles + all living monster tiles
  const occupied = new Set<string>()
  for (const [, p] of players) occupied.add(`${p.x},${p.y}`)
  for (const [, m] of zoneMonsters) {
    if (m.hp > 0) occupied.add(`${m.tileX},${m.tileY}`)
  }

  const now = Date.now()

  for (const [id, monster] of zoneMonsters) {
    if (monster.hp <= 0) continue

    // Resolve the assigned player; idle if they're dead (they will respawn)
    const ownerId = monsterOwners.get(id)
    const owner   = ownerId ? players.get(ownerId) : undefined
    const ownerAlive = owner != null && !deadPlayers.has(ownerId!)

    // ── Movement: chase assigned player, idle if dead/unset ─────────────────
    if (ownerAlive) {
      const dist = chebyshev(monster.tileX, monster.tileY, owner!.x, owner!.y)
      if (dist > 1) {
        const dx = Math.sign(owner!.x - monster.tileX)
        const dy = Math.sign(owner!.y - monster.tileY)

        const candidates: [number, number][] = dx !== 0 && dy !== 0
          ? [[dx, dy], [dx, 0], [0, dy]]
          : dx !== 0
            ? [[dx, 0], [0, 1], [0, -1]]
            : [[0, dy], [1, 0], [-1, 0]]

        for (const [ax, ay] of candidates) {
          const nx = monster.tileX + ax
          const ny = monster.tileY + ay
          if (nx < 0 || nx >= GRID_COLS || ny < 0 || ny >= GRID_ROWS) continue
          if (occupied.has(`${nx},${ny}`)) continue

          occupied.delete(`${monster.tileX},${monster.tileY}`)
          occupied.add(`${nx},${ny}`)
          monster.tileX = nx
          monster.tileY = ny
          io.to(`zone:${zone}`).emit('monster_moved', { id, tileX: nx, tileY: ny })
          break
        }
      }
    }

    // ── Independent attack: only hit assigned player when adjacent ───────────
    const lastAttack = monsterAttackCooldowns.get(id) ?? 0
    if (now - lastAttack < MONSTER_ATTACK_MS) continue

    let attackTarget: ZonePlayer | null = null
    if (ownerAlive) {
      const d = chebyshev(monster.tileX, monster.tileY, owner!.x, owner!.y)
      if (d <= 1) attackTarget = owner!
    }

    if (!attackTarget) continue

    monsterAttackCooldowns.set(id, now)
    // Fire-and-forget async — don't block the sync tick
    processMonsterAttack(io, id, monster, attackTarget).catch(console.error)
  }

  // ── Passive mana regen: +1 per tick for every living player in the zone ──────
  for (const [, player] of players) {
    if (deadPlayers.has(player.playerId)) continue
    const sock = io.sockets.sockets.get(player.socketId)
    if (!sock) continue
    const mana    = (sock.data.mana    as number | undefined) ?? 0
    const maxMana = (sock.data.maxMana as number | undefined) ?? 55
    if (mana >= maxMana) continue
    const newMana = Math.min(maxMana, mana + 1)
    sock.data.mana = newMana
    io.to(player.socketId).emit('player_update', { mana: newMana })
  }
}

async function processMonsterAttack(
  io: Server,
  monsterId: string,
  monster: MonsterPos,
  target: ZonePlayer,
) {
  if (deadPlayers.has(target.playerId)) return
  // Abort if the player already left this zone (e.g. traveled to town)
  if (!zonePlayerPositions.get(monster.zone)?.has(target.playerId)) return

  const player = await prisma.player.findUnique({
    where:   { id: target.playerId },
    include: { inventory: { include: { item: true } } },
  })
  if (!player) return
  // Check again after the async DB fetch — player may have left during it
  if (!zonePlayerPositions.get(monster.zone)?.has(target.playerId)) return

  const playerStats = getEffectiveStats(player, target.skills)
  const damage      = Math.max(0, monster.attack - Math.floor(playerStats.defense * 0.5) + randInt(0, 2))
  const newHp       = Math.max(0, player.hp - damage)

  const sock = io.sockets.sockets.get(target.socketId)

  if (newHp === 0) {
    // Save 1 to DB so a reconnect-during-death doesn't load HP 0
    await prisma.player.update({ where: { id: target.playerId }, data: { hp: 1 } })
    if (sock) sock.data.hp = 0
    deadPlayers.add(target.playerId)
    io.to(target.socketId).emit('player_update', { hp: 0 })
    io.to(`zone:${monster.zone}`).emit('player_died', { id: target.playerId })

    setTimeout(async () => {
      deadPlayers.delete(target.playerId)
      const sockOnRespawn = io.sockets.sockets.get(target.socketId)
      const maxMana = (sockOnRespawn?.data.maxMana as number | undefined) ?? player.maxMana
      await prisma.player.update({ where: { id: target.playerId }, data: { hp: player.maxHp, mana: maxMana } })
      if (sockOnRespawn) {
        sockOnRespawn.data.hp   = player.maxHp
        sockOnRespawn.data.mana = maxMana
        io.to(target.socketId).emit('player_update', { mana: maxMana })
      }
      // Emit directly to the player so they get it even if they've already changed zones
      io.to(target.socketId).emit('player_respawn', { id: target.playerId, hp: player.maxHp })
      // Notify others still in the zone (exclude the player to avoid double delivery)
      io.to(`zone:${monster.zone}`).except(target.socketId).emit('player_respawn', { id: target.playerId, hp: player.maxHp })
    }, 15_000)
    return
  }

  await prisma.player.update({ where: { id: target.playerId }, data: { hp: newHp } })
  if (sock) sock.data.hp = newHp

  io.to(target.socketId).emit('player_update', { hp: newHp })
  io.to(target.socketId).emit('monster_attack', { monsterId, monsterName: monster.name, damage })

  // Shielding skill — 1 point per hit taken from an independent monster attack
  if (damage > 0) {
    const result = await grantSkillPoints(prisma, target.playerId, 'SHIELDING', 1)

    const updatedSkills = target.skills.map(s =>
      s.skill === 'SHIELDING'
        ? { skill: s.skill, level: result.newLevel, points: result.newPoints }
        : s,
    )
    if (!updatedSkills.some(s => s.skill === 'SHIELDING')) {
      updatedSkills.push({ skill: 'SHIELDING', level: result.newLevel, points: result.newPoints })
    }
    updatePlayerSkills(monster.zone, target.playerId, updatedSkills)

    io.to(target.socketId).emit('skill_update', {
      skill: 'SHIELDING', level: result.newLevel, points: result.newPoints,
    })
  }
}
