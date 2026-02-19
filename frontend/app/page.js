'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ─── helpers ──────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 90) return '#ff4757'
  if (score >= 75) return '#ff6b35'
  if (score >= 60) return '#ffa502'
  if (score >= 40) return '#f9ca24'
  return '#00f5a0'
}

function patternLabel(p) {
  const map = {
    cycle_length_3:        'Cycle ×3',
    cycle_length_4:        'Cycle ×4',
    cycle_length_5:        'Cycle ×5',
    fan_in:                'Fan-In',
    fan_in_temporal:       'Fan-In (72h)',
    fan_in_hub:            'Fan-In Hub',
    fan_in_hub_temporal:   'Fan-In Hub (72h)',
    fan_in_leaf:           'Fan-In Leaf',
    fan_in_leaf_temporal:  'Fan-In Leaf (72h)',
    fan_out:               'Fan-Out',
    fan_out_temporal:      'Fan-Out (72h)',
    fan_out_hub:           'Fan-Out Hub',
    fan_out_hub_temporal:  'Fan-Out Hub (72h)',
    fan_out_leaf:          'Fan-Out Leaf',
    fan_out_leaf_temporal: 'Fan-Out Leaf (72h)',
    layered_shell_network: 'Shell Network',
    shell_chain_3_hops:    'Shell 3-Hop',
    shell_chain_4_hops:    'Shell 4-Hop',
  }
  return map[p] || p.replace(/_/g, ' ')
}

function patternColor(p) {
  if (p.startsWith('cycle'))        return '#00c8f5'
  if (p.startsWith('fan_in'))       return '#ffa502'
  if (p.startsWith('fan_out'))      return '#a78bfa'
  if (p.startsWith('shell') || p.startsWith('layered')) return '#00f5a0'
  return '#64748b'
}

function patternTypeColor(pt) {
  if (pt.includes('cycle'))  return '#00c8f5'
  if (pt.includes('smurf'))  return '#ffa502'
  if (pt.includes('shell') || pt.includes('layered')) return '#00f5a0'
  return '#64748b'
}

// ─── Badge ────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontFamily: 'Space Mono, monospace',
      whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────
function StatCard({ label, value, accent, delay = 0 }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--bg2) 0%, var(--bg3) 100%)',
      border: `1px solid ${accent}33`,
      borderRadius: 12,
      padding: '20px 24px',
      flex: 1,
      minWidth: 140,
      animation: `fadeUp 0.5s ease ${delay}s both`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
      }} />
      <div style={{
        fontSize: 30, fontWeight: 800, color: accent,
        fontFamily: 'Space Mono, monospace', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text-muted)', marginTop: 6,
        textTransform: 'uppercase', letterSpacing: 1.5,
      }}>
        {label}
      </div>
    </div>
  )
}

// ─── Graph Canvas with improved force layout ──────────────────────
function GraphCanvas({ graphData }) {
  const canvasRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const nodesRef = useRef([])
  const animFrameRef = useRef(null)

  useEffect(() => {
    if (!graphData || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const { nodes, edges } = graphData
    if (!nodes.length) return

    // Build adjacency for edge lookup
    const edgeSet = new Set(edges.map(e => `${e.source}|${e.target}`))
    const nodeMap = {}

    // Initial positions — suspicious nodes clustered center, others around ring
    const suspicious = nodes.filter(n => n.suspicious)
    const clean = nodes.filter(n => !n.suspicious)

    const positions = []
    nodes.forEach((n, i) => {
      nodeMap[n.id] = i
    })

    // Place suspicious nodes in inner cluster
    suspicious.forEach((n, i) => {
      const angle = (i / Math.max(suspicious.length, 1)) * 2 * Math.PI
      const r = Math.min(W, H) * 0.18
      positions[nodeMap[n.id]] = {
        x: W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 30,
        y: H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 30,
        vx: 0, vy: 0, ...n,
      }
    })

    // Place clean nodes in outer ring
    clean.forEach((n, i) => {
      const angle = (i / Math.max(clean.length, 1)) * 2 * Math.PI
      const r = Math.min(W, H) * 0.38
      positions[nodeMap[n.id]] = {
        x: W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
        y: H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0, ...n,
      }
    })

    // Force-directed simulation
    let iteration = 0
    const MAX_ITER = 120
    const PADDING = 60

    function simulate() {
      if (iteration >= MAX_ITER) {
        nodesRef.current = positions
        draw()
        return
      }

      const cooling = Math.max(0.1, 1 - iteration / MAX_ITER)
      const repulseStrength = 1800
      const attractStrength = 0.03
      const centerStrength = 0.008  // gentle gravity toward center

      // Reset velocities
      for (let i = 0; i < positions.length; i++) {
        positions[i].vx = 0
        positions[i].vy = 0
      }

      // Repulsion between all node pairs
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x
          const dy = positions[i].y - positions[j].y
          const dist2 = dx * dx + dy * dy || 0.01
          const dist = Math.sqrt(dist2)
          const force = repulseStrength / dist2
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          positions[i].vx += fx
          positions[i].vy += fy
          positions[j].vx -= fx
          positions[j].vy -= fy
        }
      }

      // Attraction along edges
      edges.forEach(e => {
        const si = nodeMap[e.source]
        const ti = nodeMap[e.target]
        if (si === undefined || ti === undefined) return
        const dx = positions[ti].x - positions[si].x
        const dy = positions[ti].y - positions[si].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
        const force = dist * attractStrength
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        positions[si].vx += fx
        positions[si].vy += fy
        positions[ti].vx -= fx
        positions[ti].vy -= fy
      })

      // Gravity toward center (prevents edge drift)
      positions.forEach(p => {
        p.vx += (W / 2 - p.x) * centerStrength
        p.vy += (H / 2 - p.y) * centerStrength
      })

      // Apply velocities with cooling + soft bounds
      const maxSpeed = 12 * cooling
      positions.forEach(p => {
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1
        const scale = Math.min(speed, maxSpeed) / speed
        p.x += p.vx * scale
        p.y += p.vy * scale
        // Soft bounce off walls
        if (p.x < PADDING)      { p.x = PADDING;      p.vx *= -0.3 }
        if (p.x > W - PADDING)  { p.x = W - PADDING;  p.vx *= -0.3 }
        if (p.y < PADDING)      { p.y = PADDING;       p.vy *= -0.3 }
        if (p.y > H - PADDING)  { p.y = H - PADDING;  p.vy *= -0.3 }
      })

      iteration++
      nodesRef.current = positions
      draw()
      animFrameRef.current = requestAnimationFrame(simulate)
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)

      // Grid background
      ctx.strokeStyle = '#1e2d4520'
      ctx.lineWidth = 0.5
      for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // Edges
      edges.forEach(e => {
        const si = nodeMap[e.source]
        const ti = nodeMap[e.target]
        if (si === undefined || ti === undefined) return
        const s = positions[si]
        const t = positions[ti]
        if (!s || !t) return
        const isSusp = s.suspicious && t.suspicious
        const color = isSusp ? '#ff4757' : '#1e2d45'
        const alpha = isSusp ? '60' : '40'

        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(t.x, t.y)
        ctx.strokeStyle = color + alpha
        ctx.lineWidth = isSusp ? 1.5 : 0.7
        ctx.stroke()

        // Arrowhead
        if (isSusp) {
          const angle = Math.atan2(t.y - s.y, t.x - s.x)
          const al = 7
          ctx.beginPath()
          ctx.moveTo(t.x, t.y)
          ctx.lineTo(t.x - al * Math.cos(angle - 0.4), t.y - al * Math.sin(angle - 0.4))
          ctx.lineTo(t.x - al * Math.cos(angle + 0.4), t.y - al * Math.sin(angle + 0.4))
          ctx.closePath()
          ctx.fillStyle = '#ff475780'
          ctx.fill()
        }
      })

      // Nodes
      positions.forEach(n => {
        if (!n) return
        const r = n.suspicious ? 9 : 4
        const color = n.suspicious ? scoreColor(n.suspicion_score) : '#1e3a5f'

        // Glow for suspicious
        if (n.suspicious) {
          const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r + 10)
          grd.addColorStop(0, color + '40')
          grd.addColorStop(1, color + '00')
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 10, 0, Math.PI * 2)
          ctx.fillStyle = grd
          ctx.fill()
        }

        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = n.suspicious ? color + 'cc' : '#1e2d45'
        ctx.lineWidth = n.suspicious ? 1.5 : 1
        ctx.stroke()
      })
    }

    animFrameRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [graphData])

  function handleMouseMove(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const mx = (e.clientX - rect.left) * scaleX
    const my = (e.clientY - rect.top) * scaleY
    const hit = nodesRef.current.find(n => {
      if (!n) return false
      const dx = n.x - mx; const dy = n.y - my
      return Math.sqrt(dx * dx + dy * dy) < 14
    })
    setTooltip(hit ? { x: e.clientX, y: e.clientY, node: hit } : null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={900}
        height={520}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        style={{
          width: '100%', borderRadius: 10,
          cursor: 'crosshair',
          background: 'radial-gradient(ellipse at center, #0a1628 0%, var(--bg) 100%)',
        }}
      />
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 14,
          top: tooltip.y - 10,
          background: '#0d1420',
          border: `1px solid ${tooltip.node.suspicious ? scoreColor(tooltip.node.suspicion_score) + '80' : 'var(--border)'}`,
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 12,
          fontFamily: 'Space Mono, monospace',
          zIndex: 100,
          pointerEvents: 'none',
          maxWidth: 220,
          boxShadow: tooltip.node.suspicious ? `0 0 20px ${scoreColor(tooltip.node.suspicion_score)}30` : 'none',
        }}>
          <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>{tooltip.node.id}</div>
          {tooltip.node.suspicious ? (
            <>
              <div style={{ color: scoreColor(tooltip.node.suspicion_score) }}>
                Risk Score: {tooltip.node.suspicion_score}
              </div>
              <div style={{ color: 'var(--danger)', fontSize: 10, marginTop: 4, letterSpacing: 1 }}>⚠ SUSPICIOUS</div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>Clean account</div>
          )}
        </div>
      )}
      {/* Legend */}
      <div style={{
        display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap',
        fontSize: 11, fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)',
      }}>
        {[
          { color: '#ff4757', label: 'Critical (90+)' },
          { color: '#ff6b35', label: 'High (75–89)' },
          { color: '#ffa502', label: 'Medium (60–74)' },
          { color: '#f9ca24', label: 'Low (40–59)' },
          { color: '#1e3a5f', label: 'Clean' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, display: 'inline-block',
              boxShadow: color !== '#1e3a5f' ? `0 0 6px ${color}` : 'none',
            }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Loading Overlay ──────────────────────────────────────────────
function LoadingOverlay() {
  const [dots, setDots] = useState(0)
  const [phase, setPhase] = useState(0)
  const phases = [
    'Parsing CSV data...',
    'Building transaction graph...',
    'Detecting cycle patterns...',
    'Scanning for smurfing...',
    'Analyzing shell networks...',
    'Computing risk scores...',
  ]

  useEffect(() => {
    const d = setInterval(() => setDots(v => (v + 1) % 4), 400)
    const p = setInterval(() => setPhase(v => (v + 1) % phases.length), 1800)
    return () => { clearInterval(d); clearInterval(p) }
  }, [])

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '48px 32px',
      textAlign: 'center',
      marginBottom: 40,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Scanline effect */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,245,160,0.015) 2px, rgba(0,245,160,0.015) 4px)',
      }} />

      {/* Spinner */}
      <div style={{
        width: 56, height: 56, margin: '0 auto 24px',
        border: '3px solid var(--border)',
        borderTop: '3px solid var(--accent)',
        borderRight: '3px solid var(--accent2)',
        borderRadius: '50%',
        animation: 'spin 0.9s linear infinite',
      }} />

      <div style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: 13,
        color: 'var(--accent)',
        letterSpacing: 1,
        marginBottom: 8,
      }}>
        {phases[phase]}{''.padEnd(dots, '.')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Running graph analysis on your transaction data
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────
export default function Home() {
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [result, setResult]     = useState(null)
  const fileInputRef            = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    if (!f.name.endsWith('.csv')) {
      setError('Please upload a valid .csv file'); return
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('File too large. Maximum size is 50MB.'); return
    }
    setFile(f); setError(null); setResult(null)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`${API_URL}/analyze`, { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Analysis failed')
      }
      setResult(await res.json())
    } catch (e) {
      setError(e.message === 'Failed to fetch'
        ? 'Cannot reach backend. Make sure the API server is running.'
        : e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const exportData = {
      suspicious_accounts: result.suspicious_accounts.map(a => ({
        account_id:        a.account_id,
        suspicion_score:   a.suspicion_score,
        detected_patterns: a.detected_patterns,
        ring_id:           a.ring_id,
      })),
      fraud_rings: result.fraud_rings,
      summary:     result.summary,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'fraud_analysis.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '14px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg2)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Logo mark */}
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="4" cy="9" r="2.5" fill="#070b12"/>
              <circle cx="14" cy="4" r="2.5" fill="#070b12"/>
              <circle cx="14" cy="14" r="2.5" fill="#070b12"/>
              <line x1="6" y1="8" x2="12" y2="5" stroke="#070b12" strokeWidth="1.5"/>
              <line x1="6" y1="10" x2="12" y2="13" stroke="#070b12" strokeWidth="1.5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 1.5 }}>RIFT 2026</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', letterSpacing: 1 }}>
              MONEY MULING DETECTION
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text-muted)',
          fontFamily: 'Space Mono, monospace',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', animation: 'pulse-ring 2s infinite' }} />
          Graph Theory / Financial Crime Track
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px' }}>

        {/* Hero */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ marginBottom: 6, fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'var(--accent)', letterSpacing: 2 }}>
            FINANCIAL CRIME DETECTION ENGINE
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.1, marginBottom: 12, letterSpacing: -1 }}>
            Follow the{' '}
            <span style={{
              color: 'transparent',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              backgroundImage: 'linear-gradient(90deg, var(--accent), var(--accent2))',
            }}>Money</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, maxWidth: 520, lineHeight: 1.6 }}>
            Upload a transaction CSV to expose money muling networks. Detects cycles, smurfing, and shell networks using graph analysis.
          </p>
        </section>

        {/* Upload */}
        <section style={{ marginBottom: 40 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : file ? '#00f5a060' : 'var(--border)'}`,
              borderRadius: 16,
              padding: '44px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? '#00f5a00a' : file ? '#00f5a005' : 'var(--bg2)',
              transition: 'all 0.2s',
              marginBottom: 16,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Corner accents */}
            {[['0','0','right','bottom'],['0','auto','right','top'],['auto','0','left','bottom'],['auto','auto','left','top']].map(([t,b,br,tl], i) => (
              <div key={i} style={{
                position: 'absolute', top: t === '0' ? 0 : 'auto', bottom: b === '0' ? 0 : 'auto',
                [tl === 'left' ? 'left' : 'right']: 0,
                width: 16, height: 16,
                borderTop: tl === 'top' ? `2px solid ${dragging ? 'var(--accent)' : 'var(--border)'}` : 'none',
                borderBottom: tl === 'bottom' ? `2px solid ${dragging ? 'var(--accent)' : 'var(--border)'}` : 'none',
                borderLeft: br === 'left' ? `2px solid ${dragging ? 'var(--accent)' : 'var(--border)'}` : 'none',
                borderRight: br === 'right' ? `2px solid ${dragging ? 'var(--accent)' : 'var(--border)'}` : 'none',
                transition: 'all 0.2s',
              }} />
            ))}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {/* Upload icon SVG */}
            <div style={{ marginBottom: 14 }}>
              {file ? (
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ margin: '0 auto' }}>
                  <circle cx="22" cy="22" r="21" stroke="var(--accent)" strokeWidth="1.5" fill="#00f5a010"/>
                  <path d="M15 22l5 5 9-9" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ margin: '0 auto', opacity: 0.7 }}>
                  <rect x="8" y="14" width="28" height="22" rx="3" stroke="var(--text-muted)" strokeWidth="1.5" fill="none"/>
                  <path d="M22 26v-8M18 21l4-4 4 4" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="14" y="8" width="8" height="1.5" rx="0.75" fill="var(--text-muted)"/>
                </svg>
              )}
            </div>

            {file ? (
              <>
                <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 15 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change file
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>
                  Drop your CSV here or click to browse
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
                  transaction_id · sender_id · receiver_id · amount · timestamp
                </div>
              </>
            )}
          </div>

          {error && (
            <div style={{
              background: '#ff475712', border: '1px solid #ff475740',
              borderRadius: 8, padding: '12px 16px', color: 'var(--danger)',
              fontSize: 13, marginBottom: 16, fontFamily: 'Space Mono, monospace',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⚠</span> {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            style={{
              background: file && !loading
                ? 'linear-gradient(135deg, var(--accent), var(--accent2))'
                : 'var(--border)',
              color: file && !loading ? '#070b12' : 'var(--text-muted)',
              border: 'none', borderRadius: 10,
              padding: '14px 40px',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800, fontSize: 15,
              cursor: file && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              display: 'inline-flex', alignItems: 'center', gap: 10,
              boxShadow: file && !loading ? '0 0 24px rgba(0,245,160,0.25)' : 'none',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 16, height: 16, border: '2px solid #070b12',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  display: 'inline-block', animation: 'spin 0.8s linear infinite',
                }} />
                Analyzing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="5" stroke="#070b12" strokeWidth="1.8"/>
                  <path d="M11 11l3 3" stroke="#070b12" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                Analyze Transactions
              </>
            )}
          </button>
        </section>

        {/* Loading state */}
        {loading && <LoadingOverlay />}

        {/* Results */}
        {result && !loading && (
          <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>

            {/* Warnings */}
            {(result.summary.shell_detection_skipped || result.graph_data?.capped) && (
              <div style={{
                background: '#ffa50212', border: '1px solid #ffa50240',
                borderRadius: 8, padding: '10px 16px', marginBottom: 20,
                color: 'var(--warning)', fontSize: 12,
                fontFamily: 'Space Mono, monospace',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                {result.summary.shell_detection_skipped && (
                  <div>⚠ Shell detection skipped — graph exceeds 2,000 nodes</div>
                )}
                {result.graph_data?.capped && (
                  <div>⚠ Showing {result.graph_data.cap_limit} of {result.summary.total_accounts_analyzed} accounts in graph (all suspicious nodes included)</div>
                )}
              </div>
            )}

            {/* Summary Stats */}
            <section style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontWeight: 800, fontSize: 20 }}>Analysis Results</h2>
                <button
                  onClick={handleDownload}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                    borderRadius: 8, padding: '8px 18px',
                    fontFamily: 'Space Mono, monospace',
                    fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#00f5a010'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Download JSON
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatCard label="Accounts Analyzed"    value={result.summary.total_accounts_analyzed}     accent="var(--accent2)"  delay={0} />
                <StatCard label="Suspicious Accounts"  value={result.summary.suspicious_accounts_flagged} accent="var(--danger)"   delay={0.05} />
                <StatCard label="Fraud Rings"          value={result.summary.fraud_rings_detected}        accent="var(--warning)"  delay={0.1} />
                <StatCard label="Processing Time"      value={`${result.summary.processing_time_seconds}s`} accent="var(--accent)" delay={0.15} />
              </div>
            </section>

            {/* Graph */}
            {result.graph_data?.nodes?.length > 0 && (
              <section style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24, marginBottom: 28,
                animation: 'fadeUp 0.5s ease 0.1s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h2 style={{ fontWeight: 800, fontSize: 18 }}>Transaction Graph</h2>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
                    hover nodes for details
                  </span>
                </div>
                <GraphCanvas graphData={result.graph_data} />
              </section>
            )}

            {/* Fraud Rings Table */}
            {result.fraud_rings.length > 0 && (
              <section style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24, marginBottom: 28,
                animation: 'fadeUp 0.5s ease 0.2s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ fontWeight: 800, fontSize: 18 }}>Fraud Ring Summary</h2>
                  <span style={{
                    background: '#ff475520', color: 'var(--danger)',
                    border: '1px solid #ff475540',
                    borderRadius: 20, padding: '2px 10px',
                    fontSize: 11, fontFamily: 'Space Mono, monospace',
                  }}>{result.fraud_rings.length} rings</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Ring ID', 'Pattern', 'Members', 'Risk Score', 'Accounts'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '10px 16px',
                            color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace',
                            fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 400,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.fraud_rings.map((ring, i) => (
                        <tr key={ring.ring_id} style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 === 0 ? 'transparent' : '#ffffff04',
                          transition: 'background 0.15s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = '#ffffff08'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#ffffff04'}
                        >
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', color: 'var(--accent)', fontSize: 12 }}>
                            {ring.ring_id}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Badge
                              label={ring.pattern_type.replace(/_/g, ' ').toUpperCase()}
                              color={patternTypeColor(ring.pattern_type)}
                            />
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
                            {ring.member_accounts.length}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 40, height: 4, background: 'var(--border)',
                                borderRadius: 2, overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${ring.risk_score}%`, height: '100%',
                                  background: scoreColor(ring.risk_score), borderRadius: 2,
                                }} />
                              </div>
                              <span style={{ color: scoreColor(ring.risk_score), fontFamily: 'Space Mono, monospace', fontWeight: 700, fontSize: 12 }}>
                                {ring.risk_score}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'Space Mono, monospace', maxWidth: 280 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ring.member_accounts.join(', ')}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Suspicious Accounts */}
            {result.suspicious_accounts.length > 0 && (
              <section style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24,
                animation: 'fadeUp 0.5s ease 0.3s both',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ fontWeight: 800, fontSize: 18 }}>Suspicious Accounts</h2>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
                    sorted by risk score
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Account ID', 'Risk Score', 'Primary Ring', 'All Rings', 'Detected Patterns'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '10px 16px',
                            color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace',
                            fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 400,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.suspicious_accounts.slice(0, 50).map((acc, i) => (
                        <tr key={acc.account_id} style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 === 0 ? 'transparent' : '#ffffff04',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = '#ffffff08'}
                          onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#ffffff04'}
                        >
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: scoreColor(acc.suspicion_score),
                                boxShadow: `0 0 6px ${scoreColor(acc.suspicion_score)}`,
                                flexShrink: 0,
                              }} />
                              {acc.account_id}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 56, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${acc.suspicion_score}%`, height: '100%',
                                  background: scoreColor(acc.suspicion_score), borderRadius: 3,
                                }} />
                              </div>
                              <span style={{ color: scoreColor(acc.suspicion_score), fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: 700 }}>
                                {acc.suspicion_score}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', color: 'var(--accent)', fontSize: 12 }}>
                            {acc.ring_id}
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 11 }}>
                            {acc.all_ring_ids?.length > 1 ? `${acc.all_ring_ids.length} rings` : '—'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {acc.detected_patterns.map(p => (
                                <Badge key={p} label={patternLabel(p)} color={patternColor(p)} />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.suspicious_accounts.length > 50 && (
                    <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'Space Mono, monospace' }}>
                      + {result.suspicious_accounts.length - 50} more accounts in downloaded JSON
                    </div>
                  )}
                </div>
              </section>
            )}

            {result.suspicious_accounts.length === 0 && (
              <div style={{
                background: '#00f5a010', border: '1px solid #00f5a040',
                borderRadius: 12, padding: 40, textAlign: 'center',
              }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>No suspicious activity detected</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                  All accounts appear to be operating normally
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
} 