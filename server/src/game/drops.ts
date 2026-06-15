import { prisma } from '../lib/prisma'

interface DropEntry {
  itemName: string
  chance: number
  qtyMin: number
  qtyMax: number
}

// Items are distributed by zone (monster) to create a natural gear progression.
// Each zone's non-material drops include 1 generic item + 1 item per class (KNIGHT/PALADIN/SORCERER)
// so every class has equal loot opportunities in every zone.
//
// Zone layout:
//   hunt1 (Goblin)  — WEAPON + ARMOR   — req lvl 1   — COMMON
//   hunt2 (Orc)     — HELMET + ACCESSORY — req lvl 5  — COMMON/UNCOMMON
//   hunt3 (Troll)   — WEAPON + ARMOR   — req lvl 10  — UNCOMMON
//   hunt4 (Wyvern)  — HELMET + ACCESSORY — req lvl 15 — RARE
//   hunt5 (Dragon)  — all slots        — req lvl 20  — EPIC

const DROP_TABLES: Record<string, DropEntry[]> = {
  // ── hunt1 ─────────────────────────────────────────────────────────────────────
  Slime: [
    { itemName: 'Slime Gel',  chance: 0.60, qtyMin: 1, qtyMax: 3 },
  ],
  Goblin: [
    { itemName: 'Goblin Ear',         chance: 0.50, qtyMin: 1, qtyMax: 2 },
    // generic
    { itemName: 'Iron Sword',         chance: 0.08, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Leather Armor',      chance: 0.08, qtyMin: 1, qtyMax: 1 },
    // knight
    { itemName: 'Bone Crusher',       chance: 0.08, qtyMin: 1, qtyMax: 1 },
    { itemName: "Knight's Surcoat",   chance: 0.08, qtyMin: 1, qtyMax: 1 },
    // paladin
    { itemName: 'Hunting Bow',        chance: 0.08, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Blessed Chainmail',  chance: 0.08, qtyMin: 1, qtyMax: 1 },
    // sorcerer
    { itemName: 'Apprentice Wand',    chance: 0.08, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Apprentice Robe',    chance: 0.08, qtyMin: 1, qtyMax: 1 },
    // druid
    { itemName: 'Gnarled Branch',     chance: 0.08, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Bark Tunic',         chance: 0.08, qtyMin: 1, qtyMax: 1 },
  ],

  // ── hunt2 ─────────────────────────────────────────────────────────────────────
  Orc: [
    { itemName: 'Health Potion',      chance: 0.30, qtyMin: 1, qtyMax: 2 },
    // generic
    { itemName: 'Iron Helmet',        chance: 0.08, qtyMin: 1, qtyMax: 1 },
    // knight
    { itemName: 'Steel Greathelm',    chance: 0.07, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Iron Gauntlets',     chance: 0.07, qtyMin: 1, qtyMax: 1 },
    // paladin
    { itemName: "Crusader's Helm",    chance: 0.07, qtyMin: 1, qtyMax: 1 },
    { itemName: "Paladin's Sigil",    chance: 0.07, qtyMin: 1, qtyMax: 1 },
    // sorcerer
    { itemName: 'Pointed Hat',        chance: 0.07, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Mana Crystal',       chance: 0.07, qtyMin: 1, qtyMax: 1 },
    // druid
    { itemName: 'Leaf Crown',         chance: 0.07, qtyMin: 1, qtyMax: 1 },
    { itemName: "Nature's Totem",     chance: 0.07, qtyMin: 1, qtyMax: 1 },
  ],

  // ── hunt3 ─────────────────────────────────────────────────────────────────────
  Troll: [
    // generic
    { itemName: 'Steel Blade',        chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Chain Mail',         chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // knight
    { itemName: 'Battle Axe',         chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Full Plate Armor',   chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // paladin
    { itemName: 'Crossbow',           chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Holy Breastplate',   chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // sorcerer
    { itemName: 'Crystal Staff',      chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Enchanted Vestments',chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // druid
    { itemName: 'Verdant Staff',      chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Thornweave Coat',    chance: 0.06, qtyMin: 1, qtyMax: 1 },
  ],

  // ── hunt4 ─────────────────────────────────────────────────────────────────────
  Wyvern: [
    // generic
    { itemName: 'Lucky Charm',        chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // knight
    { itemName: "Knight's Visor",     chance: 0.05, qtyMin: 1, qtyMax: 1 },
    { itemName: "Knight's Shield",    chance: 0.05, qtyMin: 1, qtyMax: 1 },
    // paladin
    { itemName: 'Blessed Visor',      chance: 0.05, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Divine Talisman',    chance: 0.05, qtyMin: 1, qtyMax: 1 },
    // sorcerer
    { itemName: 'Runewoven Hood',     chance: 0.05, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Spellweave Ring',    chance: 0.05, qtyMin: 1, qtyMax: 1 },
    // druid
    { itemName: 'Wildwood Hood',      chance: 0.05, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Verdant Talisman',   chance: 0.05, qtyMin: 1, qtyMax: 1 },
  ],

  // ── hunt5 (boss) ──────────────────────────────────────────────────────────────
  Dragon: [
    { itemName: 'Dragon Scale',       chance: 0.80, qtyMin: 1, qtyMax: 3 },
    // generic
    { itemName: 'Flame Sabre',        chance: 0.10, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Plate Armor',        chance: 0.08, qtyMin: 1, qtyMax: 1 },
    // knight
    { itemName: 'Thunder Maul',       chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Adamantine Plate',   chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: "Warlord's Crown",    chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: "Berserker's Belt",   chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // paladin
    { itemName: 'Holy Longbow',       chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Radiant Aegis',      chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Halo Crown',         chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: "Angel's Grace",      chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // sorcerer
    { itemName: 'Shadow Scepter',     chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: "Archmage's Robe",    chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Arcane Circlet',     chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Eye of the Abyss',   chance: 0.06, qtyMin: 1, qtyMax: 1 },
    // druid
    { itemName: 'Ancient Grove Staff',chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Ancient Bark Armor', chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: "Elder Druid's Cowl", chance: 0.06, qtyMin: 1, qtyMax: 1 },
    { itemName: 'Heart of the Forest',chance: 0.06, qtyMin: 1, qtyMax: 1 },
  ],
}

export async function rollAndGrantDrops(
  playerId: string,
  monsterName: string,
): Promise<Array<{ id: string; name: string }>> {
  const table = DROP_TABLES[monsterName] ?? []
  const rolled: DropEntry[] = table.filter((e) => Math.random() < e.chance)
  if (rolled.length === 0) return []

  const itemNames = rolled.map((e) => e.itemName)
  const items = await prisma.item.findMany({ where: { name: { in: itemNames } } })
  const itemMap = new Map(items.map((i) => [i.name, i]))

  for (const entry of rolled) {
    const item = itemMap.get(entry.itemName)
    if (!item) continue
    const qty = entry.qtyMin + Math.floor(Math.random() * (entry.qtyMax - entry.qtyMin + 1))

    await prisma.inventoryItem.upsert({
      where:  { playerId_itemId: { playerId, itemId: item.id } },
      update: { quantity: { increment: qty } },
      create: { playerId, itemId: item.id, quantity: qty },
    })
  }

  return items.map((i) => ({ id: i.id, name: i.name }))
}
