import { useSkillsStore, pointsToNextLevel } from '../lib/gameStore'
import type { SkillType } from '@idle-rpg/shared'

interface SkillMeta {
  key:   SkillType
  label: string
  icon:  string
  desc:  string
}

const SKILLS: SkillMeta[] = [
  { key: 'CLUB',      label: 'Club',        icon: '⚒',  desc: 'Trained by hitting with clubs' },
  { key: 'AXE',       label: 'Axe',         icon: '🪓', desc: 'Trained by hitting with axes' },
  { key: 'SWORD',     label: 'Sword',       icon: '⚔',  desc: 'Trained by hitting with swords' },
  { key: 'DISTANCE',  label: 'Distance',    icon: '◎',  desc: 'Trained by hitting with ranged weapons' },
  { key: 'SHIELDING', label: 'Shielding',   icon: '🛡',  desc: 'Trained by taking damage' },
  { key: 'MAGIC',     label: 'Magic Level', icon: '✨', desc: 'Trained by spending mana on spells' },
]

export default function SkillsWindow() {
  const skills = useSkillsStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
      {SKILLS.map(meta => {
        const s     = skills.find(sk => sk.skill === meta.key)
        const level  = s?.level  ?? 0
        const points = s?.points ?? 0
        const needed = pointsToNextLevel(meta.key, level)
        const pct    = needed > 0 ? Math.min(100, (points / needed) * 100) : 0

        return (
          <div key={meta.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-bright)', fontWeight: 600 }}>
                {meta.icon}&nbsp;{meta.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-bright)', fontWeight: 700, minWidth: 28, textAlign: 'right' }}>
                {level}
              </span>
            </div>

            <div className="stat-bar-track xp" style={{ height: 7, background: 'var(--bg-deep)' }}>
              <div
                className="stat-bar-fill xp"
                style={{ width: `${pct}%`, transition: 'width 0.3s ease' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)' }}>
              <span>{meta.desc}</span>
              <span style={{ whiteSpace: 'nowrap', marginLeft: 8 }}>{points} / {needed}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
