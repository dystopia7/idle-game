import { useState, useRef, useEffect } from 'react'
import { useChatMessages, useCombatLog, useLootLog } from '../lib/gameStore'
import { getSocket } from '../network/socket'

type Tab = 'GLOBAL' | 'LOCAL' | 'COMBAT LOG' | 'LOOT'

export default function BottomChat() {
  const [tab, setTab] = useState<Tab>('GLOBAL')
  const [input, setInput]   = useState('')
  const chatMessages = useChatMessages()
  const combatLog    = useCombatLog()
  const lootLog      = useLootLog()
  const messagesRef  = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chatMessages, combatLog, lootLog, tab])

  function sendChat() {
    const msg = input.trim()
    if (!msg) return
    const channel: 'global' | 'party' = tab === 'LOCAL' ? 'party' : 'global'
    getSocket().emit('chat', { message: msg, channel })
    setInput('')
  }

  const globalMsgs = chatMessages.filter(m => m.channel === 'global')
  const localMsgs  = chatMessages.filter(m => m.channel === 'local' || m.channel === 'party')

  const visibleMsgs = tab === 'GLOBAL' ? globalMsgs : tab === 'LOCAL' ? localMsgs : []
  const visibleLog  = tab === 'COMBAT LOG' ? combatLog : tab === 'LOOT' ? lootLog : []
  const canSend = tab === 'GLOBAL' || tab === 'LOCAL'

  function combatClass(line: string): string {
    if (line.includes('hits you for') || line.includes('have died') || line.includes(' ! ')) return 'combat'
    if (line.includes('heal yourself') || line.includes('have respawned')) return 'kill'
    return ''
  }

  return (
    <div className="bottom-chat">
      <div className="chat-tabs">
        {(['LOCAL', 'GLOBAL', 'COMBAT LOG', 'LOOT'] as Tab[]).map(t => (
          <button
            key={t}
            className={`chat-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {tab === 'GLOBAL' && <span className="chat-label" style={{ display:'flex', alignItems:'center' }}>All players</span>}
      </div>

      <div className="chat-messages" ref={messagesRef}>
        {visibleLog.map((line, i) => (
          <div key={i} className={`chat-msg ${tab === 'LOOT' ? 'loot' : combatClass(line)}`}>
            <span className="msg-text">{line}</span>
          </div>
        ))}
        {visibleLog.length === 0 && (tab === 'COMBAT LOG' || tab === 'LOOT') && (
          <div className="chat-msg system">
            <span className="msg-text">{tab === 'LOOT' ? 'Loot drops will appear here.' : 'No combat yet.'}</span>
          </div>
        )}
        {visibleMsgs.map((msg, i) => (
          <div key={i} className="chat-msg">
            <span className="msg-name">{msg.from}</span>
            <span className="msg-colon">:</span>
            <span className="msg-text">{msg.message}</span>
          </div>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder={canSend ? `Type in ${tab.toLowerCase()}…` : 'Read-only channel'}
          value={input}
          disabled={!canSend}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
          maxLength={200}
        />
        <button className="chat-send-btn" onClick={sendChat} disabled={!canSend}>
          SEND
        </button>
      </div>
    </div>
  )
}
