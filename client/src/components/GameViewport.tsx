import { useState, useEffect } from 'react'
import GameCanvas from './GameCanvas'
import GameWindow from './GameWindow'
import TravelWindow from './TravelWindow'
import TownView from './TownView'
import SkillsWindow from './SkillsWindow'
import OnlinePlayersWindow from './OnlinePlayersWindow'
import { useModeStore, usePlayerStore, useActiveWindow, useZoneStore, setZone } from '../lib/gameStore'
import { gameBridge } from '../lib/gameBridge'

interface Props { token: string }

const WINDOW_TITLES: Record<string, string> = {
  hunting:    'Hunting Grounds',
  quests:     'Quests',
  daily:      'Daily Tasks',
  potions:    'Potions',
  backpack:   'Backpack',
  spells:     'Spells',
  bosses:     'Boss Encounters',
  stats:      'Character Stats',
  party:      'Party',
  cyclopedia: 'Cyclopedia',
  imbuements: 'Imbuements',
  fusion:     'Fusion',
  blessings:  'Blessings',
  settings:   'Settings',
  depot:      'Depot',
  bank:       'Bank',
  mailbox:    'Mailbox',
  market:     'Market',
  vendors:    'Vendors',
  trainer:    'Trainer',
}

export default function GameViewport({ token }: Props) {
  const { xpTrackerVisible } = useModeStore()
  const { player }           = usePlayerStore()
  const activeWindow         = useActiveWindow()
  const currentZone          = useZoneStore()

  const [sessionStart]            = useState(() => Date.now())
  const [sessionXp, setSessionXp] = useState(0)
  const [, setTick]               = useState(0)

  useEffect(() => {
    const unsubLog  = gameBridge.on('combat_log', (line: string) => {
      const m = line.match(/\+(\d+) xp/)
      if (m) setSessionXp(prev => prev + parseInt(m[1], 10))
    })
    const unsubZone = gameBridge.on('zone_change', ({ zone }) => setZone(zone))
    const interval  = setInterval(() => setTick(t => t + 1), 1000)
    return () => { unsubLog(); unsubZone(); clearInterval(interval) }
  }, [])

  const elapsed     = Math.floor((Date.now() - sessionStart) / 1000)
  const maxXp       = player ? 50 * (player.level * player.level - 5 * player.level + 8) : 0
  const xpRemaining = player ? Math.max(0, maxXp - player.experience) : 0
  const xpPerHr     = elapsed > 5 ? Math.round((sessionXp / elapsed) * 3600) : 0
  const secToLevel  = xpPerHr > 0 ? Math.floor(xpRemaining / (xpPerHr / 3600)) : 0
  const levelPct    = player && maxXp > 0 ? Math.round((player.experience / maxXp) * 100) : 0

  const zoneLabel = currentZone === 'town' ? 'Town'
    : currentZone.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  function fmtTime(s: number) {
    if (s <= 0) return '—'
    if (s < 60)   return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  }

  return (
    <div className="game-viewport">
      <div className="zone-bar">◆ {zoneLabel.toUpperCase()} ◆</div>

      <div className="game-canvas-wrap">
        <GameCanvas token={token} />

        {/* Town overlay — covers the canvas when in town */}
        {currentZone === 'town' && <TownView />}
      </div>

      {/* XP tracker overlay */}
      {xpTrackerVisible && currentZone !== 'town' && (
        <div className="floating-panels">
          <div className="float-panel panel-xp">
            <div className="float-panel-header">XP TRACKER</div>
            <div className="float-panel-body">
              <div className="xp-row"><span className="xp-label">Time elapsed</span><span className="xp-value">{fmtTime(elapsed)}</span></div>
              <div className="xp-row"><span className="xp-label">XP gained</span><span className="xp-value">{sessionXp.toLocaleString()}</span></div>
              <div className="xp-row"><span className="xp-label">XP / hr</span><span className="xp-value">{xpPerHr.toLocaleString()}</span></div>
              <div className="xp-row"><span className="xp-label">XP remaining</span><span className="xp-value">{xpRemaining.toLocaleString()}</span></div>
              <div className="xp-row"><span className="xp-label">Time to level</span><span className="xp-value">{fmtTime(secToLevel)}</span></div>
              <div style={{ marginTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>
                  <span>Level progress</span><span>{levelPct}%</span>
                </div>
                <div className="stat-bar-track xp" style={{ height: 6 }}>
                  <div className="stat-bar-fill xp" style={{ width: `${levelPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Nav window overlays */}
      {activeWindow === 'travel' && (
        <GameWindow title="Travel" size="lg">
          <TravelWindow />
        </GameWindow>
      )}

      {activeWindow === 'skills' && (
        <GameWindow title="Skills">
          <SkillsWindow />
        </GameWindow>
      )}

      {activeWindow === 'online' && (
        <GameWindow title="Online Players">
          <OnlinePlayersWindow />
        </GameWindow>
      )}

      {activeWindow && activeWindow !== 'travel' && activeWindow !== 'skills' && activeWindow !== 'online' && (
        <GameWindow title={WINDOW_TITLES[activeWindow] ?? activeWindow}>
          <div className="game-window-placeholder">
            <span>Coming soon.</span>
          </div>
        </GameWindow>
      )}
    </div>
  )
}
