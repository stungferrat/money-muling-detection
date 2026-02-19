'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ─── colour helpers ───────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 90) return '#ff4757'
  if (score >= 75) return '#ff6b35'
  if (score >= 60) return '#ffa502'
  if (score >= 40) return '#f9ca24'
  return '#00f5a0'
}

// FIXED: complete pattern label map matching all backend-generated pattern keys
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
  }
  return map[p] || p.replace(/_/g, ' ')
}

function patternColor(p) {
  if (p.startsWith('cycle'))   return '#00c8f5'
  if (p.startsWith('fan_in'))  return '#ffa502'
  if (p.startsWith('fan_out')) return '#a78bfa'
  return '#64748b'
}

// ─── tiny components ──────────────────────────────────────────────
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

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || 'var(--accent)', fontFamily: 'Space Mono, monospace' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  )
}

// ─── Graph Visualiser ─────────────────────────────────────────────
function GraphCanvas({ graphData }) {
  const canvasRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const nodesRef = useRef([])

  useEffect(() => {
    if (!graphData || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height

    const { nodes, edges } = graphData
    if (!nodes.length) return

    const nodeMap = {}
    const positions = nodes.map((n, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI
      const r = Math.min(W, H) * 0.35
      const x = W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 60
      const y = H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 60
      nodeMap[n.id] = i
      return { x, y, ...n }
    })

    for (let iter = 0; iter < 30; iter++) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x
          const dy = positions[i].y - positions[j].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < 80) {
            const force = (80 - dist) / 80 * 2
            positions[i].x += (dx / dist) * force
            positions[i].y += (dy / dist) * force
            positions[j].x -= (dx / dist) * force
            positions[j].y -= (dy / dist) * force
          }
        }
      }
    }

    positions.forEach(p => {
      p.x = Math.max(20, Math.min(W - 20, p.x))
      p.y = Math.max(20, Math.min(H - 20, p.y))
    })

    nodesRef.current = positions

    ctx.clearRect(0, 0, W, H)

    // Grid background
    ctx.strokeStyle = '#1e2d4530'
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
      const isSuspicious = s.suspicious && t.suspicious
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.strokeStyle = isSuspicious ? '#ff475740' : '#1e2d4580'
      ctx.lineWidth = isSuspicious ? 1.5 : 0.8
      ctx.stroke()

      const angle = Math.atan2(t.y - s.y, t.x - s.x)
      const al = 8
      ctx.beginPath()
      ctx.moveTo(t.x, t.y)
      ctx.lineTo(t.x - al * Math.cos(angle - 0.4), t.y - al * Math.sin(angle - 0.4))
      ctx.lineTo(t.x - al * Math.cos(angle + 0.4), t.y - al * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fillStyle = isSuspicious ? '#ff475760' : '#1e2d4590'
      ctx.fill()
    })

    // Nodes
    positions.forEach(n => {
      const r = n.suspicious ? 8 : 5
      const color = n.suspicious ? scoreColor(n.suspicion_score) : '#1e3a5f'

      if (n.suspicious) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2)
        ctx.fillStyle = color + '20'
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = n.suspicious ? color : '#1e2d45'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

  }, [graphData])

  function handleMouseMove(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const hit = nodesRef.current.find(n => {
      const dx = n.x - mx; const dy = n.y - my
      return Math.sqrt(dx * dx + dy * dy) < 12
    })
    setTooltip(hit ? { x: e.clientX, y: e.clientY, node: hit } : null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={500}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        style={{ width: '100%', borderRadius: 8, cursor: 'crosshair', background: 'var(--bg)' }}
      />
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 12,
          top: tooltip.y - 10,
          background: '#0d1420',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          fontFamily: 'Space Mono, monospace',
          zIndex: 100,
          pointerEvents: 'none',
          maxWidth: 220,
        }}>
          <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 4 }}>{tooltip.node.id}</div>
          {tooltip.node.suspicious ? (
            <>
              <div style={{ color: scoreColor(tooltip.node.suspicion_score) }}>
                Score: {tooltip.node.suspicion_score}
              </div>
              <div style={{ color: 'var(--danger)', fontSize: 10, marginTop: 2 }}>⚠ SUSPICIOUS</div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>Clean account</div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)' }}>
        <span><span style={{ color: '#ff4757' }}>●</span> Critical (90+)</span>
        <span><span style={{ color: '#ff6b35' }}>●</span> High (75-89)</span>
        <span><span style={{ color: '#ffa502' }}>●</span> Medium (60-74)</span>
        <span><span style={{ color: '#f9ca24' }}>●</span> Low (40-59)</span>
        <span><span style={{ color: '#1e3a5f' }}>●</span> Clean</span>
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
    if (f && f.name.endsWith('.csv')) {
      setFile(f); setError(null); setResult(null)
    } else {
      setError('Please upload a valid .csv file')
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const handleAnalyze = async () => {
    if (!file) return
    setLoading(true); setError(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`${API_URL}/analyze`, { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Analysis failed')
      }
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Download only the fields required by the hackathon spec
  const handleDownload = () => {
    if (!result) return
    const exportData = {
      suspicious_accounts: result.suspicious_accounts.map(a => ({
        account_id:       a.account_id,
        suspicion_score:  a.suspicion_score,
        detected_patterns: a.detected_patterns,
        ring_id:          a.ring_id,
      })),
      fraud_rings: result.fraud_rings,
      summary:     result.summary,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = 'fraud_analysis.json'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '16px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'var(--accent)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🔍</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>RIFT 2026</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
              MONEY MULING DETECTION ENGINE
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
          Graph Theory / Financial Crime Track
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        {/* Upload Section */}
        <section style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
            Follow the{' '}
            <span style={{ color: 'var(--accent)' }}>Money</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 14 }}>
            Upload a transaction CSV to expose money muling networks through graph analysis.
          </p>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : file ? '#00f5a060' : 'var(--border)'}`,
              borderRadius: 16,
              padding: '48px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? '#00f5a008' : file ? '#00f5a005' : 'var(--bg2)',
              transition: 'all 0.2s',
              marginBottom: 16,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {file ? '✅' : '📂'}
            </div>
            {file ? (
              <>
                <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{file.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB — Click to change
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop your CSV here or click to browse</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Required columns: transaction_id, sender_id, receiver_id, amount, timestamp
                </div>
              </>
            )}
          </div>

          {error && (
            <div style={{
              background: '#ff475715', border: '1px solid #ff475740',
              borderRadius: 8, padding: '12px 16px',
              color: 'var(--danger)', fontSize: 13, marginBottom: 16,
              fontFamily: 'Space Mono, monospace',
            }}>⚠ {error}</div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            style={{
              background: file && !loading ? 'var(--accent)' : 'var(--border)',
              color: file && !loading ? '#070b12' : 'var(--text-muted)',
              border: 'none', borderRadius: 10,
              padding: '14px 36px',
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800, fontSize: 15,
              cursor: file && !loading ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 10,
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
            ) : '🔎 Analyze Transactions'}
          </button>
        </section>

        {/* Results */}
        {result && (
          <div style={{ animation: 'fadeUp 0.5s ease forwards' }}>

            {/* Warnings */}
            {(result.summary.shell_detection_skipped || result.graph_data?.capped) && (
              <div style={{
                background: '#ffa50215', border: '1px solid #ffa50240',
                borderRadius: 8, padding: '10px 16px', marginBottom: 20,
                color: 'var(--warning)', fontSize: 12,
                fontFamily: 'Space Mono, monospace', display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                {result.summary.shell_detection_skipped && (
                  <div>⚠ Shell network detection was skipped (graph too large — &gt;2000 nodes)</div>
                )}
                {result.graph_data?.capped && (
                  <div>⚠ Graph visualization shows {result.graph_data.cap_limit} of {result.summary.total_accounts_analyzed} accounts (all suspicious nodes are included)</div>
                )}
              </div>
            )}

            {/* Summary Stats */}
            <section style={{ marginBottom: 36 }}>
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
                  }}
                >⬇ Download JSON</button>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatCard label="Accounts Analyzed"    value={result.summary.total_accounts_analyzed}    accent="var(--accent2)" />
                <StatCard label="Suspicious Accounts"  value={result.summary.suspicious_accounts_flagged} accent="var(--danger)" />
                <StatCard label="Fraud Rings Detected" value={result.summary.fraud_rings_detected}        accent="var(--warning)" />
                <StatCard label="Processing Time"      value={`${result.summary.processing_time_seconds}s`} accent="var(--accent)" />
              </div>
            </section>

            {/* Graph */}
            {result.graph_data && result.graph_data.nodes.length > 0 && (
              <section style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24, marginBottom: 36,
              }}>
                <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
                  Transaction Graph
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', marginLeft: 12, fontWeight: 400 }}>
                    hover nodes for details
                  </span>
                </h2>
                <GraphCanvas graphData={result.graph_data} />
              </section>
            )}

            {/* Fraud Rings Table */}
            {result.fraud_rings.length > 0 && (
              <section style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24, marginBottom: 36,
              }}>
                <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
                  Fraud Ring Summary
                  <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'Space Mono, monospace', marginLeft: 12, fontWeight: 400 }}>
                    {result.fraud_rings.length} rings detected
                  </span>
                </h2>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Ring ID', 'Pattern Type', 'Members', 'Risk Score', 'Account IDs'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '10px 16px',
                            color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace',
                            fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.fraud_rings.map((ring, i) => (
                        <tr key={ring.ring_id} style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 === 0 ? 'transparent' : '#ffffff05',
                        }}>
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', color: 'var(--accent)', fontSize: 12 }}>
                            {ring.ring_id}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Badge
                              label={ring.pattern_type.replace(/_/g, ' ').toUpperCase()}
                              color={ring.pattern_type.includes('cycle') ? '#00c8f5' : ring.pattern_type.includes('smurf') ? '#ffa502' : '#a78bfa'}
                            />
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
                            {ring.member_accounts.length}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ color: scoreColor(ring.risk_score), fontFamily: 'Space Mono, monospace', fontWeight: 700 }}>
                              {ring.risk_score}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'Space Mono, monospace', maxWidth: 300 }}>
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

            {/* Suspicious Accounts Table */}
            {result.suspicious_accounts.length > 0 && (
              <section style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: 16, padding: 24,
              }}>
                <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
                  Suspicious Accounts
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', marginLeft: 12, fontWeight: 400 }}>
                    sorted by suspicion score
                  </span>
                </h2>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['Account ID', 'Score', 'Primary Ring', 'All Rings', 'Detected Patterns'].map(h => (
                          <th key={h} style={{
                            textAlign: 'left', padding: '10px 16px',
                            color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace',
                            fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.suspicious_accounts.slice(0, 50).map((acc, i) => (
                        <tr key={acc.account_id} style={{
                          borderBottom: '1px solid var(--border)',
                          background: i % 2 === 0 ? 'transparent' : '#ffffff05',
                        }}>
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>
                            {acc.account_id}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden',
                              }}>
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
                          {/* FIXED: show all rings this account belongs to */}
                          <td style={{ padding: '12px 16px', fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 11 }}>
                            {acc.all_ring_ids && acc.all_ring_ids.length > 1
                              ? `${acc.all_ring_ids.length} rings`
                              : '—'}
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
                      + {result.suspicious_accounts.length - 50} more accounts in the downloaded JSON
                    </div>
                  )}
                </div>
              </section>
            )}

            {result.suspicious_accounts.length === 0 && (
              <div style={{
                background: '#00f5a010', border: '1px solid #00f5a040',
                borderRadius: 12, padding: 32, textAlign: 'center',
                color: 'var(--accent)',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 700 }}>No suspicious activity detected</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
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