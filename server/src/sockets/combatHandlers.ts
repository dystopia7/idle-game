import type { Server, Socket } from 'socket.io'
import type { PrismaClient } from '@prisma/client'
import type { SkillType } from '@idle-rpg/shared'
import { redis } from '../lib/redis'
import { resolveCombatRound, calculateExpReward, calculateLevelUp, getEffectiveStats, calcDruidHeal } from '../game/combat'
import { rollAndGrantDrops } from '../game/drops'
import { grantSkillPoints } from '../game/skills'
import { getMonsterPosition, setMonsterHp, resetMonsterToSpawn, isPlayerDead } from '../game/zoneLoop'
import { COMBAT_COOLDOWN_MS } from '@idle-rpg/shared'

export function registerCombatHandlers(io: Server, socket: Socket, prisma: PrismaClient) {
  socket.on('attack_monster', async ({ monsterId }: { monsterId: string }) => {
    const playerId: string = socket.data.playerId

    if (isPlayerDead(playerId)) return

    // Rate-limit per player
    const cdKey = `combat_cd:${playerId}`
    if (await redis.exists(cdKey)) return
    await redis.set(cdKey, '1', 'PX', COMBAT_COOLDOWN_MS)

    const rawMonster = await redis.hget('monsters', monsterId)
    if (!rawMonster) return socket.emit('error', { message: 'Monster not found' })

    const monster = JSON.parse(rawMonster)
    if (monster.hp <= 0) return socket.emit('error', { message: 'Monster is dead — wait for respawn' })

    if (socket.data.currentZone !== monster.zone) return socket.emit('error', { message: 'Monster is not in your zone' })

    const player = await prisma.player.findUnique({
      where:   { id: playerId },
      include: { inventory: { include: { item: true } } },
    })
    if (!player) return socket.disconnect()

    const cachedSkills: Array<{ skill: string; level: number }> = socket.data.skills ?? []
    const playerStats = getEffectiveStats(player, cachedSkills)

    // Range check: bare fists require adjacency; weapons use their own range stat
    const equippedWeapon = player.inventory.find(i => i.equipped && i.item.type === 'WEAPON')
    const weaponRange = equippedWeapon?.item.range ?? 1
    const monPos = getMonsterPosition(monsterId) ?? { tileX: monster.spawnX as number, tileY: monster.spawnY as number }
    const dx = Math.abs((socket.data.posX as number) - monPos.tileX)
    const dy = Math.abs((socket.data.posY as number) - monPos.tileY)
    if (Math.max(dx, dy) > weaponRange) {
      const msg = weaponRange === 1
        ? 'Out of range — move adjacent to attack'
        : `Out of range — max ${weaponRange} tiles`
      return socket.emit('error', { message: msg })
    }

    // Mana cost for MAGIC weapons — check and deduct before damage is dealt
    const manaCost = equippedWeapon?.item.weaponSkill === 'MAGIC' ? (equippedWeapon.item.manaCost ?? 0) : 0
    if (manaCost > 0) {
      const currentMana = (socket.data.mana as number | undefined) ?? 0
      if (currentMana < manaCost) return  // silently block; mana bar shows depletion
      const newMana = currentMana - manaCost
      socket.data.mana = newMana
      await prisma.player.update({ where: { id: playerId }, data: { mana: newMana } })
      socket.emit('player_update', { mana: newMana })
    }

    // Player deals damage — monster no longer counter-attacks here (see zoneLoop independent attacks)
    const { playerDamage } = resolveCombatRound(playerStats, monster)

    monster.hp = Math.max(0, monster.hp - playerDamage)
    await redis.hset('monsters', monsterId, JSON.stringify(monster))
    setMonsterHp(monsterId, monster.hp)

    const killed = monster.hp <= 0

    // Druid passive: heal 5% maxHp on each attack, regardless of kill
    let druidHeal = 0
    if (player.playerClass === 'DRUID') {
      const heal  = calcDruidHeal(playerStats.maxHp)
      const newHp = Math.min(playerStats.maxHp, player.hp + heal)
      druidHeal = newHp - player.hp
      await prisma.player.update({ where: { id: playerId }, data: { hp: newHp } })
      socket.data.hp = newHp
      socket.emit('player_update', { hp: newHp })
    }

    if (killed) {
      const expGained  = calculateExpReward(monster.level, player.level)
      const goldGained = monster.goldMin + Math.floor(Math.random() * (monster.goldMax - monster.goldMin + 1))
      const drops      = await rollAndGrantDrops(playerId, monster.name)

      const { levelsGained, newExp, hpIncrease, atkIncrease, defIncrease, manaIncrease } = calculateLevelUp(
        player.experience + expGained,
        player.level,
        player.playerClass,
      )

      // Only update progression stats — HP is owned by the zone loop (monster attacks)
      const updatedPlayer = await prisma.player.update({
        where: { id: playerId },
        data: {
          experience: newExp,
          level:      { increment: levelsGained },
          gold:       { increment: goldGained },
          maxHp:      { increment: hpIncrease },
          attack:     { increment: atkIncrease },
          defense:    { increment: defIncrease },
          maxMana:    { increment: manaIncrease },
        },
      })

      socket.data.level   = updatedPlayer.level
      socket.data.maxHp   = updatedPlayer.maxHp
      socket.data.maxMana = updatedPlayer.maxMana

      socket.emit('player_update', {
        experience: updatedPlayer.experience,
        level:      updatedPlayer.level,
        gold:       updatedPlayer.gold,
        maxHp:      updatedPlayer.maxHp,
        maxMana:    updatedPlayer.maxMana,
        attack:     updatedPlayer.attack,
        defense:    updatedPlayer.defense,
      })

      setTimeout(async () => {
        // Instance may have been despawned while awaiting respawn (player left zone)
        const stillExists = await redis.hexists('monsters', monsterId)
        if (!stillExists) return
        monster.hp = monster.maxHp
        await redis.hset('monsters', monsterId, JSON.stringify(monster))
        resetMonsterToSpawn(monsterId, monster.maxHp)
        const spawnPos = { tileX: monster.spawnX as number, tileY: monster.spawnY as number }
        io.to(`zone:${monster.zone}`).emit('monster_update', { ...monster, id: monsterId, ...spawnPos })
      }, monster.respawnSecs * 1000)

      socket.emit('combat_result', {
        monsterId,
        monsterName:  monster.name,
        damage:       playerDamage,
        playerDamage: 0,
        killed:       true,
        expGained,
        goldGained,
        healGained:   druidHeal > 0 ? druidHeal : undefined,
        drops: drops.map(d => ({
          ...d,
          description: '', type: 'MATERIAL' as const, rarity: 'COMMON' as const,
          value: 0, hpBonus: 0, manaBonus: 0, attackBonus: 0, defenseBonus: 0, speedBonus: 0,
          clubSkillBonus: 0, axeSkillBonus: 0, swordSkillBonus: 0,
          distanceSkillBonus: 0, shieldingSkillBonus: 0, magicSkillBonus: 0,
        })),
      })
    } else {
      socket.emit('combat_result', {
        monsterId,
        monsterName:  monster.name,
        damage:       playerDamage,
        playerDamage: 0,
        killed:       false,
        healGained:   druidHeal > 0 ? druidHeal : undefined,
      })
    }

    const currentPos = getMonsterPosition(monsterId) ?? { tileX: monster.spawnX as number, tileY: monster.spawnY as number }
    io.to(`zone:${monster.zone}`).emit('monster_update', { ...monster, id: monsterId, ...currentPos })

    // ── Weapon skill: 1 point per hit dealt ──────────────────────────────────
    if (playerDamage > 0) {
      const weaponSkill = equippedWeapon?.item.weaponSkill as SkillType | null | undefined
      if (weaponSkill) {
        const result = await grantSkillPoints(prisma, playerId, weaponSkill, 1)
        updateCachedSkill(socket, weaponSkill, result.newLevel, result.newPoints)
        socket.emit('skill_update', { skill: weaponSkill, level: result.newLevel, points: result.newPoints })
      }
    }
    // Shielding skill is now granted in zoneLoop.processMonsterAttack (per independent monster hit)
  })
}

function updateCachedSkill(socket: Socket, skill: SkillType, level: number, points: number) {
  const skills: Array<{ skill: string; level: number; points: number }> = socket.data.skills ?? []
  const idx = skills.findIndex(s => s.skill === skill)
  if (idx >= 0) skills[idx] = { skill, level, points }
  else          skills.push({ skill, level, points })
  socket.data.skills = skills
}
