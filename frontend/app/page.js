'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Dashboard from './dashboard'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ── Animated network canvas background ────────────────────────────
function NetworkBackground({ dark }) {
  const canvasRef = useRef(null)
  const stateRef  = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let W, H, raf

    function resize() {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const count = 55
    const nodes = Array.from({ length: count }, () => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r:  Math.random() * 2.2 + 0.8,
      hot: Math.random() < 0.14,
    }))
    stateRef.current = { nodes }

    function draw() {
      W = canvas.width; H = canvas.height
      ctx.clearRect(0, 0, W, H)

      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > W) n.vx *= -1
        if (n.y < 0 || n.y > H) n.vy *= -1
      })

      // edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d  = Math.sqrt(dx*dx + dy*dy)
          if (d < 150) {
            const opacity = (1 - d/150) * (dark ? 0.22 : 0.12)
            const hot = a.hot && b.hot
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = hot
              ? `rgba(255,59,92,${opacity * 1.8})`
              : dark
                ? `rgba(0,245,160,${opacity})`
                : `rgba(0,100,80,${opacity})`
            ctx.lineWidth = hot ? 1.2 : 0.7
            ctx.stroke()
          }
        }
      }

      // nodes
      nodes.forEach(n => {
        const col = n.hot
          ? (dark ? '#ff3b5c' : '#c0203a')
          : (dark ? '#00f5a0' : '#007c60')
        const alpha = dark ? 0.7 : 0.5
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = col + Math.round(alpha * 255).toString(16).padStart(2,'0')
        ctx.fill()
        if (n.hot) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2)
          ctx.strokeStyle = col + '35'
          ctx.lineWidth = 1.2
          ctx.stroke()
        }
      })

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [dark])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      width: '100%', height: '100%',
    }} />
  )
}

// ── Main upload page ───────────────────────────────────────────────
export default function Page() {
  const [dark, setDark]         = useState(true)
  const [file, setFile]         = useState(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [result, setResult]     = useState(null)
  const fileInputRef            = useRef(null)

  // ── Theme tokens ──────────────────────────────────────────────
  const T = dark ? {
    pageBg:    'linear-gradient(135deg, #020810 0%, #04080f 45%, #050a14 100%)',
    glass:     'rgba(8,14,26,0.72)',
    border:    '#112240',
    text:      '#e0eaff',
    muted:     '#4a6080',
    accent:    '#00f5a0',
    accent2:   '#00c8f5',
    danger:    '#ff3b5c',
    warning:   '#ff9500',
    heading:   '#ffffff',
    sub:       '#7a9ac0',
    btnText:   '#020810',
    toggleBg:  '#0d1828',
  } : {
    pageBg:    'linear-gradient(135deg, #ddeeff 0%, #eaf4ff 50%, #f0f8ff 100%)',
    glass:     'rgba(255,255,255,0.72)',
    border:    '#b8d4ec',
    text:      '#1a2a3a',
    muted:     '#607090',
    accent:    '#007c60',
    accent2:   '#0070b0',
    danger:    '#c0203a',
    warning:   '#b06000',
    heading:   '#061420',
    sub:       '#406080',
    btnText:   '#ffffff',
    toggleBg:  '#cce4f8',
  }

  const handleFile = f => {
    if (!f) return
    if (!f.name.endsWith('.csv')) { setError('Please upload a valid .csv file'); return }
    if (f.size > 50*1024*1024)   { setError('File too large. Max 50MB.');        return }
    setFile(f); setError(null)
  }

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0])
  }, [])

  const analyze = async () => {
    if (!file) return
    setLoading(true); setError(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch(`${API_URL}/analyze`, { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Analysis failed') }
      setResult(await res.json())
    } catch (e) {
      setError(e.message === 'Failed to fetch'
        ? 'Cannot reach backend. Make sure the API server is running on port 8000.'
        : e.message)
    } finally { setLoading(false) }
  }

  // Navigate to dashboard
  if (result) {
    return (
      <Dashboard
        result={result} file={file} dark={dark} setDark={setDark}
        onReset={() => { setResult(null); setFile(null); setError(null) }}
      />
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: T.pageBg,
      fontFamily: 'Syne, sans-serif',
      position: 'relative',
      overflow: 'hidden',
      transition: 'background 0.45s ease',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes float   { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-7px)} }
        @keyframes glowBtn { 0%,100%{box-shadow:0 0 28px ${T.accent}40} 50%{box-shadow:0 0 52px ${T.accent}70} }
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(.92)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
      `}</style>

      {/* Animated bg */}
      <NetworkBackground dark={dark} />

      {/* Subtle grain overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        opacity: dark ? 0.55 : 0.2,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='.07'/%3E%3C/svg%3E")`,
        backgroundSize: '200px',
      }} />

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: dark ? 'rgba(2,8,16,0.88)' : 'rgba(234,244,255,0.88)',
        backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
        borderBottom: `1px solid ${T.border}`,
        height: 60, padding: '0 44px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'background 0.45s ease',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg,${T.accent}22,${T.accent2}22)`,
            border: `1.5px solid ${T.accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'float 5s ease infinite',
          }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="4"  cy="10" r="2.5" fill={T.accent}  />
              <circle cx="16" cy="4"  r="2.5" fill={T.accent2} />
              <circle cx="16" cy="16" r="2.5" fill={T.accent2} />
              <circle cx="10" cy="10" r="2"   fill={T.danger}  />
              <line x1="6.2" y1="8.9"  x2="13.8" y2="5.1"  stroke={T.accent}  strokeWidth="1.3"/>
              <line x1="6.2" y1="11.1" x2="13.8" y2="14.9" stroke={T.accent2} strokeWidth="1.3"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, letterSpacing:3, color:T.heading, fontFamily:'Space Mono,monospace' }}>
              <span style={{color:T.accent}}>R</span>IFT
              <span style={{color:T.muted, fontSize:11, marginLeft:5}}>2026</span>
            </div>
            <div style={{ fontSize:8, color:T.muted, fontFamily:'Space Mono,monospace', letterSpacing:2.5 }}>
              MONEY MULING DETECTION
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{
            fontSize:10, color:T.muted, fontFamily:'Space Mono,monospace',
            display:'flex', alignItems:'center', gap:8,
          }}>
            <span style={{
              width:6, height:6, borderRadius:'50%', background:T.accent,
              display:'inline-block', animation:'blink 2.2s infinite',
              boxShadow:`0 0 8px ${T.accent}`,
            }}/>
            Graph Theory / Financial Crime Track
          </div>

          {/* Toggle */}
          <button onClick={() => setDark(d => !d)} style={{
            background: T.toggleBg,
            border: `1px solid ${T.border}`,
            borderRadius: 30, padding: '5px 14px',
            cursor: 'pointer', display: 'flex', alignItems:'center', gap:7,
            fontFamily: 'Space Mono,monospace', fontSize:10, color:T.muted,
            letterSpacing:.5, transition:'all 0.3s',
          }}>
            <span style={{fontSize:14}}>{dark ? '☀️' : '🌙'}</span>
            {dark ? 'LIGHT' : 'DARK'}
          </button>
        </div>
      </header>

      {/* ── MAIN ───────────────────────────────────────────────── */}
      <main style={{
        position: 'relative', zIndex: 10,
        minHeight: '100vh',
        display: 'flex', flexDirection:'column',
        alignItems: 'center', justifyContent:'center',
        padding: '90px 24px 60px',
      }}>

        {/* Hero */}
        <div style={{ textAlign:'center', marginBottom:52, animation:'fadeUp .7s ease both' }}>
          {/* Tag */}
          <div style={{
            display: 'inline-flex', alignItems:'center', gap:8,
            background: T.accent+'14', border:`1px solid ${T.accent}30`,
            borderRadius:20, padding:'5px 18px', marginBottom:24,
            fontSize:9, fontFamily:'Space Mono,monospace',
            color:T.accent, letterSpacing:2.5,
          }}>
            <span style={{animation:'pulse 2s infinite', fontSize:8}}>◉</span>
            FINANCIAL CRIME INTELLIGENCE SYSTEM
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize:'clamp(46px,9vw,96px)',
            fontWeight:800, lineHeight:.98,
            letterSpacing:-4, marginBottom:22,
            color:T.heading,
          }}>
            Follow the
            <br/>
            <span style={{
              color:'transparent',
              backgroundClip:'text', WebkitBackgroundClip:'text',
              backgroundImage:`linear-gradient(100deg,${T.accent} 0%,${T.accent2} 100%)`,
            }}>money.</span>
          </h1>

          <p style={{
            color:T.sub, fontSize:16, maxWidth:460, margin:'0 auto', lineHeight:1.72,
          }}>
            Upload a transaction CSV to expose hidden money muling networks.
            Detects{' '}
            <span style={{color:T.accent2, fontWeight:600}}>cycles</span>,{' '}
            <span style={{color:T.warning, fontWeight:600}}>smurfing</span>, and{' '}
            <span style={{color:T.accent, fontWeight:600}}>shell networks</span>{' '}
            using graph analysis.
          </p>
        </div>

        {/* ── UPLOAD CARD ──────────────────────────────────────── */}
        <div style={{ width:'100%', maxWidth:540, animation:'fadeUp .7s ease .1s both' }}>

          {/* Drop zone */}
          <div
            onDragOver={e=>{ e.preventDefault(); setDragging(true) }}
            onDragLeave={()=>setDragging(false)}
            onDrop={handleDrop}
            onClick={()=>fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? T.accent : file ? T.accent+'60' : T.border}`,
              borderRadius: 22,
              padding: '50px 32px',
              textAlign: 'center', cursor:'pointer',
              background: dragging ? T.accent+'0d' : file ? T.accent+'07' : T.glass,
              backdropFilter: 'blur(20px)', WebkitBackdropFilter:'blur(20px)',
              transition: 'all 0.25s',
              marginBottom: 14,
              position: 'relative', overflow:'hidden',
              boxShadow: dragging
                ? `0 0 70px ${T.accent}22`
                : dark ? '0 12px 50px rgba(0,0,0,.55)' : '0 8px 40px rgba(0,80,160,.1)',
            }}
          >
            {/* Corner brackets */}
            {[
              {t:0,l:0,bt:true,bl:true},{t:0,r:0,bt:true,br:true},
              {b:0,l:0,bb:true,bl:true},{b:0,r:0,bb:true,br:true},
            ].map((c,i)=>(
              <div key={i} style={{
                position:'absolute',
                top:    c.t!==undefined?c.t:'auto', bottom:c.b!==undefined?c.b:'auto',
                left:   c.l!==undefined?c.l:'auto', right: c.r!==undefined?c.r:'auto',
                width:14, height:14,
                borderTop:    c.bt?`2px solid ${dragging?T.accent:T.border}`:'none',
                borderBottom: c.bb?`2px solid ${dragging?T.accent:T.border}`:'none',
                borderLeft:   c.bl?`2px solid ${dragging?T.accent:T.border}`:'none',
                borderRight:  c.br?`2px solid ${dragging?T.accent:T.border}`:'none',
                transition:'all 0.2s',
              }}/>
            ))}

            <input ref={fileInputRef} type="file" accept=".csv" style={{display:'none'}}
              onChange={e=>handleFile(e.target.files[0])}/>

            {/* Icon */}
            <div style={{marginBottom:18}}>
              {file ? (
                <div style={{
                  width:68, height:68, margin:'0 auto', borderRadius:'50%',
                  background:`radial-gradient(circle,${T.accent}35,${T.accent}0e)`,
                  border:`2px solid ${T.accent}70`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:28, animation:'float 3.5s ease infinite',
                  color:T.accent,
                }}>✓</div>
              ) : (
                <div style={{
                  width:68, height:68, margin:'0 auto', borderRadius:'50%',
                  background:dark?'rgba(0,245,160,0.07)':'rgba(0,124,96,0.07)',
                  border:`1.5px solid ${T.border}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  animation:'float 5s ease infinite',
                }}>
                  <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <rect x="4" y="11" width="22" height="17" rx="3" stroke={T.muted} strokeWidth="1.5" fill="none"/>
                    <path d="M15 19v-8M11 14l4-4 4 4" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="10" y="4" width="7" height="1.4" rx=".7" fill={T.muted}/>
                  </svg>
                </div>
              )}
            </div>

            {file ? (
              <>
                <div style={{fontWeight:700, color:T.accent, fontSize:16, marginBottom:6}}>
                  {file.name}
                </div>
                <div style={{fontSize:11, color:T.muted, fontFamily:'Space Mono,monospace'}}>
                  {(file.size/1024).toFixed(1)} KB · Click to change file
                </div>
              </>
            ) : (
              <>
                <div style={{fontWeight:700, fontSize:16, color:T.text, marginBottom:8}}>
                  Drop your CSV here or click to browse
                </div>
                <div style={{fontSize:10, color:T.muted, fontFamily:'Space Mono,monospace', letterSpacing:.5}}>
                  transaction_id · sender_id · receiver_id · amount · timestamp
                </div>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background:T.danger+'12', border:`1px solid ${T.danger}40`,
              borderRadius:10, padding:'11px 16px', color:T.danger,
              fontSize:11, fontFamily:'Space Mono,monospace',
              display:'flex', alignItems:'center', gap:10, marginBottom:14,
              animation:'fadeUp .3s ease',
            }}>
              <span>⚠</span> {error}
            </div>
          )}

          {/* CTA Button */}
          <button
            onClick={analyze}
            disabled={!file || loading}
            style={{
              width:'100%',
              background: file && !loading
                ? `linear-gradient(135deg,${T.accent} 0%,${T.accent2} 100%)`
                : T.border,
              color: file && !loading ? T.btnText : T.muted,
              border:'none', borderRadius:14,
              padding:'17px',
              fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:16,
              cursor: file && !loading ? 'pointer' : 'not-allowed',
              display:'flex', alignItems:'center', justifyContent:'center', gap:12,
              boxShadow: file && !loading ? `0 0 36px ${T.accent}38` : 'none',
              transition:'all 0.2s',
              animation: file && !loading ? 'glowBtn 2.5s infinite' : 'none',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width:16, height:16,
                  border:`2.5px solid ${T.btnText}`,
                  borderTopColor:'transparent',
                  borderRadius:'50%', display:'inline-block',
                  animation:'spin .8s linear infinite',
                }}/>
                Analyzing Transactions...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="8" cy="8" r="5.5" stroke={file?T.btnText:T.muted} strokeWidth="1.8"/>
                  <path d="M12.5 12.5l3.5 3.5" stroke={file?T.btnText:T.muted} strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                Analyze Transactions
              </>
            )}
          </button>

          {/* Feature pills */}
          <div style={{display:'flex', gap:10, justifyContent:'center', marginTop:26, flexWrap:'wrap'}}>
            {[
              {label:'Cycle Detection', color:T.accent2},
              {label:'Smurfing',        color:T.warning},
              {label:'Shell Networks',  color:T.accent},
            ].map(({label,color})=>(
              <div key={label} style={{
                background:color+'13', border:`1px solid ${color}30`,
                borderRadius:20, padding:'5px 14px',
                fontSize:10, fontFamily:'Space Mono,monospace',
                color, letterSpacing:.5,
                display:'flex', alignItems:'center', gap:6,
              }}>
                <span style={{width:5,height:5,borderRadius:'50%',background:color,display:'inline-block'}}/>
                {label}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer label */}
      <div style={{
        position:'fixed', bottom:18, left:0, right:0, zIndex:10,
        textAlign:'center', fontSize:8, color:T.muted,
        fontFamily:'Space Mono,monospace', letterSpacing:2.5,
      }}>
        RIFT 2026 · GRAPH THEORY / FINANCIAL CRIME TRACK
      </div>
    </div>
  )
} 