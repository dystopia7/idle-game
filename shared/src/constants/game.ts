export const GRID_COLS = 20
export const GRID_ROWS = 13
export const MONSTER_TICK_MS    = 900   // movement tick
export const MONSTER_ATTACK_MS  = 2000  // independent monster attack cooldown

export const MONSTERS_PER_PLAYER = 5
export const MAX_PARTY_SIZE = 4
export const OFFLINE_GOLD_PER_SEC_PER_LEVEL = 0.1
export const COMBAT_COOLDOWN_MS = 1000
export const MARKET_MAX_DURATION_HOURS = 168
export const MARKET_ITEMS_PER_PAGE = 20
export const MAX_MAIL_INBOX = 50
export const MAX_CHAT_LENGTH = 200
export const LEVEL_UP_HP_BONUS = 10
export const LEVEL_UP_ATK_BONUS = 2
export const LEVEL_UP_DEF_BONUS = 1

// Skill progression formula: P = SKILL_A * SKILL_B^(level - c)
// where c = SKILL_COMBAT_START for melee/distance/shielding, SKILL_MAGIC_START for magic
export const SKILL_A            = 50   // base hits/mana constant
export const SKILL_B            = 1.1  // growth constant
export const SKILL_COMBAT_START = 10   // starting level for Club/Axe/Sword/Distance/Shielding
export const SKILL_MAGIC_START  = 0    // starting level for Magic

// ── Character classes ────────────────────────────────────────────────────────

export const PLAYER_CLASSES = ['KNIGHT', 'SORCERER', 'PALADIN', 'DRUID'] as const
export type PlayerClass = typeof PLAYER_CLASSES[number]

/** Starting stats at level 1 for each class. */
export const CLASS_BASE_STATS: Record<PlayerClass, { hp: number; attack: number; defense: number; speed: number; mana: number }> = {
  KNIGHT:   { hp: 150, attack: 12, defense: 8, speed: 10, mana: 55 },
  PALADIN:  { hp: 100, attack: 10, defense: 6, speed: 12, mana: 55 },
  SORCERER: { hp: 50,  attack: 15, defense: 3, speed: 10, mana: 55 },
  DRUID:    { hp: 50,  attack: 6,  defense: 5, speed: 10, mana: 55 },
}

/** HP / ATK / DEF / MANA gained per level for each class. */
export const CLASS_LEVEL_UP: Record<PlayerClass, { hp: number; atk: number; def: number; mana: number }> = {
  KNIGHT:   { hp: 15, atk: 3, def: 2, mana: 5  },
  PALADIN:  { hp: 10, atk: 4, def: 1, mana: 15 },
  SORCERER: { hp: 5,  atk: 6, def: 1, mana: 30 },
  DRUID:    { hp: 5,  atk: 2, def: 1, mana: 30 },
}

/** Fraction of maxHp a Druid passively heals after each combat round. */
export const DRUID_HEAL_MULT = 0.05
