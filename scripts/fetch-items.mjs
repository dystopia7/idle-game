import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const ROOT       = join(__dirname, '..')
const ITEMS_DIR  = join(ROOT, 'client', 'public', 'assets', 'items')
const OUTPUT_JSON = join(ROOT, 'items-data.json')
const WIKI_API   = 'https://tibia.fandom.com/api.php'
const DELAY_MS   = 2500
const SAVE_EVERY = 50   // write progress to disk every N items

mkdirSync(ITEMS_DIR, { recursive: true })

const delay = ms => new Promise(r => setTimeout(r, ms))

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://tibia.fandom.com/',
}

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
    } catch (e) { process.stdout.write(`[fetch: ${e.message}] `); continue }
  }
  return null
}

// ─── Category map ─────────────────────────────────────────────────────────────

const CATEGORIES = {
  'Body Equipment': [
    'Helmets', 'Armors', 'Shields', 'Legs', 'Spellbooks', 'Boots', 'Quivers',
  ],
  'Weapons': [
    'Axe Weapons', 'Club Weapons', 'Sword Weapons', 'Fist Fighting Weapons',
    'Rods', 'Wands', 'Throwing Weapons', 'Bows', 'Ammunition',
    'Crossbows', 'Old Wands',
  ],
  'Household Items': [
    'Books', 'Carpets', 'Containers', 'Contest Prizes', 'Fansite Items',
    'Decorations', 'Documents and Papers', 'Dolls and Bears', 'Furniture',
    'Kitchen Tools', 'Musical Instruments', 'Trophies',
  ],
  'Plants, Animal Products, Food and Drink': [
    'Creature Products', 'Food', 'Liquids', 'Plants and Herbs',
  ],
  'Tools and other Equipment': [
    'Amulets and Necklaces', 'Keys', 'Light Sources', 'Painting Equipment',
    'Rings', 'Tools', 'Taming Items', 'Diving Equipment',
  ],
  'Other Items': [
    'Clothing Accessories', 'Enchanted Items', 'Game Tokens', 'Valuables',
    'Magical Items', 'Metals', 'Party Items', 'Blessing Charms',
    'Quest Items', 'Rubbish', 'Runes',
  ],
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function field(wikitext, name) {
  const m = wikitext.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^\\n|{}\\[\\]]+)`))
  return m ? m[1].trim() : null
}

function intField(wikitext, name) {
  const v = field(wikitext, name)
  if (!v || v === '--') return null
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? null : n
}

function floatField(wikitext, name) {
  const v = field(wikitext, name)
  if (!v) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function textField(wikitext, name) {
  const m = wikitext.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\||\\n\\}\\})`))
  if (!m) return null
  return m[1].trim()
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\s+/g, ' ').trim() || null
}

// ─── Item parser ──────────────────────────────────────────────────────────────

function parseItem(wikitext, category, subtype) {
  const npcPrice = intField(wikitext, 'npcprice')   // what you PAY to buy from NPC
  const npcValue = intField(wikitext, 'npcvalue')   // what you GET when selling to NPC

  const buyFrom = field(wikitext, 'buyfrom')
  const sellTo  = field(wikitext, 'sellto')

  return {
    category,
    subtype,
    itemId:       intField(wikitext, 'itemid'),
    slot:         field(wikitext, 'slot'),
    objectClass:  field(wikitext, 'objectclass'),
    implemented:  field(wikitext, 'implemented'),

    // Combat stats
    armor:        intField(wikitext, 'armor'),
    attack:       intField(wikitext, 'attack'),
    defense:      intField(wikitext, 'defense'),
    defMod:       intField(wikitext, 'defmod'),
    range:        intField(wikitext, 'range'),
    hands:        field(wikitext, 'hands'),
    weaponType:   field(wikitext, 'weapontype'),
    upgradeClass: intField(wikitext, 'upgradeclass'),

    // Bonuses and protection
    attributes:   textField(wikitext, 'attributes'),
    resist:       field(wikitext, 'resist'),
    charges:      intField(wikitext, 'charges'),

    // Requirements
    levelRequired: intField(wikitext, 'levelrequired'),
    vocRequired:   field(wikitext, 'vocrequired'),
    imbuSlots:     intField(wikitext, 'imbueslots'),

    // Physical
    weight: floatField(wikitext, 'weight'),

    // Economy
    buyFromNpc:    buyFrom && buyFrom !== '--' ? buyFrom : null,
    sellToNpc:     sellTo  && sellTo  !== '--' ? sellTo  : null,
    buyFromNpcPrice: npcPrice && npcPrice > 0 ? npcPrice : null,
    sellToNpcPrice:  npcValue && npcValue > 0 ? npcValue : null,
    marketValue:   field(wikitext, 'value'),
  }
}

// ─── Sprite fetch ─────────────────────────────────────────────────────────────

async function resolveImageUrl(name) {
  const title = `File:${name.replace(/ /g, '_')}.gif`
  const url   = `${WIKI_API}?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`
  const json  = await apiFetch(url)
  const pages = json?.query?.pages ?? {}
  return Object.values(pages)[0]?.imageinfo?.[0]?.url ?? null
}

async function fetchSprite(name) {
  const filename = name.toLowerCase().replace(/ /g, '_') + '.gif'
  const outPath  = join(ITEMS_DIR, filename)
  if (existsSync(outPath)) return `/assets/items/${filename}`

  const imageUrl = await resolveImageUrl(name)
  if (!imageUrl) return null

  try {
    const res = await fetch(imageUrl, { headers: HEADERS })
    if (!res.ok) return null
    writeFileSync(outPath, Buffer.from(await res.arrayBuffer()))
    return `/assets/items/${filename}`
  } catch { return null }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function getCategoryItems(categoryName) {
  const names = []
  let continueParam = ''
  do {
    const url  = `${WIKI_API}?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(categoryName)}&format=json&cmlimit=500&cmnamespace=0${continueParam}`
    const json = await apiFetch(url)
    if (!json || json.error) break
    const batch = json?.query?.categorymembers ?? []
    names.push(...batch.map(m => m.title))
    continueParam = json?.continue?.cmcontinue
      ? `&cmcontinue=${encodeURIComponent(json.continue.cmcontinue)}`
      : ''
  } while (continueParam)

  return names.filter(n =>
    n !== categoryName &&
    !n.startsWith('Category:') &&
    !n.includes('Products by NPC') &&
    !n.includes('Loot Statistics') &&
    !n.includes('/') &&
    !n.startsWith('List of')
  )
}

async function getItemPage(name) {
  const url  = `${WIKI_API}?action=parse&page=${encodeURIComponent(name.replace(/ /g, '_'))}&format=json&prop=wikitext`
  const json = await apiFetch(url)
  if (!json || json.error) return null
  return json?.parse?.wikitext?.['*'] ?? null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  // Quick connectivity check
  process.stdout.write('Checking API... ')
  const testItems = await getCategoryItems('Armors')
  if (testItems.length === 0) {
    console.log('FAILED\n\nYour IP is rate-limited by Fandom. Wait 30-60 minutes then try again.\nThe scripts now use 2.5s delays and 30s+ backoff to stay under the limit.')
    return
  }
  console.log(`ok (${testItems.length} armors found)\n`)

  // Load existing progress for resumability
  let items = {}
  if (existsSync(OUTPUT_JSON)) {
    try {
      items = JSON.parse(readFileSync(OUTPUT_JSON, 'utf8')).items ?? {}
      console.log(`Resuming — ${Object.keys(items).length} items already processed\n`)
    } catch { items = {} }
  }

  // Phase 1 — collect all item names per category
  console.log('=== Phase 1: Collecting item lists ===')
  const itemQueue = [] // [{ name, category, subtype }]

  for (const [category, subtypes] of Object.entries(CATEGORIES)) {
    for (const subtype of subtypes) {
      process.stdout.write(`  ${subtype}... `)
      const names = await getCategoryItems(subtype)
      console.log(`${names.length} items`)
      for (const name of names) itemQueue.push({ name, category, subtype })
      await delay(DELAY_MS)
    }
  }

  // Deduplicate (some items appear in multiple categories)
  const seen = new Set()
  const unique = itemQueue.filter(({ name }) => {
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })

  const total   = unique.length
  const todo    = unique.filter(({ name }) => !items[name])
  console.log(`\nTotal: ${total} items (${total - todo.length} already done, ${todo.length} to fetch)\n`)

  // Phase 2 — fetch each item
  console.log('=== Phase 2: Fetching item data ===')
  let done = 0, failed = 0

  for (const { name, category, subtype } of todo) {
    process.stdout.write(`  [${done + 1}/${todo.length}] ${name}... `)

    const wikitext = await getItemPage(name)
    const sprite   = await fetchSprite(name)

    if (!wikitext) {
      console.log('miss')
      failed++
    } else {
      const data = parseItem(wikitext, category, subtype)
      items[name] = { ...data, sprite }
      const stats = [
        data.armor    !== null ? `armor=${data.armor}` : null,
        data.attack   !== null ? `atk=${data.attack}`  : null,
        data.defense  !== null ? `def=${data.defense}`  : null,
        data.resist               ? `resist`            : null,
        data.attributes           ? `attr`              : null,
      ].filter(Boolean).join(' ') || 'no combat stats'
      console.log(`ok — ${stats}`)
      done++
    }

    // Save progress periodically
    if ((done + failed) % SAVE_EVERY === 0) {
      writeFileSync(OUTPUT_JSON, JSON.stringify({ items }, null, 2))
      process.stdout.write('  [saved]\n')
    }

    await delay(DELAY_MS)
  }

  // Final save
  writeFileSync(OUTPUT_JSON, JSON.stringify({ items }, null, 2))

  const withSprite  = Object.values(items).filter(i => i.sprite).length
  const withStats   = Object.values(items).filter(i => i.armor || i.attack || i.defense).length
  const withResist  = Object.values(items).filter(i => i.resist).length
  const withAttribs = Object.values(items).filter(i => i.attributes).length
  const withLvlReq  = Object.values(items).filter(i => i.levelRequired).length

  console.log(`
Done!
  Total items  : ${Object.keys(items).length}
  With sprites : ${withSprite}
  With combat  : ${withStats}
  With resist  : ${withResist}
  With attribs : ${withAttribs}
  With lvl req : ${withLvlReq}
  Failed       : ${failed}
  Output       : items-data.json`)
}

run()
