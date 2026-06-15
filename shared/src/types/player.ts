import type { ItemDTO } from './item'
import type { PlayerClass } from '../constants/game'

export interface PlayerBase {
  id: string
  username: string
  playerClass: PlayerClass
  level: number
  experience: number
  gold: number
  hp: number
  maxHp: number
  mana: number
  maxMana: number
  attack: number
  defense: number
  speed: number
  posX: number
  posY: number
  lastSeen: Date | string
}

export interface InventoryItemDTO {
  id: string
  itemId: string
  quantity: number
  equipped: boolean
  item: ItemDTO
}
