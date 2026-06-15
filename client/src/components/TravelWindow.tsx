import { useState, useMemo } from 'react'
import { gameBridge } from '../lib/gameBridge'
import { openWindow, useZoneStore } from '../lib/gameStore'
import { CITIES } from '../data/zones'

export default function TravelWindow() {
  const currentZone = useZoneStore()
  const [selectedCity, setSelectedCity] = useState('venore')
  const [search, setSearch] = useState('')

  const city = CITIES.find(c => c.key === selectedCity)!

  const filteredZones = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return city.zones
    return city.zones.filter(z =>
      z.name.toLowerCase().includes(q) || z.monster.toLowerCase().includes(q)
    )
  }, [city.zones, search])

  function travel(zone: string) {
    gameBridge.emit('travel_request', { zone })
    openWindow(null)
  }

  function goToTown() {
    gameBridge.emit('travel_request', { zone: 'town' })
    openWindow(null)
  }

  return (
    <div className="travel-menu">

      {/* ── City tab strip ──────────────────────────────────────── */}
      <div className="travel-city-tabs">
        {CITIES.map(c => (
          <button
            key={c.key}
            className={`travel-city-tab${selectedCity === c.key ? ' travel-city-tab--active' : ''}`}
            onClick={() => { setSelectedCity(c.key); setSearch('') }}
          >
            {c.name}
            {c.minLevel !== null && (
              <span className="travel-city-tab-level">{c.minLevel}+</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Search ─────────────────────────────────────────────── */}
      <div className="travel-search">
        <svg className="travel-search-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          className="travel-search-input"
          placeholder={`Search ${city.name} hunting zones...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── City header ─────────────────────────────────────────── */}
      <div className="travel-city-header">
        <div>
          <div className="travel-city-header-name">{city.name}</div>
          <div className="travel-city-header-sub">
            {city.zones.length} available of {city.zones.length} hunting zones
          </div>
        </div>
        <button
          className="travel-town-btn"
          onClick={goToTown}
          disabled={currentZone === 'town'}
        >
          Go to Town
        </button>
      </div>

      {/* ── Zone list ───────────────────────────────────────────── */}
      <div className="travel-zone-list">
        {city.zones.length === 0 ? (
          <div className="travel-zone-empty">Coming soon.</div>
        ) : filteredZones.length === 0 ? (
          <div className="travel-zone-empty">No zones match your search.</div>
        ) : (
          filteredZones.map(zone => {
            const isCurrent = zone.key === currentZone
            const expStr = zone.expMin === zone.expMax
              ? zone.expMin.toString()
              : `${zone.expMin}-${zone.expMax}`
            return (
              <div key={zone.key} className={`travel-zone-card${isCurrent ? ' travel-zone-card--current' : ''}`}>
                <div className="travel-zone-icon">{zone.icon}</div>
                <div className="travel-zone-info">
                  <div className="travel-zone-name">{zone.name}</div>
                  <div className="travel-zone-meta">
                    {city.name} · {zone.monster} · EXP {expStr}
                  </div>
                  <div className="travel-zone-status-row">
                    <span className="travel-zone-open">Open</span>
                    <span className="travel-zone-level-req"> — Level {zone.minLevel}</span>
                    {isCurrent && <span className="travel-zone-here">◆ HERE</span>}
                  </div>
                </div>
                <button
                  className="travel-zone-btn"
                  onClick={() => travel(zone.key)}
                  disabled={isCurrent}
                >
                  {isCurrent ? 'Here' : 'Travel'}
                </button>
              </div>
            )
          })
        )}
      </div>

    </div>
  )
}
