import { CLASS_LEVEL_UP, DRUID_HEAL_MULT } from '@idle-rpg/shared'
import type { PlayerClass } from '@idle-rpg/shared'

export interface CombatStats {
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  attack: number
  defense: number
  speed: number
  level: number
}

export interface RoundResult {
  playerDamage: number
  monsterDamage: number
}

export interface LevelUpResult {
  levelsGained: number
  newExp: number
  hpIncrease: number
  atkIncrease: number
  defIncrease: number
  manaIncrease: number
}

export function resolveCombatRound(attacker: CombatStats, defender: CombatStats): RoundResult {
  const playerDamage = Math.max(1, attacker.attack - Math.floor(defender.defense * 0.5) + randInt(0, 4))
  const monsterDamage = Math.max(0, defender.attack - Math.floor(attacker.defense * 0.5) + randInt(0, 2))
  return { playerDamage, monsterDamage }
}

// XP needed to advance from level-1 to level: 50(x² - 5x + 8)
export function expForLevel(level: number): number {
  return 50 * (level * level - 5 * level + 8)
}

export function calculateExpReward(monsterLevel: number, playerLevel: number): number {
  const base = monsterLevel * 10
  const diff = monsterLevel - playerLevel
  const mult = diff > 0 ? 1.5 : Math.max(0.1, 1 - Math.abs(diff) * 0.1)
  return Math.floor(base * mult)
}

export function calculateLevelUp(currentExp: number, currentLevel: number, playerClass: PlayerClass): LevelUpResult {
  const gains = CLASS_LEVEL_UP[playerClass]
  let exp = currentExp
  let levelsGained = 0

  while (exp >= expForLevel(currentLevel + levelsGained + 1)) {
    exp -= expForLevel(currentLevel + levelsGained + 1)
    levelsGained++
  }

  return {
    levelsGained,
    newExp:       exp,
    hpIncrease:   levelsGained * gains.hp,
    atkIncrease:  levelsGained * gains.atk,
    defIncrease:  levelsGained * gains.def,
    manaIncrease: levelsGained * gains.mana,
  }
}

/** HP a Druid passively restores after each combat round. */
export function calcDruidHeal(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp * DRUID_HEAL_MULT))
}

const ATTACK_SKILLS = new Set(['CLUB', 'AXE', 'SWORD', 'DISTANCE', 'MAGIC'])
const SKILL_ATK_START = 10  // same as SKILL_COMBAT_START — avoids a circular import

const SKILL_ITEM_BONUS_KEY: Record<string, keyof ItemSkillBonuses> = {
  CLUB:      'clubSkillBonus',
  AXE:       'axeSkillBonus',
  SWORD:     'swordSkillBonus',
  DISTANCE:  'distanceSkillBonus',
  SHIELDING: 'shieldingSkillBonus',
  MAGIC:     'magicSkillBonus',
}

interface ItemSkillBonuses {
  clubSkillBonus: number
  axeSkillBonus: number
  swordSkillBonus: number
  distanceSkillBonus: number
  shieldingSkillBonus: number
  magicSkillBonus: number
}

export function getEffectiveStats(
  player: {
    hp: number; maxHp: number; mana: number; maxMana: number; attack: number; defense: number; speed: number; level: number
    inventory?: Array<{ equipped: boolean; item: { hpBonus: number; manaBonus: number; attackBonus: number; defenseBonus: number; speedBonus: number } & ItemSkillBonuses }>
  },
  skills?: Array<{ skill: string; level: number }>,
): CombatStats {
  let bonusHp = 0, bonusMana = 0, bonusAtk = 0, bonusDef = 0, bonusSpd = 0
  const itemSkillBonus: Record<string, number> = {}

  for (const inv of player.inventory ?? []) {
    if (inv.equipped) {
      bonusHp   += inv.item.hpBonus
      bonusMana += inv.item.manaBonus
      bonusAtk  += inv.item.attackBonus
      bonusDef  += inv.item.defenseBonus
      bonusSpd  += inv.item.speedBonus
      for (const [skill, key] of Object.entries(SKILL_ITEM_BONUS_KEY)) {
        itemSkillBonus[skill] = (itemSkillBonus[skill] ?? 0) + inv.item[key]
      }
    }
  }

  for (const s of skills ?? []) {
    const effectiveLevel = s.level + (itemSkillBonus[s.skill] ?? 0)
    const above = Math.max(0, effectiveLevel - SKILL_ATK_START)
    if (ATTACK_SKILLS.has(s.skill)) bonusAtk += above
    if (s.skill === 'SHIELDING')    bonusDef += Math.floor(above * 0.5)
  }

  return {
    hp:      player.hp,
    maxHp:   player.maxHp + bonusHp,
    mana:    player.mana,
    maxMana: player.maxMana + bonusMana,
    attack:  player.attack + bonusAtk,
    defense: player.defense + bonusDef,
    speed:   player.speed + bonusSpd,
    level:   player.level,
  }
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}
