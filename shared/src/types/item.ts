import type { SkillType } from './skills'
import type { PlayerClass } from '../constants/game'

export type ItemType = 'WEAPON' | 'ARMOR' | 'HELMET' | 'LEGS' | 'BOOTS' | 'ACCESSORY' | 'CONSUMABLE' | 'MATERIAL'
export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export interface ItemDTO {
  id: string
  name: string
  description: string
  type: ItemType
  rarity: Rarity
  value: number
  hpBonus: number
  manaBonus: number
  manaCost: number
  attackBonus: number
  defenseBonus: number
  speedBonus: number
  weaponSkill?: SkillType | null
  clubSkillBonus: number
  axeSkillBonus: number
  swordSkillBonus: number
  distanceSkillBonus: number
  shieldingSkillBonus: number
  magicSkillBonus: number
  requiredLevel: number
  requiredClass?: PlayerClass | null
  range: number
}
