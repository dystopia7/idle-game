import { usePlayerStore, useOnlinePlayersStore, openWindow } from '../lib/gameStore'

const NAV_LINKS = ['Home', 'Wiki', 'Library', 'News', 'Community', 'Discord']

interface Props { onLogout: () => void }

export default function TopBar({ onLogout }: Props) {
  const { player }    = usePlayerStore()
  const onlinePlayers = useOnlinePlayersStore()

  return (
    <div className="top-bar">
      <span className="top-bar-logo">⚔ IDLE RPG</span>

      <nav className="top-bar-nav">
        {NAV_LINKS.map(link => (
          <button key={link} className="top-bar-nav-link">{link}</button>
        ))}
      </nav>

      <div className="top-bar-right">
        {player && (
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            {player.username}
          </span>
        )}
        {player && (
          <span style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--text-dim)' }}>Gold&nbsp;</span>
            <span style={{ color: 'var(--text-accent)', fontWeight: 600 }}>
              {player.gold.toLocaleString()}
            </span>
          </span>
        )}
        <button className="online-badge online-badge--btn" onClick={() => openWindow('online')}>
          <span className="online-dot" />
          {onlinePlayers.length || 1} Online
        </button>
        <button className="report-btn" onClick={onLogout}>Logout</button>
      </div>
    </div>
  )
}
