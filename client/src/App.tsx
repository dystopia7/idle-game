import { useState, useEffect } from 'react'
import { gameBridge } from './lib/gameBridge'
import {
  setPlayer, patchPlayer, patchInventory, pushCombatLog, pushLootLog,
  pushChatMessage, setTarget, setSkills, patchSkill,
} from './lib/gameStore'
import LoginView  from './views/LoginView'
import GameLayout from './views/GameLayout'
import './styles/ui.css'

export default function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('token'),
  )

  // Wire bridge events → store (done once at app root so it's always active)
  useEffect(() => {
    const unsubs = [
      gameBridge.on('player_init', ({ player, offlineGold, skills }) => {
        setPlayer(player, offlineGold)
        setSkills(skills)
      }),
      gameBridge.on('player_update', patch => {
        patchPlayer(patch)
      }),
      gameBridge.on('skill_update', ({ skill, level, points }) => {
        patchSkill(skill, level, points)
      }),
      gameBridge.on('combat_log', line => {
        pushCombatLog(line)
      }),
      gameBridge.on('loot_log', line => {
        pushLootLog(line)
      }),
      gameBridge.on('chat_message', msg => {
        pushChatMessage(msg)
      }),
      gameBridge.on('target_update', t => {
        setTarget(t)
      }),
      gameBridge.on('inventory_update', inventory => {
        patchInventory(inventory)
      }),
    ]
    return () => unsubs.forEach(u => u())
  }, [])

  function handleLogin(t: string) { setToken(t) }

  function handleLogout() {
    localStorage.removeItem('token')
    setToken(null)
  }

  if (!token) return <LoginView onLogin={handleLogin} />
  return <GameLayout token={token} onLogout={handleLogout} />
}
