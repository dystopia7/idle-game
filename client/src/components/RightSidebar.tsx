import { useState } from 'react'
import { usePlayerStore } from '../lib/gameStore'
import type { ItemDTO, ItemType, PlayerClass, SkillType } from '@idle-rpg/shared'
import { getSocket } from '../network/socket'

const SKILL_LABEL: Record<SkillType, string> = {
  CLUB: 'Club', AXE: 'Axe', SWORD: 'Sword',
  DISTANCE: 'Distance', SHIELDING: 'Shielding', MAGIC: 'Magic',
}

function itemTooltip(item: ItemDTO): string {
  const lines: string[] = [item.name, item.description]
  if (item.attackBonus)  lines.push(`ATK +${item.attackBonus}`)
  if (item.defenseBonus) lines.push(`DEF +${item.defenseBonus}`)
  if (item.hpBonus)      lines.push(`HP +${item.hpBonus}`)
  if (item.manaBonus)    lines.push(`MANA +${item.manaBonus}`)
  if (item.manaCost)     lines.push(`Mana cost: ${item.manaCost} per shot`)
  if (item.speedBonus)   lines.push(`SPD +${item.speedBonus}`)
  if (item.type === 'WEAPON' && (item as ItemDTO & { range?: number }).range! > 1)
    lines.push(`Range: ${(item as ItemDTO & { range?: number }).range}`)
  const skillKeys = [
    'clubSkillBonus', 'axeSkillBonus', 'swordSkillBonus',
    'distanceSkillBonus', 'shieldingSkillBonus', 'magicSkillBonus',
  ] as const
  const skillMap: Record<typeof skillKeys[number], SkillType> = {
    clubSkillBonus: 'CLUB', axeSkillBonus: 'AXE', swordSkillBonus: 'SWORD',
    distanceSkillBonus: 'DISTANCE', shieldingSkillBonus: 'SHIELDING', magicSkillBonus: 'MAGIC',
  }
  for (const key of skillKeys) {
    const val = item[key] as number
    if (val) lines.push(`${SKILL_LABEL[skillMap[key]]} Skill +${val}`)
  }
  if (item.requiredClass)    lines.push(`Class: ${item.requiredClass}`)
  if (item.requiredLevel > 1) lines.push(`Req. Level: ${item.requiredLevel}`)
  lines.push('Right-click to equip')
  return lines.join('\n')
}

function equippedTooltip(item: ItemDTO): string {
  const base = itemTooltip(item)
  // Replace the last line with unequip hint
  return base.replace('Right-click to equip', 'Right-click to unequip')
}

const ITEM_ICONS: Record<string, string> = {
  WEAPON: '⚔', ARMOR: '🛡', HELMET: '⛑', LEGS: '◫', BOOTS: '◻',
  ACCESSORY: '💍', CONSUMABLE: '⊕', MATERIAL: '◈',
}
const RARITY_CLASS: Record<string, string> = {
  COMMON: '', UNCOMMON: 'rarity-uncommon', RARE: 'rarity-rare',
  EPIC: 'rarity-epic', LEGENDARY: 'rarity-legendary',
}

// type is the ItemType that can be dropped here; null = decorative slot (no drops)
const EQUIP_SLOTS: { name: string; type: string | null }[] = [
  { name: 'Head',   type: 'HELMET'    },
  { name: 'Neck',   type: 'ACCESSORY' },
  { name: 'Back',   type: null        },
  { name: 'L.Hand', type: 'WEAPON'    },
  { name: 'Chest',  type: 'ARMOR'     },
  { name: 'R.Hand', type: null        },
  { name: 'Ring',   type: 'ACCESSORY' },
  { name: 'Legs',   type: 'LEGS'      },
  { name: 'Gloves', type: null        },
  { name: 'Feet',   type: 'BOOTS'     },
]

const BACKPACK_SLOTS = 24

const CLASS_ICON: Record<PlayerClass, string> = {
  KNIGHT: '⚔', SORCERER: '✦', PALADIN: '◎', DRUID: '⊛',
}
const CLASS_LABEL: Record<PlayerClass, string> = {
  KNIGHT: 'Knight', SORCERER: 'Sorcerer', PALADIN: 'Paladin', DRUID: 'Druid',
}

const UNEQUIPPABLE: Set<ItemType> = new Set(['CONSUMABLE', 'MATERIAL'])

export default function RightSidebar() {
  const { player } = usePlayerStore()
  const [dragType, setDragType] = useState<string | null>(null)

  const maxXp   = player ? 50 * (player.level * player.level - 5 * player.level + 8) : 1
  const hpPct   = player ? Math.round((player.hp   / player.maxHp)   * 100) : 0
  const manaPct = player ? Math.round((player.mana / player.maxMana) * 100) : 0
  const xpPct   = player ? Math.round((player.experience / maxXp)    * 100) : 0

  const equipped = player?.inventory.filter(i => i.equipped)  ?? []
  const backpack  = player?.inventory.filter(i => !i.equipped) ?? []

  const equippedBySlot = new Map<string, typeof equipped[0]>()
  for (const inv of equipped) equippedBySlot.set(inv.item.type, inv)

  function emitEquip(inventoryItemId: string) {
    try { getSocket().emit('equip_item', { inventoryItemId }) } catch { /* socket not ready */ }
  }
  function emitUnequip(inventoryItemId: string) {
    try { getSocket().emit('unequip_item', { inventoryItemId }) } catch { /* socket not ready */ }
  }

  return (
    <aside className="right-sidebar">

      {/* ── CHARACTER ── */}
      <div className="rs-section">
        <div className="rs-header">◆ CHARACTER ◆</div>
        <div className="char-identity">
          <div className="char-portrait">{player ? CLASS_ICON[player.playerClass] : '⚔'}</div>
          <div className="char-meta">
            <div className="char-name">{player?.username ?? '—'}</div>
            <div className="char-class">{player ? CLASS_LABEL[player.playerClass] : 'Adventurer'}</div>
            <div className="char-level">Level {player?.level ?? '—'}</div>
          </div>
        </div>
        <div className="char-stats">
          <div className="stat-bar-row">
            <div className="stat-bar-label">
              <span className="stat-bar-name">EXP</span>
              <span className="stat-bar-val">
                {player ? `${player.experience.toLocaleString()} / ${maxXp.toLocaleString()}` : '—'}
              </span>
            </div>
            <div className="stat-bar-track xp">
              <div className="stat-bar-fill xp" style={{ width: `${xpPct}%` }} />
            </div>
          </div>

          <div className="stat-bar-row">
            <div className="stat-bar-label">
              <span className="stat-bar-name">HP</span>
              <span className="stat-bar-val">
                {player ? `${player.hp.toLocaleString()} / ${player.maxHp.toLocaleString()}` : '—'}
              </span>
            </div>
            <div className="stat-bar-track">
              <div className="stat-bar-fill" style={{ width: `${hpPct}%` }} />
            </div>
          </div>

          <div className="stat-bar-row">
            <div className="stat-bar-label">
              <span className="stat-bar-name">MANA</span>
              <span className="stat-bar-val">
                {player ? `${player.mana.toLocaleString()} / ${player.maxMana.toLocaleString()}` : '—'}
              </span>
            </div>
            <div className="stat-bar-track mp">
              <div className="stat-bar-fill mp" style={{ width: `${manaPct}%` }} />
            </div>
          </div>

          {player && (
            <div style={{ marginTop: 5, display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-dim)' }}>
              <span>ATK <span style={{ color: 'var(--text)' }}>{player.attack}</span></span>
              <span>DEF <span style={{ color: 'var(--text)' }}>{player.defense}</span></span>
              <span>SPD <span style={{ color: 'var(--text)' }}>{player.speed}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* ── EQUIPMENT — 3×3 + feet ── */}
      <div className="rs-section rs-section-sm">
        <div className="rs-header">◆ EQUIPMENT ◆</div>
        <div className="equip-grid">
          {EQUIP_SLOTS.map(slot => {
            const inv     = slot.type ? equippedBySlot.get(slot.type) : undefined
            const isValid = slot.type !== null && slot.type === dragType

            return (
              <div
                key={slot.name}
                className={`equip-slot ${inv ? `filled ${RARITY_CLASS[inv.item.rarity]}` : ''}`}
                style={isValid ? { outline: '2px solid #4a9eff', outlineOffset: '-2px' } : undefined}
                title={inv ? equippedTooltip(inv.item) : slot.name}
                onContextMenu={e => {
                  if (!inv) return
                  e.preventDefault()
                  emitUnequip(inv.id)
                }}
                onDragOver={e => { if (isValid) e.preventDefault() }}
                onDrop={e => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  if (id && isValid) emitEquip(id)
                  setDragType(null)
                }}
              >
                {inv ? (
                  <>
                    <span className="equip-slot-icon">{ITEM_ICONS[inv.item.type] ?? '?'}</span>
                    <span className="equip-slot-name">{inv.item.name.slice(0, 8)}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 9, color: isValid ? '#4a9eff' : 'var(--text-muted)' }}>
                    {slot.name}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── BACKPACK — 4×6 ── */}
      <div className="rs-section rs-section-sm" style={{ flex: 1 }}>
        <div className="rs-header">
          ◆ BACKPACK ◆
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{backpack.length}/{BACKPACK_SLOTS}</span>
        </div>
        <div className="backpack-grid">
          {backpack.map(inv => {
            const canEquip = !UNEQUIPPABLE.has(inv.item.type as ItemType)
            return (
              <div
                key={inv.id}
                className={`item-slot ${RARITY_CLASS[inv.item.rarity]}`}
                title={itemTooltip(inv.item)}
                draggable={canEquip}
                onDragStart={e => {
                  e.dataTransfer.setData('text/plain', inv.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setDragType(inv.item.type)
                }}
                onDragEnd={() => setDragType(null)}
                onContextMenu={e => {
                  if (!canEquip) return
                  e.preventDefault()
                  emitEquip(inv.id)
                }}
              >
                <span>{ITEM_ICONS[inv.item.type] ?? '?'}</span>
                {inv.quantity > 1 && <span className="item-qty">{inv.quantity}</span>}
              </div>
            )
          })}
          {Array.from({ length: Math.max(0, BACKPACK_SLOTS - backpack.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="item-slot" />
          ))}
        </div>
      </div>

    </aside>
  )
}
