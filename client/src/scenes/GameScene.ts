import Phaser from 'phaser'
import { connectSocket, getSocket } from '../network/socket'
import type { MonsterUpdatePacket, CombatResultPacket, ChatPacket, ZonePlayerPacket, ZonePlayersPacket } from '@idle-rpg/shared'
import { gameBridge, getGameToken } from '../lib/gameBridge'
import { setOnlinePlayers } from '../lib/gameStore'

const TILE = 32
const COLS = 20
const ROWS = 13
const MOVE_DURATION = 180
const PLAYER_TICK   = 300
const ATK_COOLDOWN  = 1000

type MoveMode = 'chase' | 'kite'

interface MonsterDisplay {
  sprite: Phaser.GameObjects.Sprite
  hpBar:  Phaser.GameObjects.Graphics
  label:  Phaser.GameObjects.Text
  hp:     number
  maxHp:  number
  name:   string
  level:  number
  tileX:  number
  tileY:  number
}

interface OtherPlayerDisplay {
  sprite: Phaser.GameObjects.Sprite
  label:  Phaser.GameObjects.Text
  tileX:  number
  tileY:  number
}

function monsterTextureKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export class GameScene extends Phaser.Scene {
  private playerSprite!: Phaser.GameObjects.Sprite
  private monsters     = new Map<string, MonsterDisplay>()
  private otherPlayers = new Map<string, OtherPlayerDisplay>()

  // Grid
  private playerTile    = { x: 10, y: 6 }
  private occupiedTiles = new Set<string>()

  // Combat
  private myPlayerId: string | null = null
  private currentTargetId: string | null = null
  private atkTimer = 0
  private playerDead = false
  private hasEquippedWeapon = false

  // Movement mode — controlled by React via bridge
  private moveMode:     MoveMode = 'chase'
  private kiteDistance: number   = 3

  // Current zone (mirrors server state)
  private currentZone = 'town'

  // Bridge unsubscribe handles
  private bridgeUnsubs: Array<() => void> = []

  // Tracks in-flight texture loads so we don't double-request
  private pendingTextures = new Set<string>()

  constructor() { super({ key: 'Game' }) }

  // Returns the loaded texture key for a monster, kicking off a background load
  // if not yet available. Returns 'monster_ph' as placeholder while loading.
  private getMonsterTexture(name: string): string {
    const key = monsterTextureKey(name)
    if (this.textures.exists(key)) return key
    if (!this.pendingTextures.has(key)) {
      this.pendingTextures.add(key)
      this.load.image(key, `/assets/monsters/${key}.gif`)
      this.load.once(`filecomplete-image-${key}`, () => {
        for (const display of this.monsters.values()) {
          if (display.name === name) display.sprite.setTexture(key).setScale(1)
        }
      })
      this.load.start()
    }
    return 'monster_ph'
  }

  create() {
    // Placeholder for monster sprites not yet loaded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pg = this.make.graphics({ add: false } as any)
    pg.fillStyle(0x664422).fillRect(0, 0, 32, 32)
    pg.fillStyle(0xcc8844).fillCircle(16, 12, 8)
    pg.generateTexture('monster_ph', 32, 32)
    pg.destroy()

    // Tile beyond the active grid to fill any letterbox gaps
    const PAD = 10
    for (let x = -PAD * TILE; x < (COLS + PAD) * TILE; x += TILE)
      for (let y = -PAD * TILE; y < (ROWS + PAD) * TILE; y += TILE)
        this.add.image(x, y, 'ground').setOrigin(0)

    this.fitCamera()
    this.scale.on('resize', this.fitCamera, this)

    // Player sprite
    const sp = this.tileToPixel(this.playerTile.x, this.playerTile.y)
    this.playerSprite = this.add.sprite(sp.x, sp.y, 'player').setDepth(5).setScale(0.9)
    this.occupiedTiles.add(this.tileKey(this.playerTile.x, this.playerTile.y))

    // React UI bridge
    this.bridgeUnsubs.push(
      gameBridge.on('set_move_mode',  ({ mode })  => { this.moveMode = mode }),
      gameBridge.on('set_kite_range', ({ range }) => { this.kiteDistance = range }),
      gameBridge.on('travel_request', ({ zone })  => {
        getSocket().emit('travel', { zone })
      }),
    )

    // Connect socket
    const token = getGameToken()
    if (token) connectSocket(token)

    // Only player tick runs locally — monster movement is server-driven
    this.time.addEvent({ delay: PLAYER_TICK, loop: true, callback: this.tickPlayer, callbackScope: this })

    this.setupSocket()
  }

  private fitCamera() {
    const { width, height } = this.scale
    const worldW = COLS * TILE
    const worldH = ROWS * TILE
    const zoom = Math.min(width / worldW, height / worldH)
    this.cameras.main.setZoom(zoom)
    this.cameras.main.centerOn(worldW / 2, worldH / 2)
  }

  shutdown() {
    this.scale.off('resize', this.fitCamera, this)
    this.bridgeUnsubs.forEach(u => u())
    this.bridgeUnsubs = []
  }

  // ─── Auto-targeting ────────────────────────────────────────────────────────

  private selectBestTarget(): string | null {
    let best: string | null = null
    let bestScore = Infinity

    for (const [id, mon] of this.monsters) {
      if (mon.hp <= 0) continue
      const dist  = this.chebyshev(this.playerTile.x, this.playerTile.y, mon.tileX, mon.tileY)
      const hpPct = mon.hp / mon.maxHp
      const score = dist * 1000 + hpPct * 100
      if (score < bestScore) { bestScore = score; best = id }
    }
    return best
  }

  // ─── Grid helpers ──────────────────────────────────────────────────────────

  private tileKey(x: number, y: number) { return `${x},${y}` }

  private tileToPixel(tx: number, ty: number) {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }
  }

  private chebyshev(ax: number, ay: number, bx: number, by: number) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by))
  }

  private tryMove(
    sprite: Phaser.GameObjects.Sprite,
    tile: { x: number; y: number },
    dx: number, dy: number,
  ): boolean {
    const candidates: [number, number][] = []
    if (dx !== 0 && dy !== 0) candidates.push([dx, dy], [dx, 0], [0, dy])
    else if (dx !== 0)         candidates.push([dx, 0], [0, 1], [0, -1])
    else if (dy !== 0)         candidates.push([0, dy], [1, 0], [-1, 0])
    else return false

    for (const [ax, ay] of candidates) {
      const nx = tile.x + ax
      const ny = tile.y + ay
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue
      const key = this.tileKey(nx, ny)
      if (this.occupiedTiles.has(key)) continue

      this.occupiedTiles.delete(this.tileKey(tile.x, tile.y))
      tile.x = nx; tile.y = ny
      this.occupiedTiles.add(key)

      const px = this.tileToPixel(nx, ny)
      this.tweens.add({ targets: sprite, x: px.x, y: px.y, duration: MOVE_DURATION, ease: 'Linear' })
      return true
    }
    return false
  }

  private tryMoveAway(
    sprite: Phaser.GameObjects.Sprite,
    tile: { x: number; y: number },
    fromX: number, fromY: number,
  ): boolean {
    const CORNER_ZONE   = 4
    const CORNER_WEIGHT = 0.3

    const dirs: [number, number][] = [
      [-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1],
    ]

    const options = dirs
      .map(([dx, dy]) => ({ nx: tile.x + dx, ny: tile.y + dy }))
      .filter(({ nx, ny }) => nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS)
      .filter(({ nx, ny }) => !this.occupiedTiles.has(this.tileKey(nx, ny)))
      .map(o => {
        const dist  = this.chebyshev(o.nx, o.ny, fromX, fromY)
        const hDist = Math.min(o.nx, COLS - 1 - o.nx)
        const vDist = Math.min(o.ny, ROWS - 1 - o.ny)
        const cornerPenalty = (hDist < CORNER_ZONE && vDist < CORNER_ZONE)
          ? (CORNER_ZONE - hDist + CORNER_ZONE - vDist) * CORNER_WEIGHT
          : 0
        return { ...o, score: dist - cornerPenalty }
      })
      .sort((a, b) => b.score - a.score)

    if (options.length === 0) return false

    const { nx, ny } = options[0]
    this.occupiedTiles.delete(this.tileKey(tile.x, tile.y))
    tile.x = nx; tile.y = ny
    this.occupiedTiles.add(this.tileKey(nx, ny))
    const px = this.tileToPixel(nx, ny)
    this.tweens.add({ targets: sprite, x: px.x, y: px.y, duration: MOVE_DURATION, ease: 'Linear' })
    return true
  }

  // ─── Player movement tick ──────────────────────────────────────────────────

  private tickPlayer() {
    if (this.playerDead) return
    this.currentTargetId = this.selectBestTarget()
    gameBridge.emit('target_update', this.currentTargetId
      ? (() => { const m = this.monsters.get(this.currentTargetId!)!; return { name: m.name, level: m.level } })()
      : null,
    )

    if (!this.currentTargetId) return

    const mon  = this.monsters.get(this.currentTargetId)!
    const px   = this.playerTile.x, py = this.playerTile.y
    const mx   = mon.tileX,         my = mon.tileY
    const dist = this.chebyshev(px, py, mx, my)

    // Unarmed players must be adjacent to attack — kite distance is irrelevant without a weapon
    const effectiveKite = this.moveMode === 'kite' && this.hasEquippedWeapon

    let moved = false
    if (!effectiveKite) {
      if (dist <= 1) return
      moved = this.tryMove(this.playerSprite, this.playerTile, Math.sign(mx - px), Math.sign(my - py))
    } else {
      if (dist >= this.kiteDistance) return
      let wx = 0, wy = 0, totalW = 0
      for (const m of this.monsters.values()) {
        if (m.hp <= 0) continue
        const d = this.chebyshev(px, py, m.tileX, m.tileY)
        if (d > this.kiteDistance + 4) continue
        const w = 1 / (d + 0.5)
        wx += m.tileX * w; wy += m.tileY * w; totalW += w
      }
      if (totalW > 0)
        moved = this.tryMoveAway(this.playerSprite, this.playerTile, wx / totalW, wy / totalW)
    }

    if (moved) {
      getSocket().emit('player_move', { x: this.playerTile.x, y: this.playerTile.y })
    }
  }

  // ─── Zone management ───────────────────────────────────────────────────────

  private clearZone() {
    this.clearMonsters()
    this.clearOtherPlayers()
  }

  private clearMonsters() {
    for (const mon of this.monsters.values()) {
      mon.sprite.destroy()
      mon.hpBar.destroy()
      mon.label.destroy()
      this.occupiedTiles.delete(this.tileKey(mon.tileX, mon.tileY))
    }
    this.monsters.clear()
    this.currentTargetId = null
    this.atkTimer = 0
    gameBridge.emit('target_update', null)
  }

  private clearOtherPlayers() {
    for (const op of this.otherPlayers.values()) {
      this.occupiedTiles.delete(this.tileKey(op.tileX, op.tileY))
      op.sprite.destroy()
      op.label.destroy()
    }
    this.otherPlayers.clear()
  }

  // ─── Monster management ────────────────────────────────────────────────────

  private upsertMonster(data: MonsterUpdatePacket) {
    if (!this.monsters.has(data.id)) {
      // Use server-assigned tile position — no random placement
      const tx = data.tileX
      const ty = data.tileY

      this.occupiedTiles.add(this.tileKey(tx, ty))
      const px = this.tileToPixel(tx, ty)
      const spriteKey = this.getMonsterTexture(data.name)

      const sprite = this.add.sprite(px.x, px.y, spriteKey)
        .setDepth(4).setScale(0.9).setInteractive({ useHandCursor: true })
      const hpBar = this.add.graphics().setDepth(6)
      const label = this.add.text(px.x, px.y - 26, `${data.name} Lv${data.level}`, {
        fontSize: '11px', color: '#c6d4e4', fontFamily: 'system-ui, sans-serif',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(7)

      sprite.on('pointerover', () => sprite.setTint(0xffff88))
      sprite.on('pointerout',  () => {
        if (this.currentTargetId === data.id) sprite.setTint(0xff6666)
        else sprite.clearTint()
      })

      this.monsters.set(data.id, {
        sprite, hpBar, label,
        hp: data.hp, maxHp: data.maxHp,
        name: data.name, level: data.level,
        tileX: tx, tileY: ty,
      })
    } else {
      // On HP update or respawn, snap position if it changed (e.g. respawn to spawn tile)
      const mon = this.monsters.get(data.id)!
      if (mon.tileX !== data.tileX || mon.tileY !== data.tileY) {
        this.occupiedTiles.delete(this.tileKey(mon.tileX, mon.tileY))
        mon.tileX = data.tileX
        mon.tileY = data.tileY
        this.occupiedTiles.add(this.tileKey(data.tileX, data.tileY))
        const px = this.tileToPixel(data.tileX, data.tileY)
        this.tweens.add({ targets: mon.sprite, x: px.x, y: px.y, duration: MOVE_DURATION, ease: 'Linear' })
      }
    }

    const mon = this.monsters.get(data.id)!
    mon.hp = data.hp; mon.maxHp = data.maxHp

    if (mon.hp <= 0) {
      this.occupiedTiles.delete(this.tileKey(mon.tileX, mon.tileY))
      mon.sprite.destroy()
      mon.hpBar.destroy()
      mon.label.destroy()
      this.monsters.delete(data.id)
      if (this.currentTargetId === data.id) {
        this.currentTargetId = null
        gameBridge.emit('target_update', null)
      }
      return
    }
  }

  // ─── Other-player management ───────────────────────────────────────────────

  private addOtherPlayer(data: ZonePlayerPacket) {
    if (this.otherPlayers.has(data.id)) return
    const px = this.tileToPixel(data.x, data.y)
    const sprite = this.add.sprite(px.x, px.y, 'player')
      .setDepth(5).setScale(0.9).setTint(0x4488ff)
    const label = this.add.text(px.x, px.y - 26, `${data.username} Lv${data.level}`, {
      fontSize: '11px', color: '#88bbff', fontFamily: 'system-ui, sans-serif',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(7)

    this.occupiedTiles.add(this.tileKey(data.x, data.y))
    this.otherPlayers.set(data.id, { sprite, label, tileX: data.x, tileY: data.y })
  }

  private removeOtherPlayer(id: string) {
    const op = this.otherPlayers.get(id)
    if (!op) return
    this.occupiedTiles.delete(this.tileKey(op.tileX, op.tileY))
    op.sprite.destroy()
    op.label.destroy()
    this.otherPlayers.delete(id)
  }

  private moveOtherPlayer(id: string, x: number, y: number) {
    const op = this.otherPlayers.get(id)
    if (!op) return
    this.occupiedTiles.delete(this.tileKey(op.tileX, op.tileY))
    op.tileX = x; op.tileY = y
    this.occupiedTiles.add(this.tileKey(x, y))
    const px = this.tileToPixel(x, y)
    this.tweens.add({ targets: op.sprite, x: px.x, y: px.y, duration: MOVE_DURATION, ease: 'Linear' })
    op.label.setPosition(px.x, px.y - 26)
  }

  // ─── Socket ────────────────────────────────────────────────────────────────

  private setupSocket() {
    const socket = getSocket()

    socket.on('init', ({ player, offlineGold }) => {
      this.myPlayerId = player.id
      this.hasEquippedWeapon = player.inventory.some(i => i.equipped && i.item.type === 'WEAPON')
      const savedX = player.posX ?? Math.floor(COLS / 2)
      const savedY = player.posY ?? Math.floor(ROWS / 2)
      this.occupiedTiles.delete(this.tileKey(this.playerTile.x, this.playerTile.y))
      this.playerTile.x = savedX
      this.playerTile.y = savedY
      this.occupiedTiles.add(this.tileKey(savedX, savedY))
      const sp = this.tileToPixel(savedX, savedY)
      this.playerSprite.setPosition(sp.x, sp.y)
      gameBridge.emit('player_init', { player, offlineGold })
    })

    socket.on('player_update', patch => {
      gameBridge.emit('player_update', patch)
    })

    socket.on('inventory_update', inventory => {
      this.hasEquippedWeapon = inventory.some(i => i.equipped && i.item.type === 'WEAPON')
      gameBridge.emit('inventory_update', inventory)
    })

    socket.on('zone_entered', ({ zone }: { zone: string }) => {
      this.currentZone = zone
      this.clearZone()
      if (zone === 'town') {
        this.playerDead = false
        this.playerSprite.setTexture('player')
        this.occupiedTiles.delete(this.tileKey(this.playerTile.x, this.playerTile.y))
        this.playerTile.x = Math.floor(COLS / 2)
        this.playerTile.y = Math.floor(ROWS / 2)
        this.occupiedTiles.add(this.tileKey(this.playerTile.x, this.playerTile.y))
        const sp = this.tileToPixel(this.playerTile.x, this.playerTile.y)
        this.playerSprite.setPosition(sp.x, sp.y)
      }
      gameBridge.emit('zone_change', { zone })
    })

    socket.on('monster_update', (data: MonsterUpdatePacket) => this.upsertMonster(data))

    socket.on('monster_moved', ({ id, tileX, tileY }: { id: string; tileX: number; tileY: number }) => {
      const mon = this.monsters.get(id)
      if (!mon || mon.hp <= 0) return
      this.occupiedTiles.delete(this.tileKey(mon.tileX, mon.tileY))
      mon.tileX = tileX; mon.tileY = tileY
      this.occupiedTiles.add(this.tileKey(tileX, tileY))
      const px = this.tileToPixel(tileX, tileY)
      this.tweens.add({ targets: mon.sprite, x: px.x, y: px.y, duration: MOVE_DURATION, ease: 'Linear' })
    })

    socket.on('zone_players', ({ players }: ZonePlayersPacket) => {
      for (const p of players) this.addOtherPlayer(p)
    })

    socket.on('player_joined', (data: ZonePlayerPacket) => {
      this.addOtherPlayer(data)
    })

    socket.on('player_left', ({ id }: { id: string }) => {
      this.removeOtherPlayer(id)
    })

    socket.on('player_moved', ({ id, x, y }: { id: string; x: number; y: number }) => {
      this.moveOtherPlayer(id, x, y)
    })

    socket.on('player_died', ({ id }: { id: string }) => {
      if (id === this.myPlayerId) {
        this.playerDead = true
        this.playerSprite.setTexture('player_dead')
        this.currentTargetId = null
        this.atkTimer = 0
        gameBridge.emit('target_update', null)
        gameBridge.emit('combat_log', `${ts()} You have died.`)
      } else {
        const op = this.otherPlayers.get(id)
        if (op) op.sprite.setTexture('player_dead')
      }
    })

    socket.on('player_respawn', ({ id, hp }: { id: string; hp: number }) => {
      if (id === this.myPlayerId) {
        this.playerDead = false
        this.playerSprite.setTexture('player')
        gameBridge.emit('player_update', { hp })
        gameBridge.emit('combat_log', `${ts()} You have respawned.`)
      } else {
        const op = this.otherPlayers.get(id)
        if (op) op.sprite.setTexture('player')
      }
    })

    socket.on('combat_result', (result: CombatResultPacket) => {
      const name = result.monsterName ?? 'Monster'
      const t = ts()
      gameBridge.emit('combat_log', `${t} You deal ${result.damage} damage to ${name}.`)
      if (result.healGained) {
        gameBridge.emit('combat_log', `${t} You heal yourself for ${result.healGained} with Nature's Mend.`)
      }
      if (result.killed) {
        const lootParts: string[] = []
        if ((result.goldGained ?? 0) > 0) lootParts.push(`${result.goldGained} gp`)
        if (result.drops?.length) lootParts.push(result.drops.map(d => d.name).join(', '))
        if (lootParts.length > 0) {
          gameBridge.emit('loot_log', `${t} Loot: You looted ${lootParts.join(' and ')} from ${name}.`)
        }
      }
    })

    socket.on('monster_attack', ({ monsterName, damage }: { monsterId: string; monsterName: string; damage: number }) => {
      gameBridge.emit('combat_log', `${ts()} ${monsterName} hits you for ${damage}.`)
    })

    socket.on('chat', (p: ChatPacket) => {
      gameBridge.emit('chat_message', { channel: p.channel, from: p.from, message: p.message })
    })

    socket.on('skill_update', data => {
      gameBridge.emit('skill_update', data)
    })

    socket.on('error', ({ message }: { message: string }) => {
      gameBridge.emit('game_error', message)
      gameBridge.emit('combat_log', `${ts()} ! ${message}`)
    })

    socket.on('online_players', (players) => {
      setOnlinePlayers(players)
    })

    socket.on('connect_error', () => {
      gameBridge.emit('game_error', 'Connection lost — refresh to reconnect.')
    })
  }

  // ─── Update loop ───────────────────────────────────────────────────────────

  update(_t: number, delta: number) {
    for (const [id, mon] of this.monsters) {
      const { x, y } = mon.sprite
      const pct = Math.max(0, mon.hp / mon.maxHp)

      mon.hpBar.clear()
      mon.hpBar.fillStyle(0x0a1528).fillRect(x - 22, y + 22, 44, 6)
      const c = pct > 0.5 ? 0x22c55e : pct > 0.25 ? 0xfbbf24 : 0xef4444
      mon.hpBar.fillStyle(c).fillRect(x - 22, y + 22, Math.round(44 * pct), 6)
      mon.label.setPosition(x, y - 26)

      if (id === this.currentTargetId) mon.sprite.setTint(0xff6666)
    }

    if (this.playerDead) {
      this.atkTimer = 0
    } else {
      // Timer always charges — no gap between kills
      this.atkTimer = Math.min(this.atkTimer + delta, ATK_COOLDOWN)

      if (this.currentTargetId && this.atkTimer >= ATK_COOLDOWN) {
        const canAttack = this.hasEquippedWeapon || (() => {
          const mon = this.monsters.get(this.currentTargetId!)
          return mon ? this.chebyshev(this.playerTile.x, this.playerTile.y, mon.tileX, mon.tileY) <= 1 : false
        })()
        if (canAttack) {
          this.atkTimer = 0
          getSocket().emit('attack_monster', { monsterId: this.currentTargetId })
        }
      }
    }
  }
}

function ts(): string {
  const now = new Date()
  return `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}]`
}
