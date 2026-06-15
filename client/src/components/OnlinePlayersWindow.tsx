import { useOnlinePlayersStore } from '../lib/gameStore'

function fmtZone(key: string) {
  return key === 'town' ? 'Town'
    : key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const CLASS_ICON: Record<string, string> = {
  KNIGHT:   '⚔',
  PALADIN:  '🛡',
  SORCERER: '🔮',
  DRUID:    '🌿',
}

export default function OnlinePlayersWindow() {
  const players = useOnlinePlayersStore()

  return (
    <div className="online-players-list">
      <div className="online-players-header">
        <span className="online-players-col">Character</span>
        <span className="online-players-col">Class</span>
        <span className="online-players-col online-players-col--center">Lvl</span>
        <span className="online-players-col">Location</span>
      </div>
      {players.length === 0 ? (
        <div className="online-players-empty">No players online.</div>
      ) : (
        players.map(p => (
          <div key={p.username} className="online-players-row">
            <span className="online-players-col online-players-name">{p.username}</span>
            <span className="online-players-col online-players-class">
              <span className="online-players-class-icon">{CLASS_ICON[p.playerClass] ?? '?'}</span>
              {p.playerClass.charAt(0) + p.playerClass.slice(1).toLowerCase()}
            </span>
            <span className="online-players-col online-players-col--center online-players-level">{p.level}</span>
            <span className="online-players-col online-players-zone">
              {fmtZone(p.zone)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
