/**
 * extract-tibia-sprites.mjs
 *
 * Extracts creature outfit sprites from Tibia .dat + .spr files.
 * Produces a PNG sprite sheet per outfit and a manifest JSON.
 *
 * Usage:
 *   node scripts/extract-tibia-sprites.mjs <Tibia.dat> <Tibia.spr> [outputDir]
 *
 * Default output dir: client/public/sprites/outfits
 *
 * Before running:
 *   Extract Tibia.spr from 1501.zip (it is 450 MB).
 *   The .dat file from the same zip is already at C:\Users\bryan\Downloads\Tibia.dat
 *
 * Sprite sheet layout per outfit:
 *   Rows  = animation frames  (anim count)
 *   Cols  = directions        (xdiv count: 0=South 1=West 2=North 3=East)
 *   Each cell = width×height Tibia tiles (each tile = 32×32 px)
 *   If the outfit has 2 layers, only layer 0 (body) is rendered; layer 1
 *   is the colorable mask (grey pixels map to outfit color at runtime).
 *   Both layers are written as separate PNGs so the game can tint them.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const TILE_SIZE = 32;
const ATTR_MARKET = 0x22;
const ATTR_END = 0xFF;

// ─── CRC32 ────────────────────────────────────────────────────────────────────

function makeCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
}
const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG writer (no external deps) ───────────────────────────────────────────

function writePng(rgba, width, height, outputPath) {
  function chunk(type, data) {
    const buf = Buffer.alloc(12 + data.length);
    buf.writeUInt32BE(data.length, 0);
    Buffer.from(type, 'ascii').copy(buf, 4);
    data.copy(buf, 8);
    buf.writeUInt32BE(crc32(buf.subarray(4, 8 + data.length)), 8 + data.length);
    return buf;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  // bytes 10-12 already 0 (compression/filter/interlace)

  // Prepend row-filter byte (None = 0) to each row
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idat = zlib.deflateSync(raw, { level: 6 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const out = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(outputPath, out);
}

// ─── .dat parser ─────────────────────────────────────────────────────────────

/**
 * Skip attribute bytes for one item/outfit.
 * Returns the offset immediately after the 0xFF end marker.
 *
 * Attribute format (Tibia 15.x "DatSpr" extended):
 *   Most attributes are boolean flags with 0 extra bytes.
 *   Exception: 0x22 (Market) has variable-length data.
 */
function skipAttributes(buf, offset) {
  while (true) {
    const attr = buf[offset++];
    if (attr === ATTR_END) return offset;

    if (attr === ATTR_MARKET) {
      // category(2) + tradeAs(2) + showAs(2) + nameLen(2) + name(nameLen) + profession(2) + level(2)
      const nameLen = buf.readUInt16LE(offset + 6);
      offset += 8 + nameLen + 4;
    }
    // All other attributes: 0 extra bytes
  }
}

/**
 * Parse sprite dimensions and sprite ID list at current offset.
 * Returns the parsed data and the next offset.
 */
function parseThing(buf, offset) {
  const width  = buf[offset++];
  const height = buf[offset++];
  if (width > 1 || height > 1) offset++; // exact_size / blend_frames byte
  const layers = buf[offset++];
  const xdiv   = buf[offset++]; // directions for outfits
  const ydiv   = buf[offset++];
  const zdiv   = buf[offset++];
  const anim   = buf[offset++];

  // Enhanced animations: when anim > 1, frame-duration metadata precedes sprite IDs.
  // Format: async(u8) + loopCount(u32) + startPhase(u8) + anim × [minMs(u32) + maxMs(u32)]
  // = 6 + anim×8 bytes — present in Tibia 15.x regardless of otfi flag.
  if (anim > 1) {
    offset += 6 + anim * 8;
  }

  const count = width * height * layers * xdiv * ydiv * zdiv * anim;
  const spriteIds = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    spriteIds[i] = buf.readUInt32LE(offset);
    offset += 4;
  }

  return { width, height, layers, xdiv, ydiv, zdiv, anim, spriteIds, nextOffset: offset };
}

function parseDat(datPath) {
  console.log('Reading .dat …');
  const buf = fs.readFileSync(datPath);
  let offset = 0;

  const sig        = buf.readUInt32LE(offset); offset += 4;
  const maxItemId  = buf.readUInt16LE(offset); offset += 2;
  const maxOutfitId = buf.readUInt16LE(offset); offset += 2;
  const maxEffectId = buf.readUInt16LE(offset); offset += 2;
  const maxMissileId = buf.readUInt16LE(offset); offset += 2;

  console.log(`Sig: 0x${sig.toString(16).padStart(8,'0')}  items: ${maxItemId}  outfits: ${maxOutfitId}  effects: ${maxEffectId}  missiles: ${maxMissileId}`);

  // Skip items (IDs 100 → maxItemId inclusive)
  const itemCount = maxItemId - 99;
  for (let i = 0; i < itemCount; i++) {
    offset = skipAttributes(buf, offset);
    const t = parseThing(buf, offset);
    offset = t.nextOffset;
  }
  console.log(`Items done. Offset now: ${offset}`);

  // Parse outfits
  const outfits = [];
  for (let id = 1; id <= maxOutfitId; id++) {
    offset = skipAttributes(buf, offset);
    const t = parseThing(buf, offset);
    offset = t.nextOffset;
    outfits.push({ id, width: t.width, height: t.height, layers: t.layers, xdiv: t.xdiv, ydiv: t.ydiv, zdiv: t.zdiv, anim: t.anim, spriteIds: t.spriteIds });
  }
  console.log(`Outfits done. Offset now: ${offset} (file size: ${buf.length})`);
  return outfits;
}

// ─── .spr reader ─────────────────────────────────────────────────────────────

function openSpr(sprPath) {
  console.log('Reading .spr directory …');
  const fd = fs.openSync(sprPath, 'r');

  const header = Buffer.alloc(8);
  fs.readSync(fd, header, 0, 8, 0);
  const sprSig = header.readUInt32LE(0);
  const count  = header.readUInt32LE(4);
  console.log(`SPR sig: 0x${sprSig.toString(16).padStart(8,'0')}  sprites: ${count}`);

  const dirBuf = Buffer.alloc(count * 4);
  fs.readSync(fd, dirBuf, 0, count * 4, 8);

  const offsets = new Uint32Array(count);
  for (let i = 0; i < count; i++) offsets[i] = dirBuf.readUInt32LE(i * 4);

  return { fd, count, offsets };
}

/**
 * Decompress one 32×32 Tibia RLE sprite into an RGBA Buffer.
 * Classic format: repeat { transparentCount(2) + coloredCount(2) + RGB*colored }
 */
function decompressSprite(data) {
  const rgba = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4, 0); // default transparent
  let di = 0;
  let pi = 0; // pixel index

  while (pi < TILE_SIZE * TILE_SIZE && di < data.length) {
    const transparent = data.readUInt16LE(di); di += 2;
    const colored     = data.readUInt16LE(di); di += 2;
    pi += transparent; // skip transparent pixels (remain alpha=0)
    for (let c = 0; c < colored; c++) {
      const base = pi * 4;
      rgba[base]     = data[di++]; // R
      rgba[base + 1] = data[di++]; // G
      rgba[base + 2] = data[di++]; // B
      rgba[base + 3] = 255;
      pi++;
    }
  }
  return rgba;
}

function readSprite(spr, id) {
  if (id === 0 || id > spr.count) return null;
  const fileOff = spr.offsets[id - 1]; // 1-indexed
  if (fileOff === 0) return null;

  const sizeBuf = Buffer.alloc(2);
  fs.readSync(spr.fd, sizeBuf, 0, 2, fileOff);
  const dataSize = sizeBuf.readUInt16LE(0);
  if (dataSize === 0) return null;

  const dataBuf = Buffer.alloc(dataSize);
  fs.readSync(spr.fd, dataBuf, 0, dataSize, fileOff + 2);
  return decompressSprite(dataBuf);
}

// ─── Sprite sheet composer ────────────────────────────────────────────────────

/**
 * Compose a sprite sheet for one outfit.
 *
 * Sheet layout:
 *   rows = anim frames
 *   cols = directions (S W N E = xdiv values)
 *   Each cell = width×height tiles (each 32×32)
 *   layer selects which sprite layer to render (0 = body, 1 = mask)
 *
 * Tibia sprite ordering in the ID array:
 *   index = ((frame * zdiv*ydiv*xdiv + z*ydiv*xdiv + y*xdiv + x) * layers + layer) * height * width + ty * width + tx
 */
function composeSheet(outfit, spr, layer) {
  const { width, height, layers, xdiv, ydiv, zdiv, anim, spriteIds } = outfit;
  if (layer >= layers) return null;

  const cellW = width  * TILE_SIZE;
  const cellH = height * TILE_SIZE;
  const sheetW = xdiv * cellW;
  const sheetH = anim * cellH;
  const sheet = Buffer.alloc(sheetW * sheetH * 4, 0);

  for (let frame = 0; frame < anim; frame++) {
    for (let x = 0; x < xdiv; x++) {
      // direction x corresponds to: 0=South 1=West 2=North 3=East
      for (let ty = 0; ty < height; ty++) {
        for (let tx = 0; tx < width; tx++) {
          const idx = ((frame * zdiv * ydiv * xdiv + 0 * ydiv * xdiv + 0 * xdiv + x) * layers + layer) * height * width + ty * width + tx;
          const sprId = spriteIds[idx];
          const spriteRgba = readSprite(spr, sprId);
          if (!spriteRgba) continue;

          const destX = x * cellW + tx * TILE_SIZE;
          const destY = frame * cellH + ty * TILE_SIZE;

          for (let py = 0; py < TILE_SIZE; py++) {
            for (let px = 0; px < TILE_SIZE; px++) {
              const srcOff  = (py * TILE_SIZE + px) * 4;
              const dstOff  = ((destY + py) * sheetW + (destX + px)) * 4;
              spriteRgba.copy(sheet, dstOff, srcOff, srcOff + 4);
            }
          }
        }
      }
    }
  }

  return { rgba: sheet, width: sheetW, height: sheetH };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [,, datPath, sprPath, outDirArg] = process.argv;

  if (!datPath || !sprPath) {
    console.error('Usage: node extract-tibia-sprites.mjs <Tibia.dat> <Tibia.spr> [outputDir]');
    console.error('');
    console.error('Extract Tibia.spr from 1501.zip first (450 MB).');
    process.exit(1);
  }

  const outDir = path.resolve(outDirArg ?? 'client/public/sprites/outfits');
  fs.mkdirSync(outDir, { recursive: true });

  // ── Parse .dat ──
  const outfits = parseDat(path.resolve(datPath));
  console.log(`Parsed ${outfits.length} outfits.`);

  // ── Open .spr ──
  const spr = openSpr(path.resolve(sprPath));

  // ── Render ──
  const manifest = {};
  let rendered = 0;
  let skipped = 0;

  for (const outfit of outfits) {
    const dir = path.join(outDir, String(outfit.id));
    fs.mkdirSync(dir, { recursive: true });

    const entry = {
      id: outfit.id,
      tileWidth:  outfit.width,
      tileHeight: outfit.height,
      layers:     outfit.layers,
      directions: outfit.xdiv,
      frames:     outfit.anim,
      sheetWidth:  outfit.xdiv * outfit.width  * TILE_SIZE,
      sheetHeight: outfit.anim * outfit.height * TILE_SIZE,
      // Directions: index → name
      directionMap: { 0: 'south', 1: 'west', 2: 'north', 3: 'east' },
      files: {},
    };

    let anySprite = false;

    for (let layer = 0; layer < outfit.layers; layer++) {
      const result = composeSheet(outfit, spr, layer);
      if (!result) continue;

      const layerName = layer === 0 ? 'body' : 'mask';
      const pngPath = path.join(dir, `${layerName}.png`);
      writePng(result.rgba, result.width, result.height, pngPath);
      entry.files[layerName] = `sprites/outfits/${outfit.id}/${layerName}.png`;
      anySprite = true;
    }

    if (anySprite) {
      manifest[outfit.id] = entry;
      rendered++;
    } else {
      skipped++;
    }

    if (rendered % 100 === 0) process.stdout.write(`\rRendered ${rendered} / ${outfits.length} outfits…`);
  }

  fs.closeSync(spr.fd);

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${rendered} outfits rendered, ${skipped} skipped (empty sprites).`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
