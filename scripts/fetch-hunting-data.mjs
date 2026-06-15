import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT        = join(__dirname, '..')
const MONSTERS_DIR = join(ROOT, 'client', 'public', 'assets', 'monsters')
const OUTPUT_JSON  = join(ROOT, 'hunting-data.json')
const WIKI_API     = 'https://tibia.fandom.com/api.php'
const DELAY_MS     = 2500

mkdirSync(MONSTERS_DIR, { recursive: true })

const delay = ms => new Promise(r => setTimeout(r, ms))

// Fetch with automatic retry on rate-limit (HTML response = Fandom throttling us)
async function apiFetch(url, retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      const wait = 30000 * Math.pow(2, attempt - 1) // 30s, 60s, 120s, 240s
      process.stdout.write(`[throttled, waiting ${wait / 1000}s] `)
      await delay(wait)
    }
    try {
      const res  = await fetch(url, { headers: HEADERS })
      const text = await res.text()
      if (text.trimStart().startsWith('<')) continue // HTML = rate limited, retry
      try { return JSON.parse(text) } catch { continue }
    } catch (e) { process.stdout.write(`[net: ${e.message}] `); continue }
  }
  return null
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://tibia.fandom.com/',
}

// CSS class → rarity label used in the rendered loot table
const CLASS_TO_RARITY = {
  'loot-always':    'always',
  'loot-common':    'common',
  'loot-uncommon':  'uncommon',
  'loot-semi-rare': 'semi-rare',
  'loot-rare':      'rare',
  'loot-very-rare': 'very rare',
}

// ─── Template engine ──────────────────────────────────────────────────────────

// Extract all {{TemplateName|...}} occurrences, handling nested {{ }} correctly.
// Only matches when the char after the name is | or } (prevents {{Ability}} matching {{Ability List}})
function extractTemplates(text, templateName) {
  const search = `{{${templateName}`
  const results = []
  let i = 0
  while ((i = text.indexOf(search, i)) !== -1) {
    const afterName = text[i + search.length]
    if (afterName !== '|' && afterName !== '}' && afterName !== '\n' && afterName !== '\r') {
      i++
      continue
    }
    let depth = 0, j = i
    while (j < text.length) {
      if (text[j] === '{' && text[j + 1] === '{')      { depth++; j += 2 }
      else if (text[j] === '}' && text[j + 1] === '}') { depth--; j += 2; if (depth === 0) break }
      else j++
    }
    results.push({ full: text.slice(i, j), inner: text.slice(i + search.length, j - 2) })
    i = j
  }
  return results
}

// Remove all nested {{...}} templates from a string (for safe param splitting)
function stripTemplates(text) {
  let out = '', depth = 0, i = 0
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{')      { depth++; i += 2 }
    else if (text[i] === '}' && text[i + 1] === '}') { depth--; i += 2 }
    else if (depth === 0)                             { out += text[i++] }
    else                                               i++
  }
  return out
}

// Parse a template's inner content into { named, pos } params
function parseParams(inner) {
  const cleaned = stripTemplates(inner)
  const named = {}, pos = []
  for (const p of cleaned.split('|').map(s => s.trim()).filter(Boolean)) {
    const eq = p.indexOf('=')
    if (eq !== -1) named[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim()
    else           pos.push(p)
  }
  return { named, pos }
}

// ─── Field parsers ────────────────────────────────────────────────────────────

// Single-line field (stops at | or newline)
function field(wikitext, name) {
  const m = wikitext.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|{}\\[\\]]+)`))
  return m ? m[1].trim() : null
}

// Multi-line field — capture until next `\n|` or `\n}}`; strip wiki markup
function textField(wikitext, name) {
  const m = wikitext.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\||\\n\\}\\})`))
  if (!m) return null
  return m[1].trim()
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[Link|Display]] → Display
    .replace(/\[\[([^\]]+)\]\]/g, '$1')             // [[Link]] → Link
    .replace(/\{\{[^}]*\}\}/g, '')                  // remove remaining templates
    .replace(/\s+/g, ' ').trim()
}

function intField(wikitext, name) {
  const v = field(wikitext, name)
  if (v === null) return null
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? null : n
}

function floatField(wikitext, name) {
  const v = field(wikitext, name)
  if (v === null) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function boolField(wikitext, name) {
  const v = field(wikitext, name)
  if (v === null) return null
  return v.toLowerCase() === 'yes'
}

function listField(wikitext, name) {
  const v = field(wikitext, name)
  if (!v || v === '--') return []
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

function costField(wikitext, name) {
  const v = field(wikitext, name)
  if (!v || v === '--') return null
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? null : n
}

// ─── Section parsers ──────────────────────────────────────────────────────────

function parseAbilities(wikitext) {
  const abilities = []
  const list = extractTemplates(wikitext, 'Ability List')
  if (!list.length) return abilities
  const block = list[0].inner

  for (const t of extractTemplates(block, 'Melee')) {
    const { named, pos } = parseParams(t.inner)
    abilities.push({ name: 'Melee', damage: named.damage || pos[0] || null, element: named.element || 'physical' })
  }

  for (const t of extractTemplates(block, 'Ability')) {
    const { named, pos } = parseParams(t.inner)
    abilities.push({ name: pos[0] || null, damage: named.damage || pos[1] || null, element: named.element || 'neutral' })
  }

  for (const t of extractTemplates(block, 'Healing')) {
    const { named, pos } = parseParams(t.inner)
    abilities.push({ name: 'Self-Healing', damage: named.range || named.damage || pos[0] || null, element: 'healing' })
  }

  for (const t of extractTemplates(block, 'Skill Drain')) {
    const { named, pos } = parseParams(t.inner)
    abilities.push({ name: named.skill || pos[0] || 'Skill Drain', damage: named.amount || pos[1] || null, element: 'drain' })
  }

  for (const t of extractTemplates(block, 'Lifedrain')) {
    const { named, pos } = parseParams(t.inner)
    abilities.push({ name: 'Life Drain', damage: named.damage || pos[0] || null, element: 'death' })
  }

  for (const t of extractTemplates(block, 'Manadrain')) {
    const { named, pos } = parseParams(t.inner)
    abilities.push({ name: 'Mana Drain', damage: named.damage || pos[0] || null, element: 'mana' })
  }

  for (const t of extractTemplates(block, 'Summons')) {
    const { named, pos } = parseParams(t.inner)
    const creature = named.creature || pos[0] || 'creature'
    const amount   = named.amount   || pos[1] || null
    abilities.push({ name: `Summon ${creature}${amount ? ` (×${amount})` : ''}`, damage: null, element: 'summon' })
  }

  return abilities
}

function parseMaxDamage(wikitext) {
  const matches = extractTemplates(wikitext, 'Max Damage')
  if (!matches.length) return null
  const { named } = parseParams(matches[0].inner)
  const out = {}
  for (const [k, v] of Object.entries(named)) {
    const n = parseInt(v, 10)
    if (!isNaN(n)) out[k] = n
  }
  return Object.keys(out).length ? out : null
}

function parseDamageModifiers(wikitext) {
  const mods = {
    physical: 'physicalDmgMod',
    earth:    'earthDmgMod',
    fire:     'fireDmgMod',
    death:    'deathDmgMod',
    energy:   'energyDmgMod',
    holy:     'holyDmgMod',
    ice:      'iceDmgMod',
    hpDrain:  'hpDrainDmgMod',
    drown:    'drownDmgMod',
    healing:  'healMod',
  }
  const result = {}
  for (const [label, wikitextField] of Object.entries(mods)) {
    result[label] = intField(wikitext, wikitextField)
  }
  return result
}

// Parse loot from rendered HTML — extracts exact % from data-sort-value attributes
function parseLootFromHtml(html) {
  if (!html) return []

  // Isolate the Loot section's first table
  const sectionMatch = html.match(/id="Loot"[\s\S]*?(<table[\s\S]*?<\/table>)/)
  if (!sectionMatch) return []
  const tableHtml = sectionMatch[1]

  const loot = []
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g
  let rowMatch

  while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
    const row = rowMatch[1]
    if (/<th[\s>]/.test(row)) continue // skip header

    // Collect all <td> elements
    const tds = []
    const tdRe = /<td([^>]*)>([\s\S]*?)<\/td>/g
    let tdM
    while ((tdM = tdRe.exec(row)) !== null)
      tds.push({ attrs: tdM[1], content: tdM[2] })
    if (tds.length < 5) continue

    // td[1] — item name (anchor or plain text for "Empty")
    const linkM = tds[1].content.match(/<a[^>]*>([^<]+)<\/a>/)
    const item  = linkM
      ? linkM[1].trim()
      : tds[1].content.replace(/<[^>]+>/g, '').trim()
    if (!item) continue

    // td[3] — quantity range ("1" means single, show as null)
    const quantity = tds[3].content.replace(/<[^>]+>/g, '').trim()

    // td[4] — average per kill
    const avg = parseFloat(tds[4].content.replace(/<[^>]+>/g, '').trim())

    // td[5] — exact drop % via data-sort-value; rarity via CSS class
    const sortM  = tds[5].attrs.match(/data-sort-value="([^"]+)"/)
    const classM = tds[5].attrs.match(/class="([^"]+)"/)
    if (!sortM) continue

    const dropRate = Math.round(parseFloat(sortM[1]) * 100) / 100
    const rarity   = CLASS_TO_RARITY[classM?.[1]?.trim()] ?? 'common'

    loot.push({
      item,
      quantity: quantity && quantity !== '1' ? quantity : null,
      avg:      isNaN(avg) ? null : avg,
      dropRate,
      rarity,
    })
  }

  return loot
}

function parseSounds(wikitext) {
  const m = extractTemplates(wikitext, 'Sound List')
  if (!m.length) return []
  return stripTemplates(m[0].inner).split('|').map(s => s.trim()).filter(Boolean)
}

// ─── Full creature parser ─────────────────────────────────────────────────────

function parseCreature(wikitext, html) {
  return {
    general: {
      article:     field(wikitext, 'article'),
      actualName:  field(wikitext, 'actualname'),
      plural:      field(wikitext, 'plural'),
      class:       field(wikitext, 'creatureclass'),
      type:        field(wikitext, 'primarytype'),
      illusionable: boolField(wikitext, 'illusionable'),
      spawnType:   field(wikitext, 'spawntype'),
      implemented: field(wikitext, 'implemented'),
      raceId:      intField(wikitext, 'race_id'),
    },
    combat: {
      hp:           intField(wikitext, 'hp'),
      exp:          intField(wikitext, 'exp'),
      armor:        intField(wikitext, 'armor'),
      mitigation:   floatField(wikitext, 'mitigation'),
      speed:        intField(wikitext, 'speed'),
      runsAt:       intField(wikitext, 'runsat'),
      maxDamage:    parseMaxDamage(wikitext),
      attackType:   field(wikitext, 'attacktype'),
      usesSpells:   boolField(wikitext, 'usespells'),
      pushable:     boolField(wikitext, 'pushable'),
      pushObjects:  boolField(wikitext, 'pushobjects'),
      walksAround:  listField(wikitext, 'walksaround'),
      walksThrough: listField(wikitext, 'walksthrough'),
      summonCost:   costField(wikitext, 'summon'),
      convinceCost: costField(wikitext, 'convince'),
    },
    bestiary: {
      class:       field(wikitext, 'bestiaryclass'),
      level:       field(wikitext, 'bestiarylevel'),
      occurrence:  field(wikitext, 'occurrence'),
      isBoss:      boolField(wikitext, 'isboss'),
      isArenaBoss: boolField(wikitext, 'isarenaboss'),
      description: textField(wikitext, 'bestiarytext'),
    },
    immunities: {
      paralysis:    boolField(wikitext, 'paraimmune'),
      seeInvisible: boolField(wikitext, 'senseinvis'),
    },
    behaviour: {
      description: textField(wikitext, 'behaviour'),
      runsAt:      intField(wikitext, 'runsat'),
      sounds:      parseSounds(wikitext),
    },
    abilities:        parseAbilities(wikitext),
    damageModifiers:  parseDamageModifiers(wikitext),
    loot:             parseLootFromHtml(html),
  }
}

// ─── Zone parser ──────────────────────────────────────────────────────────────

function parseZone(pageName, wikitext) {
  const bestLoot = ['bestloot','bestloot2','bestloot3','bestloot4','bestloot5']
    .map(f => field(wikitext, f)).filter(Boolean)

  const monsters = []
  for (const t of extractTemplates(wikitext, 'CreatureList')) {
    const cleaned = stripTemplates(t.inner)
    for (let part of cleaned.split('|')) {
      part = part.trim()
      if (!part || part.includes('=')) continue          // empty or named param (type=, caption=)
      if (part.includes(',') || part.length > 60) continue // prose notes
      if (!/^[A-Z\[]/.test(part)) continue               // must start uppercase or [[
      // Strip wiki link syntax: [[Link|Display]] → Display, [[Link]] → Link
      part = part
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/_/g, ' ')
        .trim()
      if (part && /^[A-Z]/.test(part)) monsters.push(part)
    }
  }

  return {
    name:       field(wikitext, 'name') || pageName,
    city:       field(wikitext, 'city'),
    levels: {
      knight:  intField(wikitext, 'lvlknights'),
      paladin: intField(wikitext, 'lvlpaladins'),
      mage:    intField(wikitext, 'lvlmages'),
    },
    expRating:  intField(wikitext, 'expstar'),
    lootRating: intField(wikitext, 'lootstar'),
    bestLoot,
    monsters: [...new Set(monsters)],
  }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function getHuntingPlaceNames() {
  const url  = `${WIKI_API}?action=query&list=embeddedin&eititle=Template:Infobox_Hunt&format=json&eilimit=500`
  const json = await apiFetch(url)
  return json?.query?.embeddedin?.map(p => p.title) ?? []
}

async function getWikitext(pageName) {
  const url  = `${WIKI_API}?action=parse&page=${encodeURIComponent(pageName.replace(/ /g, '_'))}&format=json&prop=wikitext`
  const json = await apiFetch(url)
  if (!json || json.error) return null
  return json?.parse?.wikitext?.['*'] ?? null
}

async function getCreaturePage(pageName) {
  const url  = `${WIKI_API}?action=parse&page=${encodeURIComponent(pageName.replace(/ /g, '_'))}&format=json&prop=wikitext|text`
  const json = await apiFetch(url)
  if (!json || json.error) return { wikitext: null, html: null }
  return {
    wikitext: json?.parse?.wikitext?.['*'] ?? null,
    html:     json?.parse?.text?.['*']     ?? null,
  }
}

async function resolveImageUrl(name) {
  const title = `File:${name.replace(/ /g, '_')}.gif`
  const url   = `${WIKI_API}?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`
  try {
    const json  = await (await fetch(url, { headers: HEADERS })).json()
    const pages = json?.query?.pages ?? {}
    const page  = Object.values(pages)[0]
    return page?.imageinfo?.[0]?.url ?? null
  } catch { return null }
}

async function fetchSprite(name) {
  const filename = name.toLowerCase().replace(/ /g, '_') + '.gif'
  const outPath  = join(MONSTERS_DIR, filename)
  if (existsSync(outPath)) return `/assets/monsters/${filename}`

  const imageUrl = await resolveImageUrl(name)
  if (!imageUrl) return null

  try {
    const res = await fetch(imageUrl, { headers: HEADERS })
    if (!res.ok) return null
    writeFileSync(outPath, Buffer.from(await res.arrayBuffer()))
    return `/assets/monsters/${filename}`
  } catch { return null }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('Fetching hunting place list...')
  const huntingPlaces = await getHuntingPlaceNames()
  console.log(`Found ${huntingPlaces.length} hunting places\n`)

  // Phase 1 — zones
  console.log('=== Phase 1: Zones ===')
  const zones       = []
  const allMonsters = new Set()

  for (const pageName of huntingPlaces) {
    process.stdout.write(`  ${pageName}... `)
    const wikitext = await getWikitext(pageName)
    if (!wikitext) { console.log('skip'); continue }
    const zone = parseZone(pageName, wikitext)
    zones.push(zone)
    zone.monsters.forEach(m => allMonsters.add(m))
    console.log(`ok — ${zone.monsters.length} monsters`)
    await delay(DELAY_MS)
  }

  // Phase 2 — monsters
  console.log(`\n=== Phase 2: Monsters (${allMonsters.size} unique) ===`)
  const monsters = {}

  for (const name of allMonsters) {
    process.stdout.write(`  ${name}... `)
    const [{ wikitext, html }, sprite] = await Promise.all([getCreaturePage(name), fetchSprite(name)])

    if (!wikitext) {
      console.log('miss')
      monsters[name] = { sprite, general: {}, combat: {}, bestiary: {}, immunities: {}, behaviour: {}, abilities: [], damageModifiers: {}, loot: [] }
    } else {
      const data = parseCreature(wikitext, html)
      monsters[name] = { sprite, ...data }
      const { hp, exp } = data.combat
      console.log(`hp=${hp ?? '?'} exp=${exp ?? '?'} abilities=${data.abilities.length} loot=${data.loot.length} sprite=${sprite ? 'yes' : 'no'}`)
    }

    await delay(DELAY_MS)
  }

  writeFileSync(OUTPUT_JSON, JSON.stringify({ zones, monsters }, null, 2))

  const withStats   = Object.values(monsters).filter(m => m.combat?.hp   !== null && m.combat?.hp   !== undefined).length
  const withSprites = Object.values(monsters).filter(m => m.sprite !== null).length
  const withAbils   = Object.values(monsters).filter(m => m.abilities?.length > 0).length
  const totalLoot   = Object.values(monsters).reduce((n, m) => n + (m.loot?.length ?? 0), 0)

  console.log(`
Done!
  Zones      : ${zones.length}
  Monsters   : ${Object.keys(monsters).length} unique
               ${withStats} with HP/EXP
               ${withAbils} with abilities
               ${withSprites} with sprites
               ${totalLoot} total loot entries
  Output     : hunting-data.json`)
}

run()
