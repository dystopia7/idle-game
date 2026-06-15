import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

interface MonsterSeed {
  name: string; zone: string; level: number
  hp: number; maxHp: number; attack: number; defense: number
  expReward: number; goldMin: number; goldMax: number
  isBoss: boolean; respawnSecs: number
}

const MONSTERS: MonsterSeed[] = JSON.parse(
  readFileSync(join(__dirname, 'seed-monsters.json'), 'utf8')
)

// requiredLevel maps to hunt zones: 1=hunt1, 5=hunt2, 10=hunt3, 15=hunt4, 20=hunt5
// requiredClass=null means any class can equip it
// Slot layout per zone:
//   hunt1 (lvl 1):  WEAPON + ARMOR   — generics + 1 per class
//   hunt2 (lvl 5):  HELMET + ACCESSORY
//   hunt3 (lvl 10): WEAPON + ARMOR
//   hunt4 (lvl 15): HELMET + ACCESSORY
//   hunt5 (lvl 20): all slots — boss zone
const ITEMS = [
  // ═══════════════════════════════════════════════════════════════════════════════
  // HUNT 1  (req lvl 1)  ·  WEAPON + ARMOR drops
  // ═══════════════════════════════════════════════════════════════════════════════

  // Generic swords — usable by any class
  { name: 'Iron Sword',   description: 'A basic iron sword.',   type: 'WEAPON', rarity: 'COMMON',   value: 50,  attackBonus: 5,  weaponSkill: 'SWORD', swordSkillBonus: 1, requiredLevel: 1, range: 1 },

  // Knight — melee weapons (CLUB / AXE)
  { name: 'Bone Crusher', description: 'A starter club issued to new knights.', type: 'WEAPON', rarity: 'COMMON', value: 50, attackBonus: 7, weaponSkill: 'CLUB', clubSkillBonus: 1, requiredLevel: 1, requiredClass: 'KNIGHT', range: 1 },

  // Paladin — distance weapons
  { name: 'Hunting Bow',  description: 'A reliable short bow.', type: 'WEAPON', rarity: 'COMMON', value: 60, attackBonus: 6, speedBonus: 2, weaponSkill: 'DISTANCE', distanceSkillBonus: 1, requiredLevel: 1, requiredClass: 'PALADIN', range: 6 },

  // Sorcerer — magic weapons (wands range 4, staves range 5)
  { name: 'Apprentice Wand', description: 'Channels small bursts of magic.', type: 'WEAPON', rarity: 'COMMON', value: 55, attackBonus: 7, speedBonus: 1, weaponSkill: 'MAGIC', magicSkillBonus: 1, manaCost: 2, requiredLevel: 1, requiredClass: 'SORCERER', range: 4 },

  // Druid — nature magic weapons
  { name: 'Gnarled Branch', description: 'A twisted branch humming with life energy.', type: 'WEAPON', rarity: 'COMMON', value: 50, attackBonus: 6, hpBonus: 8, weaponSkill: 'MAGIC', magicSkillBonus: 1, manaCost: 2, requiredLevel: 1, requiredClass: 'DRUID', range: 5 },

  // Generic light armor
  { name: 'Leather Armor', description: 'Simple leather protection.', type: 'ARMOR', rarity: 'COMMON', value: 40, defenseBonus: 3, requiredLevel: 1 },

  // Knight armor
  { name: "Knight's Surcoat", description: 'Padded cloth worn over mail.', type: 'ARMOR', rarity: 'COMMON', value: 60, defenseBonus: 4, requiredLevel: 1, requiredClass: 'KNIGHT' },

  // Paladin armor
  { name: 'Blessed Chainmail', description: 'Rings of steel consecrated in light.', type: 'ARMOR', rarity: 'COMMON', value: 55, defenseBonus: 4, shieldingSkillBonus: 1, requiredLevel: 1, requiredClass: 'PALADIN' },

  // Sorcerer armor
  { name: 'Apprentice Robe', description: 'Light cloth that crackles with magic.', type: 'ARMOR', rarity: 'COMMON', value: 35, attackBonus: 1, speedBonus: 2, magicSkillBonus: 1, requiredLevel: 1, requiredClass: 'SORCERER' },

  // Druid armor
  { name: 'Bark Tunic', description: 'Hardened bark shaped into a protective vest.', type: 'ARMOR', rarity: 'COMMON', value: 40, attackBonus: 1, defenseBonus: 3, magicSkillBonus: 1, requiredLevel: 1, requiredClass: 'DRUID' },

  // ═══════════════════════════════════════════════════════════════════════════════
  // HUNT 2  (req lvl 5)  ·  HELMET + ACCESSORY drops
  // ═══════════════════════════════════════════════════════════════════════════════

  // Generic helmet
  { name: 'Iron Helmet', description: 'Protects the head.', type: 'HELMET', rarity: 'COMMON', value: 30, defenseBonus: 2, requiredLevel: 5 },

  // Knight helmets + accessory
  { name: 'Steel Greathelm',  description: 'A full-face helmet of tempered steel.', type: 'HELMET',    rarity: 'UNCOMMON', value: 150, defenseBonus: 5,  hpBonus: 10, requiredLevel: 5, requiredClass: 'KNIGHT' },
  { name: 'Iron Gauntlets',   description: 'Heavy gloves that protect the hands.',  type: 'ACCESSORY', rarity: 'COMMON',   value: 40,  defenseBonus: 2,  requiredLevel: 5, requiredClass: 'KNIGHT' },

  // Paladin helmets + accessory
  { name: "Crusader's Helm", description: 'Standard-issue helm of the holy order.', type: 'HELMET',    rarity: 'UNCOMMON', value: 120, defenseBonus: 5,  requiredLevel: 5, requiredClass: 'PALADIN' },
  { name: "Paladin's Sigil", description: 'A holy symbol worn at the wrist.',       type: 'ACCESSORY', rarity: 'COMMON',   value: 35,  defenseBonus: 1,  speedBonus: 2, requiredLevel: 5, requiredClass: 'PALADIN' },

  // Sorcerer helmets + accessory
  { name: 'Pointed Hat',   description: 'The traditional hat of a spellcaster.',   type: 'HELMET',    rarity: 'UNCOMMON', value: 100, attackBonus: 5,  magicSkillBonus: 1, requiredLevel: 5, requiredClass: 'SORCERER' },
  { name: 'Mana Crystal',  description: 'Pulses with raw magical energy.',         type: 'ACCESSORY', rarity: 'COMMON',   value: 40,  attackBonus: 3,  magicSkillBonus: 1, requiredLevel: 5, requiredClass: 'SORCERER' },

  // Druid helmet + accessory
  { name: 'Leaf Crown',      description: 'Woven leaves that channel the forest\'s wisdom.', type: 'HELMET',    rarity: 'UNCOMMON', value: 95,  attackBonus: 4, defenseBonus: 1, magicSkillBonus: 1, requiredLevel: 5, requiredClass: 'DRUID' },
  { name: "Nature's Totem",  description: 'A carved totem radiating natural energy.',        type: 'ACCESSORY', rarity: 'COMMON',   value: 38,  attackBonus: 3, hpBonus: 5,      magicSkillBonus: 1, requiredLevel: 5, requiredClass: 'DRUID' },

  // ═══════════════════════════════════════════════════════════════════════════════
  // HUNT 3  (req lvl 10)  ·  WEAPON + ARMOR drops
  // ═══════════════════════════════════════════════════════════════════════════════

  // Generic swords
  { name: 'Steel Blade', description: 'A sharp steel blade.', type: 'WEAPON', rarity: 'UNCOMMON', value: 200, attackBonus: 15, weaponSkill: 'SWORD', swordSkillBonus: 2, requiredLevel: 10, range: 1 },

  // Knight — axe
  { name: 'Battle Axe', description: 'Cleaves through armour with ease.', type: 'WEAPON', rarity: 'UNCOMMON', value: 350, attackBonus: 22, defenseBonus: 3, weaponSkill: 'AXE', axeSkillBonus: 2, requiredLevel: 10, requiredClass: 'KNIGHT', range: 1 },

  // Paladin — distance
  { name: 'Crossbow', description: 'Fires bolts with punishing force.', type: 'WEAPON', rarity: 'UNCOMMON', value: 250, attackBonus: 18, weaponSkill: 'DISTANCE', distanceSkillBonus: 2, requiredLevel: 10, requiredClass: 'PALADIN', range: 7 },

  // Sorcerer — magic
  { name: 'Crystal Staff', description: 'A staff topped with a clear gem.', type: 'WEAPON', rarity: 'UNCOMMON', value: 280, attackBonus: 20, speedBonus: 3, weaponSkill: 'MAGIC', magicSkillBonus: 2, manaCost: 3, requiredLevel: 10, requiredClass: 'SORCERER', range: 5 },

  // Druid — nature magic
  { name: 'Verdant Staff', description: 'A living staff wrapped in vines.', type: 'WEAPON', rarity: 'UNCOMMON', value: 260, attackBonus: 18, hpBonus: 10, speedBonus: 2, weaponSkill: 'MAGIC', magicSkillBonus: 2, manaCost: 3, requiredLevel: 10, requiredClass: 'DRUID', range: 5 },

  // Generic medium armor
  { name: 'Chain Mail', description: 'Interlocked steel rings.', type: 'ARMOR', rarity: 'UNCOMMON', value: 180, defenseBonus: 10, hpBonus: 20, shieldingSkillBonus: 1, requiredLevel: 10 },

  // Knight armor
  { name: 'Full Plate Armor', description: 'Head-to-toe steel protection.', type: 'ARMOR', rarity: 'UNCOMMON', value: 300, defenseBonus: 14, hpBonus: 30, shieldingSkillBonus: 1, swordSkillBonus: 1, clubSkillBonus: 1, axeSkillBonus: 1, requiredLevel: 10, requiredClass: 'KNIGHT' },

  // Paladin armor
  { name: 'Holy Breastplate', description: 'Glows faintly with divine energy.', type: 'ARMOR', rarity: 'UNCOMMON', value: 300, defenseBonus: 12, hpBonus: 25, shieldingSkillBonus: 2, distanceSkillBonus: 1, requiredLevel: 10, requiredClass: 'PALADIN' },

  // Sorcerer armor
  { name: 'Enchanted Vestments', description: 'Woven with arcane thread.', type: 'ARMOR', rarity: 'UNCOMMON', value: 160, attackBonus: 8, defenseBonus: 2, speedBonus: 5, magicSkillBonus: 2, requiredLevel: 10, requiredClass: 'SORCERER' },

  // Druid armor
  { name: 'Thornweave Coat', description: 'A coat threaded with enchanted thorns.', type: 'ARMOR', rarity: 'UNCOMMON', value: 165, attackBonus: 8, defenseBonus: 4, hpBonus: 10, magicSkillBonus: 2, requiredLevel: 10, requiredClass: 'DRUID' },

  // ═══════════════════════════════════════════════════════════════════════════════
  // HUNT 4  (req lvl 15)  ·  HELMET + ACCESSORY drops
  // ═══════════════════════════════════════════════════════════════════════════════

  // Knight helmet + accessory
  { name: "Knight's Visor", description: 'Polished visor of a seasoned warrior.', type: 'HELMET',    rarity: 'RARE', value: 600, defenseBonus: 12, hpBonus: 25, shieldingSkillBonus: 1, requiredLevel: 15, requiredClass: 'KNIGHT' },
  { name: "Knight's Shield", description: 'A sturdy kite shield.',                 type: 'ACCESSORY', rarity: 'RARE', value: 500, defenseBonus: 15, shieldingSkillBonus: 2,  requiredLevel: 15, requiredClass: 'KNIGHT' },

  // Paladin helmet + accessory
  { name: 'Blessed Visor',    description: 'Inscribed with sacred runes.',               type: 'HELMET',    rarity: 'RARE', value: 550, defenseBonus: 12, hpBonus: 25, shieldingSkillBonus: 2, distanceSkillBonus: 1, requiredLevel: 15, requiredClass: 'PALADIN' },
  { name: 'Divine Talisman',  description: 'Channels divine energy into the wearer.',    type: 'ACCESSORY', rarity: 'RARE', value: 480, hpBonus: 35, speedBonus: 7,  shieldingSkillBonus: 1, requiredLevel: 15, requiredClass: 'PALADIN' },

  // Sorcerer helmet + accessory
  { name: 'Runewoven Hood',   description: 'Runes stitched into the fabric amplify spells.', type: 'HELMET',    rarity: 'RARE', value: 500, attackBonus: 12, speedBonus: 6, magicSkillBonus: 2, requiredLevel: 15, requiredClass: 'SORCERER' },
  { name: 'Spellweave Ring',  description: 'A ring threaded with arcane silk.',              type: 'ACCESSORY', rarity: 'RARE', value: 450, attackBonus: 15, speedBonus: 6, magicSkillBonus: 2, requiredLevel: 15, requiredClass: 'SORCERER' },

  // Druid helmet + accessory
  { name: 'Wildwood Hood',      description: 'A hood woven from enchanted forest vines.',     type: 'HELMET',    rarity: 'RARE', value: 490, attackBonus: 10, hpBonus: 10, speedBonus: 5, magicSkillBonus: 2, requiredLevel: 15, requiredClass: 'DRUID' },
  { name: 'Verdant Talisman',   description: 'A talisman that pulses with natural power.',    type: 'ACCESSORY', rarity: 'RARE', value: 460, attackBonus: 12, hpBonus: 20, speedBonus: 5, magicSkillBonus: 2, requiredLevel: 15, requiredClass: 'DRUID' },

  // Generic accessory
  { name: 'Lucky Charm', description: 'Increases fortune.', type: 'ACCESSORY', rarity: 'UNCOMMON', value: 150, speedBonus: 5, requiredLevel: 15 },

  // ═══════════════════════════════════════════════════════════════════════════════
  // HUNT 5  (req lvl 20)  ·  All slots — Dragon boss zone
  // ═══════════════════════════════════════════════════════════════════════════════

  // Generic sword + heavy armor
  { name: 'Flame Sabre', description: 'Burns with inner fire.',          type: 'WEAPON', rarity: 'RARE', value: 800,  attackBonus: 35, speedBonus: 3, weaponSkill: 'SWORD', swordSkillBonus: 3, requiredLevel: 20, range: 1 },
  { name: 'Plate Armor',  description: 'Heavy but nearly impenetrable.', type: 'ARMOR',  rarity: 'RARE', value: 700,  defenseBonus: 25, hpBonus: 50, shieldingSkillBonus: 1, swordSkillBonus: 1, clubSkillBonus: 1, axeSkillBonus: 1, requiredLevel: 20 },

  // Knight — all slots
  { name: 'Thunder Maul',      description: 'Its impact shakes the ground.',              type: 'WEAPON',    rarity: 'EPIC', value: 2000, attackBonus: 55, hpBonus: 30, weaponSkill: 'CLUB', clubSkillBonus: 3, requiredLevel: 20, requiredClass: 'KNIGHT', range: 1 },
  { name: 'Adamantine Plate',  description: 'Forged from the hardest metal.',             type: 'ARMOR',     rarity: 'EPIC', value: 1500, defenseBonus: 40, hpBonus: 80, shieldingSkillBonus: 2, swordSkillBonus: 2, clubSkillBonus: 2, axeSkillBonus: 2, requiredLevel: 20, requiredClass: 'KNIGHT' },
  { name: "Warlord's Crown",   description: 'Worn only by the mightiest commanders.',     type: 'HELMET',    rarity: 'EPIC', value: 1200, defenseBonus: 20, hpBonus: 40, swordSkillBonus: 1, clubSkillBonus: 1, axeSkillBonus: 1, requiredLevel: 20, requiredClass: 'KNIGHT' },
  { name: "Berserker's Belt",  description: 'Rage-forged belt of a fallen champion.',     type: 'ACCESSORY', rarity: 'EPIC', value: 1200, attackBonus: 18, hpBonus: 35, swordSkillBonus: 1, clubSkillBonus: 1, axeSkillBonus: 1, requiredLevel: 20, requiredClass: 'KNIGHT' },

  // Paladin — all slots
  { name: 'Holy Longbow',   description: 'Blessed arrows strike true.',            type: 'WEAPON',    rarity: 'EPIC', value: 1800, attackBonus: 42, speedBonus: 7, weaponSkill: 'DISTANCE', distanceSkillBonus: 3, requiredLevel: 20, requiredClass: 'PALADIN', range: 7 },
  { name: 'Radiant Aegis',  description: 'Near-legendary crusader armour.',        type: 'ARMOR',     rarity: 'EPIC', value: 1800, defenseBonus: 35, hpBonus: 70, speedBonus: 2, shieldingSkillBonus: 3, distanceSkillBonus: 2, requiredLevel: 20, requiredClass: 'PALADIN' },
  { name: 'Halo Crown',     description: 'Radiates a faint warm light.',           type: 'HELMET',    rarity: 'EPIC', value: 1100, defenseBonus: 18, hpBonus: 40, speedBonus: 5, shieldingSkillBonus: 2, distanceSkillBonus: 2, requiredLevel: 20, requiredClass: 'PALADIN' },
  { name: "Angel's Grace",  description: 'A feather said to come from a seraph.', type: 'ACCESSORY', rarity: 'EPIC', value: 1500, hpBonus: 60, speedBonus: 10, attackBonus: 8, distanceSkillBonus: 3, requiredLevel: 20, requiredClass: 'PALADIN' },

  // Sorcerer — all slots
  { name: 'Shadow Scepter',       description: 'Hums with dark arcane energy.',                    type: 'WEAPON',    rarity: 'EPIC', value: 1800, attackBonus: 48, speedBonus: 8, weaponSkill: 'MAGIC', magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'SORCERER', range: 4 },
  { name: "Archmage's Robe",      description: 'Worn by masters of the arcane arts.',              type: 'ARMOR',     rarity: 'EPIC', value: 1600, attackBonus: 25, defenseBonus: 6, speedBonus: 10, magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'SORCERER' },
  { name: 'Arcane Circlet',       description: 'A thin band that focuses arcane thought.',         type: 'HELMET',    rarity: 'EPIC', value: 1100, attackBonus: 22, hpBonus: 20, speedBonus: 8, magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'SORCERER' },
  { name: 'Eye of the Abyss',     description: 'A gemstone that gazes back at you.',              type: 'ACCESSORY', rarity: 'EPIC', value: 1800, attackBonus: 25, speedBonus: 8, magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'SORCERER' },

  // Druid — all slots
  { name: 'Ancient Grove Staff',  description: 'Carved from a tree older than the kingdom.',       type: 'WEAPON',    rarity: 'EPIC', value: 1750, attackBonus: 45, hpBonus: 20, speedBonus: 7, weaponSkill: 'MAGIC', magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'DRUID', range: 5 },
  { name: 'Ancient Bark Armor',   description: 'Bark forged by centuries of wild magic.',          type: 'ARMOR',     rarity: 'EPIC', value: 1550, attackBonus: 22, defenseBonus: 8, hpBonus: 20, speedBonus: 8, magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'DRUID' },
  { name: "Elder Druid's Cowl",   description: 'Passed down through generations of elder druids.', type: 'HELMET',    rarity: 'EPIC', value: 1050, attackBonus: 20, hpBonus: 15, speedBonus: 7, magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'DRUID' },
  { name: 'Heart of the Forest',  description: 'A gem said to contain the soul of an ancient oak.',type: 'ACCESSORY', rarity: 'EPIC', value: 1700, attackBonus: 22, hpBonus: 30, speedBonus: 7, magicSkillBonus: 3, requiredLevel: 20, requiredClass: 'DRUID' },

  // ═══════════════════════════════════════════════════════════════════════════════
  // STARTING EQUIPMENT — granted on character creation, not dropped in the world
  // ═══════════════════════════════════════════════════════════════════════════════

  // Knight
  { name: 'Worn Sword',      description: 'A battered sword handed to new recruits.',      type: 'WEAPON', rarity: 'COMMON', value: 1, attackBonus: 4,  weaponSkill: 'SWORD', swordSkillBonus: 1, requiredLevel: 1, requiredClass: 'KNIGHT',   range: 1 },
  { name: 'Iron Cap',        description: 'A plain iron cap offering basic protection.',   type: 'HELMET', rarity: 'COMMON', value: 1, defenseBonus: 1, requiredLevel: 1, requiredClass: 'KNIGHT' },
  { name: 'Padded Cuirass',  description: 'Quilted padding beneath a thin iron plate.',   type: 'ARMOR',  rarity: 'COMMON', value: 1, defenseBonus: 2, requiredLevel: 1, requiredClass: 'KNIGHT' },
  { name: 'Iron Greaves',    description: 'Simple iron leg guards.',                       type: 'LEGS',   rarity: 'COMMON', value: 1, defenseBonus: 1, requiredLevel: 1, requiredClass: 'KNIGHT' },
  { name: 'Iron Sabatons',   description: 'Heavy iron boots worn by foot soldiers.',       type: 'BOOTS',  rarity: 'COMMON', value: 1, speedBonus: 1,   requiredLevel: 1, requiredClass: 'KNIGHT' },

  // Paladin
  { name: 'Shortbow',        description: 'A light bow issued to new paladins.',           type: 'WEAPON', rarity: 'COMMON', value: 1, attackBonus: 4, speedBonus: 1, weaponSkill: 'DISTANCE', distanceSkillBonus: 1, requiredLevel: 1, requiredClass: 'PALADIN', range: 6 },
  { name: "Scout's Cap",     description: 'A lightweight cap for rangers on the move.',    type: 'HELMET', rarity: 'COMMON', value: 1, defenseBonus: 1, speedBonus: 1, requiredLevel: 1, requiredClass: 'PALADIN' },
  { name: "Scout's Jerkin",  description: 'Supple leather that does not hinder movement.', type: 'ARMOR',  rarity: 'COMMON', value: 1, defenseBonus: 1, speedBonus: 1, requiredLevel: 1, requiredClass: 'PALADIN' },
  { name: "Scout's Leggings",description: 'Fitted leather leggings for swift movement.',   type: 'LEGS',   rarity: 'COMMON', value: 1, defenseBonus: 1, requiredLevel: 1, requiredClass: 'PALADIN' },
  { name: "Scout's Boots",   description: 'Soft-soled boots that muffle footsteps.',       type: 'BOOTS',  rarity: 'COMMON', value: 1, speedBonus: 2,   requiredLevel: 1, requiredClass: 'PALADIN' },

  // Sorcerer
  { name: 'Cracked Wand',    description: 'A wand with a hairline fracture — still usable.', type: 'WEAPON', rarity: 'COMMON', value: 1, attackBonus: 4, weaponSkill: 'MAGIC', magicSkillBonus: 1, manaCost: 2, requiredLevel: 1, requiredClass: 'SORCERER', range: 4 },
  { name: 'Novice Hood',     description: 'A plain cloth hood worn by magic students.',    type: 'HELMET', rarity: 'COMMON', value: 1, attackBonus: 2,  requiredLevel: 1, requiredClass: 'SORCERER' },
  { name: 'Novice Robe',     description: 'A simple robe given to new apprentices.',       type: 'ARMOR',  rarity: 'COMMON', value: 1, attackBonus: 1, speedBonus: 1, requiredLevel: 1, requiredClass: 'SORCERER' },
  { name: 'Novice Leggings', description: 'Thin cloth leggings with minor enchantments.', type: 'LEGS',   rarity: 'COMMON', value: 1, attackBonus: 1,  requiredLevel: 1, requiredClass: 'SORCERER' },
  { name: 'Novice Slippers', description: 'Soft slippers that let the mind stay focused.', type: 'BOOTS',  rarity: 'COMMON', value: 1, speedBonus: 1,   requiredLevel: 1, requiredClass: 'SORCERER' },

  // Druid
  { name: 'Crooked Branch',  description: 'A gnarled branch with faint natural energy.',  type: 'WEAPON', rarity: 'COMMON', value: 1, attackBonus: 3, hpBonus: 5, weaponSkill: 'MAGIC', magicSkillBonus: 1, manaCost: 2, requiredLevel: 1, requiredClass: 'DRUID', range: 5 },
  { name: 'Bark Cap',        description: 'A cap fashioned from hardened tree bark.',      type: 'HELMET', rarity: 'COMMON', value: 1, defenseBonus: 1, requiredLevel: 1, requiredClass: 'DRUID' },
  { name: 'Bark Vest',       description: 'Layers of bark bound together as a vest.',      type: 'ARMOR',  rarity: 'COMMON', value: 1, attackBonus: 1, defenseBonus: 1, requiredLevel: 1, requiredClass: 'DRUID' },
  { name: 'Bark Leggings',   description: 'Bark strips woven into protective leggings.',   type: 'LEGS',   rarity: 'COMMON', value: 1, defenseBonus: 1, requiredLevel: 1, requiredClass: 'DRUID' },
  { name: 'Bark Shoes',      description: 'Wooden-soled shoes carved for forest travel.',  type: 'BOOTS',  rarity: 'COMMON', value: 1, speedBonus: 1,   requiredLevel: 1, requiredClass: 'DRUID' },

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONSUMABLES & MATERIALS (no zone / class restriction)
  // ═══════════════════════════════════════════════════════════════════════════════
  { name: 'Health Potion', description: 'Restores 50 HP when used.', type: 'CONSUMABLE', rarity: 'COMMON', value: 20 },
  { name: 'Slime Gel',     description: 'A slimy material.',          type: 'MATERIAL',   rarity: 'COMMON', value: 5 },
  { name: 'Goblin Ear',    description: 'Trophy from a goblin.',      type: 'MATERIAL',   rarity: 'COMMON', value: 10 },
  { name: 'Dragon Scale',  description: 'Incredibly tough scale.',    type: 'MATERIAL',   rarity: 'EPIC',   value: 500 },
] as const

async function main() {
  for (const m of MONSTERS) {
    await prisma.monster.upsert({
      where:  { name: m.name },
      update: { zone: m.zone, level: m.level, hp: m.hp, maxHp: m.maxHp, attack: m.attack, defense: m.defense, expReward: m.expReward, goldMin: m.goldMin, goldMax: m.goldMax, respawnSecs: m.respawnSecs },
      create: m,
    })
  }

  for (const item of ITEMS) {
    await prisma.item.upsert({
      where:  { name: item.name },
      update: item,
      create: item,
    })
  }

  console.log('Database seeded successfully.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
