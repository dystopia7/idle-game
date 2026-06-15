/**
 * Reads hunting-data.json and produces:
 *   server/prisma/seed-monsters.json   — monster rows for seed.ts
 *   client/src/data/zones.ts           — CITIES array for TravelWindow
 *
 * Run: node scripts/generate-game-data.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const { zones, monsters } = JSON.parse(readFileSync(join(ROOT, 'hunting-data.json'), 'utf8'))

// ─── City name → game key ─────────────────────────────────────────────────────

const CITY_MAP = {
  'Venore':          'venore',
  'Carlin':          'carlin',
  'Thais':           'thais',
  'Kazordoon':       'kazordoon',
  "Ab'Dendriel":     'abdendriel',
  "Ab'dendriel":     'abdendriel',
  'Port Hope':       'porthope',
  'Darashia':        'darashia',
  'Ankrahmun':       'ankrahmun',
  'Edron':           'edron',
  'Svargrond':       'svargrond',
  'Liberty Bay':     'libertybay',
  'Yalahar':         'yalahar',
  'Farmine':         'farmine',
  'Gray Beach':      'graybeach',
  'Issavi':          'issavi',
  'Roshamuul':       'roshamuul',
  'Rathleton':       'rathleton',
  'Rookgaard':       'rookgaard',
  'Dawnport':        'rookgaard',
  'Darama':          'darashia',
  'Northern Darama': 'darashia',
  'Kilmaresh':       'issavi',
  'Marapur':         'issavi',
  'Feyrist':         'edron',
  'Zao':             'farmine',
  'Candia':          'rathleton',
  'Oramond':         'rathleton',
}

const CITY_META = [
  { key: 'rookgaard', name: 'Rookgaard',   minLevel: null },
  { key: 'venore',    name: 'Venore',      minLevel: null },
  { key: 'carlin',    name: 'Carlin',      minLevel: null },
  { key: 'thais',     name: 'Thais',       minLevel: null },
  { key: 'kazordoon', name: 'Kazordoon',   minLevel: null },
  { key: 'abdendriel',name: "Ab'Dendriel", minLevel: null },
  { key: 'porthope',  name: 'Port Hope',   minLevel: null },
  { key: 'darashia',  name: 'Darashia',    minLevel: null },
  { key: 'ankrahmun', name: 'Ankrahmun',   minLevel: null },
  { key: 'edron',     name: 'Edron',       minLevel: 400  },
  { key: 'svargrond', name: 'Svargrond',   minLevel: 475  },
  { key: 'libertybay',name: 'Liberty Bay', minLevel: 550  },
  { key: 'yalahar',   name: 'Yalahar',     minLevel: 650  },
  { key: 'farmine',   name: 'Farmine',     minLevel: 775  },
  { key: 'rathleton', name: 'Rathleton',   minLevel: 925  },
  { key: 'graybeach', name: 'Gray Beach',  minLevel: 1100 },
  { key: 'issavi',    name: 'Issavi',      minLevel: 1300 },
  { key: 'roshamuul', name: 'Roshamuul',   minLevel: 1550 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function zoneIcon(name) {
  const n = name.toLowerCase()
  if (n.includes('dragon'))                                          return '🐉'
  if (n.includes('demon') || n.includes('hell'))                    return '😈'
  if (n.includes('tomb') || n.includes('crypt') || n.includes('grave')) return '⚰️'
  if (n.includes('tower') || n.includes('castle') || n.includes('fortress') || n.includes('stronghold')) return '🏰'
  if (n.includes('cave') || n.includes('cavern') || n.includes('dungeon') || n.includes('lair')) return '🕳️'
  if (n.includes('spider'))                                         return '🕷️'
  if (n.includes('forest') || n.includes('wood') || n.includes('jungle')) return '🌲'
  if (n.includes('swamp') || n.includes('marsh'))                   return '🐊'
  if (n.includes('desert') || n.includes('sand') || n.includes('pyramid')) return '🏜️'
  if (n.includes('ice') || n.includes('frozen') || n.includes('snow') || n.includes('glacier') || n.includes('iceberg')) return '❄️'
  if (n.includes('skull') || n.includes('bone') || n.includes('undead') || n.includes('ghost')) return '💀'
  if (n.includes('island') || n.includes('beach') || n.includes('coast')) return '🏝️'
  if (n.includes('mine') || n.includes('quarry'))                   return '⛏️'
  if (n.includes('ruin') || n.includes('ancient') || n.includes('old')) return '🏛️'
  if (n.includes('deep') || n.includes('abyss'))                    return '🌑'
  if (n.includes('swamp'))                                          return '🌿'
  return '⚔️'
}

function deriveStats(monster) {
  const c = monster.combat ?? {}
  const hp         = Math.max(1, c.hp ?? 1)
  const expReward  = Math.max(0, c.exp ?? 0)
  const maxPhysical = c.maxDamage?.physical ?? Math.round(hp / 8)
  const attack     = Math.max(2, Math.round(maxPhysical * 0.7))
  const defense    = Math.max(0, c.armor ?? 0)

  const cappedExp = Math.min(expReward, 1_000_000) // cap at 1M exp — bad scrape guard

  const goldLoot      = monster.loot?.find(l => l.item === 'Gold Coin')
  const goldAvgPerKill = goldLoot
    ? (goldLoot.avg ?? 1) * (goldLoot.dropRate ?? 0) / 100
    : Math.round(cappedExp / 4)
  const goldMin = Math.max(0, Math.round(goldAvgPerKill * 0.4))
  const goldMax = Math.max(1, Math.min(500_000, Math.round(goldAvgPerKill * 1.6)))

  const level       = Math.max(1, Math.min(999, Math.round(Math.pow(Math.max(1, cappedExp), 0.55) / 2)))
  const respawnSecs = Math.max(30, Math.min(600, Math.round(hp / 15)))
  const isBoss      = monster.bestiary?.isBoss ?? false

  return { hp, maxHp: hp, attack, defense, expReward: cappedExp, goldMin, goldMax, level, respawnSecs, isBoss }
}

// ─── Process zones ────────────────────────────────────────────────────────────

// Filter out event/quest-only creatures: 0 exp and high HP/attack (special scripted creatures)
function isValidMonster(name) {
  const m = monsters[name]
  if (!m?.combat?.hp) return false
  const hp  = m.combat.hp
  const exp = m.combat.exp ?? 0
  const atk = m.combat.maxDamage?.physical ?? 0
  if (exp === 0 && (hp > 500 || atk > 100)) return false // event creature
  if (name.toLowerCase().includes('(creature)')) return false
  return true
}

const seenZoneKeys = new Set()
const processedZones = []

for (const z of Object.values(zones)) {
  const cityKey = CITY_MAP[z.city]
  if (!cityKey) continue

  const withData = (z.monsters ?? []).filter(isValidMonster)
  if (withData.length === 0) continue

  const zoneKey = `${cityKey}_${slugify(z.name)}`
  if (seenZoneKeys.has(zoneKey)) continue  // deduplicate
  seenZoneKeys.add(zoneKey)

  const minLevel = z.levels?.knight ?? z.levels?.paladin ?? z.levels?.mage ?? 1

  const sorted   = [...withData].sort((a, b) => (monsters[b].combat?.exp ?? 0) - (monsters[a].combat?.exp ?? 0))
  const primary  = sorted[0]
  const expVals  = withData.map(n => monsters[n].combat?.exp ?? 0).filter(e => e > 0)
  const expMin   = expVals.length ? Math.min(...expVals) : 0
  const expMax   = expVals.length ? Math.max(...expVals) : 0

  processedZones.push({ cityKey, key: zoneKey, name: z.name, monster: primary,
    expMin, expMax, minLevel, icon: zoneIcon(z.name), monsterNames: withData })
}

processedZones.sort((a, b) => a.minLevel - b.minLevel)

// ─── Assign each monster to its first (lowest-level) zone ────────────────────

const monsterZone = new Map()
for (const zone of processedZones) {
  for (const name of zone.monsterNames) {
    if (!monsterZone.has(name)) monsterZone.set(name, zone.key)
  }
}

// ─── Build seed monster array ─────────────────────────────────────────────────

const seedMonsters = []
for (const [name, zoneKey] of monsterZone.entries()) {
  const m = monsters[name]
  if (!m?.combat?.hp) continue
  seedMonsters.push({ name, zone: zoneKey, ...deriveStats(m) })
}

seedMonsters.sort((a, b) => a.level - b.level)

// ─── Build CITIES for client ──────────────────────────────────────────────────

const cityZonesMap = new Map()
for (const zone of processedZones) {
  if (!cityZonesMap.has(zone.cityKey)) cityZonesMap.set(zone.cityKey, [])
  cityZonesMap.get(zone.cityKey).push({
    key: zone.key, name: zone.name, monster: zone.monster,
    expMin: zone.expMin, expMax: zone.expMax,
    minLevel: zone.minLevel, icon: zone.icon,
  })
}

// ─── Write outputs ────────────────────────────────────────────────────────────

writeFileSync(
  join(ROOT, 'server', 'prisma', 'seed-monsters.json'),
  JSON.stringify(seedMonsters, null, 2)
)

const cities = CITY_META.map(c => ({ ...c, zones: cityZonesMap.get(c.key) ?? [] }))
const zonesTs = `// Auto-generated by scripts/generate-game-data.mjs — do not edit manually
/* eslint-disable */

export interface ZoneInfo {
  key:      string
  name:     string
  monster:  string
  expMin:   number
  expMax:   number
  minLevel: number
  icon:     string
}

export interface CityInfo {
  key:      string
  name:     string
  minLevel: number | null
  zones:    ZoneInfo[]
}

export const CITIES: CityInfo[] = ${JSON.stringify(cities, null, 2)}
`
writeFileSync(join(ROOT, 'client', 'src', 'data', 'zones.ts'), zonesTs)

// ─── Stats ────────────────────────────────────────────────────────────────────

const zonesWithMonsters = [...cityZonesMap.values()].reduce((s, a) => s + a.length, 0)
console.log(`Zones processed : ${processedZones.length}`)
console.log(`Zones with data : ${zonesWithMonsters}`)
console.log(`Seed monsters   : ${seedMonsters.length}`)
console.log(`\nWrote server/prisma/seed-monsters.json`)
console.log(`Wrote client/src/data/zones.ts`)

// Print a sample
const venoreZones = cityZonesMap.get('venore') ?? []
console.log(`\nVenore zones (${venoreZones.length}):`)
for (const z of venoreZones.slice(0, 5)) {
  console.log(`  [${z.minLevel}] ${z.name} — ${z.monster} (${z.expMin}-${z.expMax} exp)`)
}
