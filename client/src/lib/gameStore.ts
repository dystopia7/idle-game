import { useSyncExternalStore } from 'react'
import type { FullPlayer } from './gameBridge'
import type { PlayerSkill, SkillType, InventoryItemDTO } from '@idle-rpg/shared'
import { ALL_SKILLS, SKILL_A, SKILL_B, SKILL_COMBAT_START, SKILL_MAGIC_START } from '@idle-rpg/shared'

// ── Player state ────────────────────────────────────────────────────────────

interface PlayerStore {
  player: FullPlayer | null
  offlineGold: number
}

let playerStore: PlayerStore = { player: null, offlineGold: 0 }
const playerListeners = new Set<() => void>()

export function setPlayer(player: FullPlayer, offlineGold = 0) {
  playerStore = { player, offlineGold }
  playerListeners.forEach(l => l())
}

export function patchPlayer(patch: Partial<FullPlayer>) {
  if (!playerStore.player) return
  playerStore = { ...playerStore, player: { ...playerStore.player, ...patch } }
  playerListeners.forEach(l => l())
}

export function patchInventory(inventory: InventoryItemDTO[]) {
  if (!playerStore.player) return
  playerStore = { ...playerStore, player: { ...playerStore.player, inventory } }
  playerListeners.forEach(l => l())
}

export function usePlayerStore() {
  return useSyncExternalStore(
    cb => { playerListeners.add(cb); return () => playerListeners.delete(cb) },
    () => playerStore,
  )
}

// ── Target state ─────────────────────────────────────────────────────────────

let targetStore: { name: string; level: number } | null = null
const targetListeners = new Set<() => void>()

export function setTarget(t: { name: string; level: number } | null) {
  targetStore = t
  targetListeners.forEach(l => l())
}

export function useTargetStore() {
  return useSyncExternalStore(
    cb => { targetListeners.add(cb); return () => targetListeners.delete(cb) },
    () => targetStore,
  )
}

// ── Combat log ───────────────────────────────────────────────────────────────

let combatLog: string[] = []
const combatListeners = new Set<() => void>()

export function pushCombatLog(line: string) {
  combatLog = [...combatLog.slice(-49), line]
  combatListeners.forEach(l => l())
}

export function useCombatLog() {
  return useSyncExternalStore(
    cb => { combatListeners.add(cb); return () => combatListeners.delete(cb) },
    () => combatLog,
  )
}

// ── Loot log ─────────────────────────────────────────────────────────────────

let lootLog: string[] = []
const lootListeners = new Set<() => void>()

export function pushLootLog(line: string) {
  lootLog = [...lootLog.slice(-49), line]
  lootListeners.forEach(l => l())
}

export function useLootLog() {
  return useSyncExternalStore(
    cb => { lootListeners.add(cb); return () => lootListeners.delete(cb) },
    () => lootLog,
  )
}

// ── Chat messages ─────────────────────────────────────────────────────────────

export interface ChatMsg { channel: string; from: string; message: string }
let chatMessages: ChatMsg[] = []
const chatListeners = new Set<() => void>()

export function pushChatMessage(msg: ChatMsg) {
  chatMessages = [...chatMessages.slice(-99), msg]
  chatListeners.forEach(l => l())
}

export function useChatMessages() {
  return useSyncExternalStore(
    cb => { chatListeners.add(cb); return () => chatListeners.delete(cb) },
    () => chatMessages,
  )
}

// ── Active window ────────────────────────────────────────────────────────────

let activeWindow: string | null = null
const windowListeners = new Set<() => void>()

export function openWindow(name: string | null) {
  activeWindow = name
  windowListeners.forEach(l => l())
}

export function useActiveWindow() {
  return useSyncExternalStore(
    cb => { windowListeners.add(cb); return () => windowListeners.delete(cb) },
    () => activeWindow,
  )
}

// ── Zone ──────────────────────────────────────────────────────────────────────

let zoneStore = localStorage.getItem('lastZone') ?? 'town'
const zoneListeners = new Set<() => void>()

export function setZone(zone: string) {
  zoneStore = zone
  localStorage.setItem('lastZone', zone)
  zoneListeners.forEach(l => l())
}

export function useZoneStore() {
  return useSyncExternalStore(
    cb => { zoneListeners.add(cb); return () => zoneListeners.delete(cb) },
    () => zoneStore,
  )
}

// ── Move mode ─────────────────────────────────────────────────────────────────

interface ModeStore { mode: 'chase' | 'kite'; range: number; xpTrackerVisible: boolean }
let modeStore: ModeStore = { mode: 'chase', range: 3, xpTrackerVisible: false }
const modeListeners = new Set<() => void>()

export function setModeStore(patch: Partial<ModeStore>) {
  modeStore = { ...modeStore, ...patch }
  modeListeners.forEach(l => l())
}

export function useModeStore() {
  return useSyncExternalStore(
    cb => { modeListeners.add(cb); return () => modeListeners.delete(cb) },
    () => modeStore,
  )
}

// ── Skills ────────────────────────────────────────────────────────────────────

function defaultSkills(): PlayerSkill[] {
  return ALL_SKILLS.map(skill => ({
    skill,
    level:  skill === 'MAGIC' ? SKILL_MAGIC_START : SKILL_COMBAT_START,
    points: 0,
  }))
}

let skillsStore: PlayerSkill[] = defaultSkills()
const skillsListeners = new Set<() => void>()

export function setSkills(skills: PlayerSkill[]) {
  skillsStore = skills.length > 0 ? skills : defaultSkills()
  skillsListeners.forEach(l => l())
}

export function patchSkill(skill: SkillType, level: number, points: number) {
  skillsStore = skillsStore.map(s => s.skill === skill ? { skill, level, points } : s)
  skillsListeners.forEach(l => l())
}

export function useSkillsStore() {
  return useSyncExternalStore(
    cb => { skillsListeners.add(cb); return () => skillsListeners.delete(cb) },
    () => skillsStore,
  )
}

// Points required to advance from the given level — mirrors server formula
export function pointsToNextLevel(skill: SkillType, level: number): number {
  const c = skill === 'MAGIC' ? SKILL_MAGIC_START : SKILL_COMBAT_START
  return Math.round(SKILL_A * Math.pow(SKILL_B, level - c))
}

// ── Online players ────────────────────────────────────────────────────────────

export interface OnlinePlayerEntry { username: string; playerClass: string; level: number; zone: string }

let onlinePlayersStore: OnlinePlayerEntry[] = []
const onlinePlayersListeners = new Set<() => void>()

export function setOnlinePlayers(players: OnlinePlayerEntry[]) {
  onlinePlayersStore = players
  onlinePlayersListeners.forEach(l => l())
}

export function useOnlinePlayersStore() {
  return useSyncExternalStore(
    cb => { onlinePlayersListeners.add(cb); return () => onlinePlayersListeners.delete(cb) },
    () => onlinePlayersStore,
  )
}
