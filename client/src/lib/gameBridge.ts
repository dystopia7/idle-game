import type { PlayerBase, InventoryItemDTO, PlayerSkill, SkillType } from '@idle-rpg/shared'
export type { InventoryItemDTO }

export type FullPlayer = PlayerBase & { inventory: InventoryItemDTO[] }

export type BridgeEvents = {
  // Phaser → React
  player_init:   { player: FullPlayer; offlineGold: number; skills: PlayerSkill[] }
  player_update: Partial<FullPlayer>
  skill_update:  { skill: SkillType; level: number; points: number }
  combat_log:    string
  loot_log:      string
  chat_message:  { channel: string; from: string; message: string }
  target_update: { name: string; level: number } | null
  game_error:    string
  zone_change:   { zone: string }
  inventory_update: InventoryItemDTO[]
  // React → Phaser
  set_move_mode:  { mode: 'chase' | 'kite' }
  set_kite_range: { range: number }
  chat_send:      { message: string; channel: string }
  travel_request: { zone: string }
}

type Listener<T> = (data: T) => void

class GameBridge {
  private listeners = new Map<string, Set<Listener<unknown>>>()

  emit<K extends keyof BridgeEvents>(event: K, data: BridgeEvents[K]): void {
    this.listeners.get(event)?.forEach(fn => fn(data as unknown))
  }

  on<K extends keyof BridgeEvents>(event: K, fn: Listener<BridgeEvents[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn as Listener<unknown>)
    return () => this.listeners.get(event)?.delete(fn as Listener<unknown>)
  }
}

export const gameBridge = new GameBridge()

// Token is stored here so GameScene can read it without prop-drilling
let _token: string | null = null
export const setGameToken = (t: string) => { _token = t }
export const getGameToken = () => _token
