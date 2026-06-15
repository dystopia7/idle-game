import type { PlayerBase, InventoryItemDTO } from './player'
import type { ItemDTO } from './item'
import type { PlayerSkill, SkillType } from './skills'

export interface OnlinePlayerInfo {
  username: string
  playerClass: string
  level: number
  zone: string
}

export interface ServerToClientEvents {
  init: (data: { player: PlayerBase & { inventory: InventoryItemDTO[] }; offlineGold: number; skills: PlayerSkill[] }) => void
  combat_result: (data: CombatResultPacket) => void
  monster_update: (data: MonsterUpdatePacket) => void
  monster_moved: (data: { id: string; tileX: number; tileY: number }) => void
  monster_attack: (data: { monsterId: string; monsterName: string; damage: number }) => void
  party_update: (data: PartyUpdatePacket) => void
  error: (data: { message: string }) => void
  chat: (data: ChatPacket) => void
  player_update: (data: Partial<PlayerBase>) => void
  inventory_update: (data: InventoryItemDTO[]) => void
  zone_entered: (data: { zone: string }) => void
  zone_players: (data: ZonePlayersPacket) => void
  player_joined: (data: ZonePlayerPacket) => void
  player_left: (data: { id: string }) => void
  player_moved: (data: { id: string; x: number; y: number }) => void
  skill_update: (data: { skill: SkillType; level: number; points: number }) => void
  online_players: (data: OnlinePlayerInfo[]) => void
}

export interface ClientToServerEvents {
  attack_monster: (data: { monsterId: string }) => void
  player_move: (data: { x: number; y: number }) => void
  join_party: (data: { partyId: string }) => void
  leave_party: () => void
  create_party: () => void
  chat: (data: { message: string; channel: 'global' | 'party' }) => void
  equip_item: (data: { inventoryItemId: string }) => void
  unequip_item: (data: { inventoryItemId: string }) => void
  use_item: (data: { inventoryItemId: string }) => void
  travel: (data: { zone: string }) => void
}

export interface CombatResultPacket {
  monsterId: string
  monsterName?: string
  damage: number
  playerDamage: number
  killed: boolean
  expGained?: number
  goldGained?: number
  healGained?: number
  drops?: ItemDTO[]
}

export interface MonsterUpdatePacket {
  id: string
  hp: number
  maxHp: number
  name: string
  level: number
  zone: string
  tileX: number
  tileY: number
}

export interface ZonePlayerPacket {
  id: string
  username: string
  level: number
  hp: number
  maxHp: number
  x: number
  y: number
}

export interface ZonePlayersPacket {
  players: ZonePlayerPacket[]
}

export interface PartyUpdatePacket {
  partyId: string
  members: Array<{ id: string; username: string; hp: number; maxHp: number; level: number }>
}

export interface ChatPacket {
  from: string
  message: string
  channel: 'global' | 'party'
  timestamp: number
}
