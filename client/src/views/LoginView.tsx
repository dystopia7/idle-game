import { useState } from 'react'
import { PLAYER_CLASSES, CLASS_BASE_STATS, CLASS_LEVEL_UP } from '@idle-rpg/shared'
import type { PlayerClass } from '@idle-rpg/shared'

const SERVER = import.meta.env.VITE_SERVER_URL ?? ''

interface Props { onLogin: (token: string) => void }

const CLASS_META: Record<PlayerClass, { icon: string; label: string; desc: string }> = {
  KNIGHT:   { icon: '⚔', label: 'Knight',   desc: 'Master of melee. High HP and the best defense growth.' },
  SORCERER: { icon: '✦', label: 'Sorcerer', desc: 'Arcane devastator. Fragile but with unmatched spell damage.' },
  PALADIN:  { icon: '◎', label: 'Paladin',  desc: 'Swift ranger. Balanced growth with high attack speed.' },
  DRUID:    { icon: '⊛', label: 'Druid',    desc: 'Nature\'s guardian. Passively regenerates HP each combat round.' },
}

type Step = 'credentials' | 'class-select'

export default function LoginView({ onLogin }: Props) {
  const [step, setStep]         = useState<Step>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function login() {
    if (!username.trim() || !password) { setError('Please fill in both fields.'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${SERVER}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Unknown error'); return }
      localStorage.setItem('token', data.token)
      onLogin(data.token)
    } catch {
      setError('Cannot reach server — is it running?')
    } finally {
      setLoading(false)
    }
  }

  async function startRegister() {
    if (!username.trim() || !password) { setError('Please fill in both fields.'); return }
    if (password.length < 6)            { setError('Password must be at least 6 characters.'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${SERVER}/api/auth/check-username?username=${encodeURIComponent(username.trim())}`)
      const data = await res.json()
      if (!data.available) { setError(data.error ?? 'Username already taken.'); return }
      setStep('class-select')
    } catch {
      setError('Cannot reach server — is it running?')
    } finally {
      setLoading(false)
    }
  }

  async function registerWithClass(playerClass: PlayerClass) {
    setError(''); setLoading(true)
    try {
      const res  = await fetch(`${SERVER}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username:    username.trim(),
          email:       `${username.trim()}@idle-rpg.local`,
          password,
          playerClass,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Unknown error')
        if (data.error?.includes('already taken')) setStep('credentials')
        return
      }
      localStorage.setItem('token', data.token)
      onLogin(data.token)
    } catch {
      setError('Cannot reach server — is it running?')
      setStep('credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-view">
      <div className="login-corner tl" /><div className="login-corner tr" />
      <div className="login-corner bl" /><div className="login-corner br" />

      {step === 'credentials' ? (
        <div className="login-panel">
          <div className="login-panel-header">
            <div className="login-title">⚔ IDLE RPG ⚔</div>
            <div className="login-subtitle">Browser MMO</div>
          </div>

          <div className="login-body">
            <div className="login-field">
              <div className="login-label">USERNAME</div>
              <input
                className="login-input"
                type="text"
                maxLength={20}
                placeholder="Enter username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') login() }}
                autoFocus
              />
            </div>
            <div className="login-field">
              <div className="login-label">PASSWORD</div>
              <input
                className="login-input"
                type="password"
                maxLength={72}
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') login() }}
              />
            </div>
            <div className="login-btns">
              <button className="login-btn primary"   onClick={login}          disabled={loading}>{loading ? '...' : 'Login'}</button>
              <button className="login-btn secondary" onClick={startRegister}  disabled={loading}>Register</button>
            </div>
          </div>

          <div className="login-panel-footer">
            {error && <div className="login-error">{error}</div>}
          </div>
        </div>
      ) : (
        <div className="login-panel class-select-panel">
          <div className="login-panel-header">
            <div className="login-title">Choose Your Class</div>
            <div className="login-subtitle">This decision is permanent</div>
          </div>

          <div className="login-body">
            <div className="class-grid">
              {PLAYER_CLASSES.map(pc => {
                const meta   = CLASS_META[pc]
                const base   = CLASS_BASE_STATS[pc]
                const gains  = CLASS_LEVEL_UP[pc]
                return (
                  <button
                    key={pc}
                    className="class-card"
                    onClick={() => registerWithClass(pc)}
                    disabled={loading}
                  >
                    <div className="class-card-icon">{meta.icon}</div>
                    <div className="class-card-name">{meta.label.toUpperCase()}</div>
                    <div className="class-card-desc">{meta.desc}</div>
                    <div className="class-card-stats">
                      <div className="class-card-stat"><span>Start HP</span><span>{base.hp}</span></div>
                      <div className="class-card-stat"><span>+HP/lvl</span><span>{gains.hp}</span></div>
                      <div className="class-card-stat"><span>+ATK/lvl</span><span>{gains.atk}</span></div>
                      <div className="class-card-stat"><span>+DEF/lvl</span><span>{gains.def}</span></div>
                      {pc === 'DRUID' && (
                        <div className="class-card-stat class-card-perk"><span>Passive</span><span>HP regen</span></div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            <button className="login-btn secondary" style={{ width: '100%' }} onClick={() => { setStep('credentials'); setError('') }}>
              ← Back
            </button>
          </div>

          <div className="login-panel-footer">
            {error && <div className="login-error">{error}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
