import { gameBridge } from '../lib/gameBridge'
import { useModeStore, setModeStore, openWindow } from '../lib/gameStore'

export default function LeftSidebar() {
  const { mode, range, xpTrackerVisible } = useModeStore()

  function setMode(m: 'chase' | 'kite') {
    setModeStore({ mode: m })
    gameBridge.emit('set_move_mode', { mode: m })
  }
  function setRange(r: number) {
    const clamped = Math.max(1, Math.min(7, r))
    setModeStore({ range: clamped })
    gameBridge.emit('set_kite_range', { range: clamped })
  }

  return (
    <aside className="left-sidebar">
      <div className="sidebar-title">◆ MAIN MENU ◆</div>

      {/* ADVENTURE */}
      <div className="nav-section">
        <div className="nav-section-label">Adventure</div>
        <button className="nav-item" onClick={() => openWindow('travel')}><span className="nav-icon">↟</span> Travel</button>
        <button className="nav-item" onClick={() => openWindow('hunting')}><span className="nav-icon">◎</span> Hunting</button>
        <button className="nav-item" onClick={() => openWindow('quests')}><span className="nav-icon">✦</span> Quests</button>
        <button className="nav-item" onClick={() => openWindow('daily')}><span className="nav-icon">☀</span> Daily</button>
      </div>

      {/* COMBAT */}
      <div className="nav-section">
        <div className="nav-section-label">Combat</div>
        <button className="nav-item" onClick={() => openWindow('potions')}><span className="nav-icon">⊕</span> Potions</button>
        <button className="nav-item" onClick={() => openWindow('backpack')}><span className="nav-icon">◈</span> Backpack</button>
        <button className="nav-item" onClick={() => openWindow('spells')}><span className="nav-icon">✨</span> Spells</button>
        <button className="nav-item" onClick={() => openWindow('bosses')}><span className="nav-icon">☠</span> Bosses</button>
      </div>

      {/* CHARACTER */}
      <div className="nav-section">
        <div className="nav-section-label">Character</div>
        <button className="nav-item" onClick={() => openWindow('stats')}><span className="nav-icon">◉</span> Stats</button>
        <button className="nav-item" onClick={() => openWindow('skills')}><span className="nav-icon">⚔</span> Skills</button>
        <button className="nav-item" onClick={() => openWindow('party')}><span className="nav-icon">⊞</span> Party</button>
        <button className="nav-item" onClick={() => openWindow('cyclopedia')}><span className="nav-icon">◎</span> Cyclopedia</button>
      </div>

      {/* UTILITIES */}
      <div className="nav-section">
        <div className="nav-section-label">Utilities</div>

        <div className="util-block">
          <button
            className={`util-toggle-btn ${xpTrackerVisible ? 'active' : ''}`}
            onClick={() => setModeStore({ xpTrackerVisible: !xpTrackerVisible })}
          >
            {xpTrackerVisible ? '◉' : '◎'}&nbsp; XP Tracker
          </button>
        </div>

        <div className="util-block">
          <div className="util-block-label">Movement</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`mode-btn ${mode === 'chase' ? 'active' : ''}`} onClick={() => setMode('chase')}>Chase</button>
            <button className={`mode-btn ${mode === 'kite'  ? 'active' : ''}`} onClick={() => setMode('kite')}>Kite</button>
          </div>
          {mode === 'kite' && (
            <div className="range-row" style={{ marginTop: 5 }}>
              <span className="range-label">Range</span>
              <button className="range-btn" onClick={() => setRange(range - 1)}>−</button>
              <span className="range-val">{range}</span>
              <button className="range-btn" onClick={() => setRange(range + 1)}>+</button>
            </div>
          )}
        </div>
      </div>

      {/* ADVANCED */}
      <div className="nav-section">
        <div className="nav-section-label">Advanced</div>
        <button className="nav-item" onClick={() => openWindow('imbuements')}><span className="nav-icon">◈</span> Imbuements</button>
        <button className="nav-item" onClick={() => openWindow('fusion')}><span className="nav-icon">⊗</span> Fusion</button>
        <button className="nav-item" onClick={() => openWindow('blessings')}><span className="nav-icon">✦</span> Blessings</button>
        <button className="nav-item" onClick={() => openWindow('settings')}><span className="nav-icon">⚙</span> Settings</button>
      </div>

      {/* Bottom */}
      <div className="sidebar-bottom">
        <div className="boosted-section">
          <div className="boosted-label">Boosted</div>
          <div className="boosted-item">
            <div className="boosted-icon">🐉</div>
            <div className="boosted-info">
              <div className="boosted-name">Dragon</div>
              <div className="boosted-bonus">2× EXP</div>
            </div>
          </div>
          <div className="boosted-item">
            <div className="boosted-icon">👹</div>
            <div className="boosted-info">
              <div className="boosted-name">Troll</div>
              <div className="boosted-bonus">2× EXP</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '4px 8px', textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
          ◆ Cloud Saved
        </div>
      </div>
    </aside>
  )
}
