import { openWindow } from '../lib/gameStore'

const TOWN_OPTIONS = [
  { key: 'depot',    icon: '📦', label: 'Depot',    desc: 'Store and retrieve items from your personal depot.' },
  { key: 'bank',     icon: '🏦', label: 'Bank',     desc: 'Deposit or withdraw gold securely.' },
  { key: 'mailbox',  icon: '✉',  label: 'Mailbox',  desc: 'Send and receive mail from other players.' },
  { key: 'market',   icon: '⚖',  label: 'Market',   desc: 'Buy and sell items with other players.' },
  { key: 'vendors',  icon: '🛒',  label: 'Vendors',  desc: 'Purchase supplies and equipment from NPCs.' },
  { key: 'trainer',  icon: '⚔',  label: 'Trainer',  desc: 'Spend skill points to improve your abilities.' },
]

export default function TownView() {
  return (
    <div className="town-view">
      <div className="town-header">
        <div className="town-header-title">◆ TOWN ◆</div>
        <div className="town-header-sub">You are in a safe zone. Choose a destination.</div>
      </div>

      <div className="town-grid">
        {TOWN_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className="town-option"
            onClick={() => openWindow(opt.key)}
          >
            <div className="town-option-icon">{opt.icon}</div>
            <div className="town-option-label">{opt.label}</div>
            <div className="town-option-desc">{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
