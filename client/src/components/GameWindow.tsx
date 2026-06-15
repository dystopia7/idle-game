import type { ReactNode } from 'react'
import { openWindow } from '../lib/gameStore'

interface Props {
  title: string
  size?: 'lg'
  children: ReactNode
}

export default function GameWindow({ title, size, children }: Props) {
  return (
    <div
      className="game-window-backdrop"
      onClick={e => { if (e.target === e.currentTarget) openWindow(null) }}
    >
      <div className={`game-window${size === 'lg' ? ' game-window--lg' : ''}`}>
        <div className="game-window-header">
          <span>{title}</span>
          <button className="game-window-close" onClick={() => openWindow(null)}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
