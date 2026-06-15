import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'Boot' }) }

  preload() {
    // Procedural placeholder sprites — swap for real pixel art assets later
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = this.make.graphics({ add: false } as any)

    // Player: green humanoid silhouette
    g.fillStyle(0x22cc44).fillRect(8, 0, 16, 14)   // head
    g.fillStyle(0x1a9933).fillRect(4, 14, 24, 14)  // body
    g.fillStyle(0x22cc44).fillRect(0, 28, 10, 12)  // legs
    g.fillRect(22, 28, 10, 12)
    g.generateTexture('player', 32, 40)

    // Ground tile — warm dark stone with mortar lines
    g.clear()
    g.fillStyle(0x100c08).fillRect(0, 0, 32, 32)   // mortar base
    g.fillStyle(0x221b12).fillRect(1,  1,  14, 14)  // upper-left stone
    g.fillStyle(0x1d1610).fillRect(17, 1,  14, 14)  // upper-right stone
    g.fillStyle(0x201912).fillRect(1,  17, 14, 14)  // lower-left stone
    g.fillStyle(0x1c1610).fillRect(17, 17, 14, 14)  // lower-right stone
    // Subtle grain
    g.fillStyle(0x2b2015).fillRect(4, 5, 2, 1).fillRect(22, 8, 3, 1).fillRect(10, 22, 2, 1)
    g.fillStyle(0x0e0b07).fillRect(8, 10, 1, 2).fillRect(26, 20, 1, 2)
    g.generateTexture('ground', 32, 32)

    // Player dead: tombstone
    g.clear()
    g.fillStyle(0x8a8a9a)
    g.fillRect(9, 10, 14, 22)   // pillar
    g.fillRect(7, 16, 18, 16)   // wider middle
    g.fillRect(5, 30, 22, 4)    // base slab
    g.fillRect(11, 4, 10, 10)   // arch top
    g.fillRect(9, 8, 14, 6)     // arch base
    g.fillStyle(0x55556a)
    g.fillRect(15, 6, 2, 16)    // cross vertical
    g.fillRect(11, 11, 10, 2)   // cross horizontal
    g.generateTexture('player_dead', 32, 40)

    g.destroy()
  }

  create() {
    // React handles auth routing — Phaser only renders the game world
    this.scene.start('Game')
  }
}
