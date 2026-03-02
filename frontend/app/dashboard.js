'use client'

import { useState, useRef, useEffect } from 'react'

// ── helpers ────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 90) return '#ff3b5c'
  if (s >= 75) return '#ff6a00'
  if (s >= 60) return '#ff9500'
  if (s >= 40) return '#f5d020'
  return '#00f5a0'
}

function patternLabel(p) {
  const m = {
    cycle_length_3:'Cycle ×3',cycle_length_4:'Cycle ×4',cycle_length_5:'Cycle ×5',
    fan_in:'Fan-In',fan_in_temporal:'Fan-In (72h)',fan_in_hub:'Fan-In Hub',
    fan_in_hub_temporal:'Fan-In Hub (72h)',fan_in_leaf:'Fan-In Leaf',
    fan_in_leaf_temporal:'Fan-In Leaf (72h)',fan_out:'Fan-Out',
    fan_out_temporal:'Fan-Out (72h)',fan_out_hub:'Fan-Out Hub',
    fan_out_hub_temporal:'Fan-Out Hub (72h)',fan_out_leaf:'Fan-Out Leaf',
    fan_out_leaf_temporal:'Fan-Out Leaf (72h)',
    layered_shell_network:'Shell Network',shell_chain_3_hops:'Shell 3-Hop',shell_chain_4_hops:'Shell 4-Hop',
  }
  return m[p] || p.replace(/_/g,' ')
}

function patternColor(p, dark) {
  if (p.startsWith('cycle'))   return dark?'#00c8f5':'#0070b0'
  if (p.startsWith('fan_in'))  return dark?'#ff9500':'#b06000'
  if (p.startsWith('fan_out')) return dark?'#a78bfa':'#6040c0'
  if (p.startsWith('shell')||p.startsWith('layered')) return dark?'#00f5a0':'#007c60'
  return dark?'#4a6080':'#6080a0'
}

function patternTypeColor(pt, dark) {
  if (pt.includes('cycle'))  return dark?'#00c8f5':'#0070b0'
  if (pt.includes('smurf'))  return dark?'#ff9500':'#b06000'
  if (pt.includes('shell')||pt.includes('layered')) return dark?'#00f5a0':'#007c60'
  return dark?'#4a6080':'#6080a0'
}

// ── Badge ─────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      background:color+'18',color,border:`1px solid ${color}40`,
      borderRadius:4,padding:'2px 8px',
      fontSize:10,fontFamily:'Space Mono,monospace',
      whiteSpace:'nowrap',letterSpacing:.5,
    }}>{label}</span>
  )
}

// ── Graph Canvas ──────────────────────────────────────────────────
function GraphCanvas({ graphData, dark }) {
  const canvasRef    = useRef(null)
  const nodesRef     = useRef([])
  const animFrameRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  const dimmed  = dark ? '#1e3a5f' : '#b0ccee'
  const edgeDim = dark ? '#112240' : '#c8dff0'

  useEffect(() => {
    if (!graphData||!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    const { nodes, edges } = graphData
    if (!nodes.length) return
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    const nodeMap = {}
    nodes.forEach((n,i) => { nodeMap[n.id] = i })
    const suspicious = nodes.filter(n=>n.suspicious)
    const clean      = nodes.filter(n=>!n.suspicious)
    const pos = []

    suspicious.forEach((n,i) => {
      const a=(i/Math.max(suspicious.length,1))*Math.PI*2, r=Math.min(W,H)*.18
      pos[nodeMap[n.id]]={x:W/2+r*Math.cos(a)+(Math.random()-.5)*30,y:H/2+r*Math.sin(a)+(Math.random()-.5)*30,vx:0,vy:0,...n}
    })
    clean.forEach((n,i) => {
      const a=(i/Math.max(clean.length,1))*Math.PI*2, r=Math.min(W,H)*.38
      pos[nodeMap[n.id]]={x:W/2+r*Math.cos(a)+(Math.random()-.5)*40,y:H/2+r*Math.sin(a)+(Math.random()-.5)*40,vx:0,vy:0,...n}
    })

    let iter=0; const MAX=130, PAD=55

    function draw() {
      ctx.clearRect(0,0,W,H)
      const bg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*.75)
      bg.addColorStop(0,dark?'#07101f':'#eaf4ff')
      bg.addColorStop(1,dark?'#030610':'#d8ecff')
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H)
      // dot grid
      ctx.fillStyle=dark?'#112240':'#c0d8f0'
      for(let x=0;x<W;x+=36) for(let y=0;y<H;y+=36){
        ctx.beginPath(); ctx.arc(x,y,.7,0,Math.PI*2); ctx.fill()
      }
      // edges
      edges.forEach(e=>{
        const si=nodeMap[e.source],ti=nodeMap[e.target]
        if(si===undefined||ti===undefined) return
        const s=pos[si],t=pos[ti]; if(!s||!t) return
        const susp=s.suspicious&&t.suspicious
        if(susp){
          const g=ctx.createLinearGradient(s.x,s.y,t.x,t.y)
          g.addColorStop(0,'#ff3b5c00'); g.addColorStop(.5,'#ff3b5c70'); g.addColorStop(1,'#ff3b5c00')
          ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(t.x,t.y)
          ctx.strokeStyle=g; ctx.lineWidth=1.5; ctx.stroke()
          const ang=Math.atan2(t.y-s.y,t.x-s.x),al=7
          ctx.beginPath(); ctx.moveTo(t.x,t.y)
          ctx.lineTo(t.x-al*Math.cos(ang-.4),t.y-al*Math.sin(ang-.4))
          ctx.lineTo(t.x-al*Math.cos(ang+.4),t.y-al*Math.sin(ang+.4))
          ctx.closePath(); ctx.fillStyle='#ff3b5c'; ctx.fill()
        } else {
          ctx.beginPath(); ctx.moveTo(s.x,s.y); ctx.lineTo(t.x,t.y)
          ctx.strokeStyle=edgeDim; ctx.lineWidth=.6; ctx.stroke()
        }
      })
      // nodes
      pos.forEach(n=>{
        if(!n) return
        const r=n.suspicious?9:4, col=n.suspicious?scoreColor(n.suspicion_score):dimmed
        if(n.suspicious){
          const glow=ctx.createRadialGradient(n.x,n.y,r,n.x,n.y,r+14)
          glow.addColorStop(0,col+'50'); glow.addColorStop(1,col+'00')
          ctx.beginPath(); ctx.arc(n.x,n.y,r+14,0,Math.PI*2); ctx.fillStyle=glow; ctx.fill()
          const inn=ctx.createRadialGradient(n.x-2,n.y-2,0,n.x,n.y,r)
          inn.addColorStop(0,col+'ff'); inn.addColorStop(1,col+'88')
          ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2); ctx.fillStyle=inn; ctx.fill()
          ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.stroke()
        } else {
          ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2)
          ctx.fillStyle=dark?'#0c1423':'#dceeff'; ctx.fill()
          ctx.strokeStyle=edgeDim; ctx.lineWidth=1; ctx.stroke()
        }
      })
    }

    function simulate() {
      if(iter>=MAX){ nodesRef.current=pos; draw(); return }
      const cool=Math.max(.1,1-iter/MAX)
      pos.forEach(p=>{p.vx=0;p.vy=0})
      for(let i=0;i<pos.length;i++) for(let j=i+1;j<pos.length;j++){
        const dx=pos[i].x-pos[j].x,dy=pos[i].y-pos[j].y
        const d2=dx*dx+dy*dy||.01,d=Math.sqrt(d2),f=1900/d2
        const fx=(dx/d)*f,fy=(dy/d)*f
        pos[i].vx+=fx;pos[i].vy+=fy;pos[j].vx-=fx;pos[j].vy-=fy
      }
      edges.forEach(e=>{
        const si=nodeMap[e.source],ti=nodeMap[e.target]
        if(si===undefined||ti===undefined) return
        const dx=pos[ti].x-pos[si].x,dy=pos[ti].y-pos[si].y
        const d=Math.sqrt(dx*dx+dy*dy)||.1,f=d*.03
        pos[si].vx+=(dx/d)*f;pos[si].vy+=(dy/d)*f
        pos[ti].vx-=(dx/d)*f;pos[ti].vy-=(dy/d)*f
      })
      pos.forEach(p=>{
        p.vx+=(W/2-p.x)*.008; p.vy+=(H/2-p.y)*.008
        const sp=Math.sqrt(p.vx*p.vx+p.vy*p.vy)||1
        const sc=Math.min(sp,12*cool)/sp
        p.x+=p.vx*sc; p.y+=p.vy*sc
        if(p.x<PAD){p.x=PAD;p.vx*=-.3} if(p.x>W-PAD){p.x=W-PAD;p.vx*=-.3}
        if(p.y<PAD){p.y=PAD;p.vy*=-.3} if(p.y>H-PAD){p.y=H-PAD;p.vy*=-.3}
      })
      iter++; nodesRef.current=pos; draw()
      animFrameRef.current=requestAnimationFrame(simulate)
    }
    animFrameRef.current=requestAnimationFrame(simulate)
    return ()=>{if(animFrameRef.current) cancelAnimationFrame(animFrameRef.current)}
  }, [graphData, dark])

  function onMouseMove(e) {
    const c=canvasRef.current; if(!c) return
    const rect=c.getBoundingClientRect()
    const sx=c.width/rect.width,sy=c.height/rect.height
    const mx=(e.clientX-rect.left)*sx,my=(e.clientY-rect.top)*sy
    const hit=nodesRef.current.find(n=>{
      if(!n) return false
      const dx=n.x-mx,dy=n.y-my; return Math.sqrt(dx*dx+dy*dy)<14
    })
    setTooltip(hit?{x:e.clientX,y:e.clientY,node:hit}:null)
  }

  const bord = dark?'#112240':'#c8dff0'
  const mut  = dark?'#4a6080':'#6080a0'
  const tbg  = dark?'rgba(5,10,18,.97)':'rgba(238,246,255,.97)'

  return (
    <div style={{position:'relative',width:'100%',height:'100%',display:'flex',flexDirection:'column'}}>
      <canvas ref={canvasRef} width={900} height={500}
        onMouseMove={onMouseMove} onMouseLeave={()=>setTooltip(null)}
        style={{width:'100%',flex:1,borderRadius:14,cursor:'crosshair',display:'block',minHeight:0}}
      />

      {/* Legend */}
      <div style={{display:'flex',gap:16,marginTop:12,flexWrap:'wrap',
        fontSize:10,fontFamily:'Space Mono,monospace',color:mut,alignItems:'center',flexShrink:0}}>
        {[
          {col:'#ff3b5c',l:'Critical 90+'},{col:'#ff6a00',l:'High 75–89'},
          {col:'#ff9500',l:'Medium 60–74'},{col:'#f5d020',l:'Low 40–59'},
          {col:dimmed,l:'Clean'},
        ].map(({col,l})=>(
          <span key={l} style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:col,display:'inline-block',
              boxShadow:col!==dimmed?`0 0 6px ${col}`:'none'}}/>
            {l}
          </span>
        ))}
        <span style={{marginLeft:'auto',fontSize:9,color:mut+'80',letterSpacing:1}}>
          hover · drag · scroll to zoom
        </span>
      </div>

      {/* Tooltip */}
      {tooltip&&(()=>{
        const s=tooltip.node.suspicion_score
        const col=tooltip.node.suspicious?scoreColor(s):(dark?'#00f5a0':'#007c60')
        return (
          <div style={{
            position:'fixed',left:tooltip.x+14,top:tooltip.y-10,
            background:tbg,backdropFilter:'blur(14px)',
            border:`1px solid ${tooltip.node.suspicious?col+'60':bord}`,
            borderRadius:12,padding:'12px 16px',fontSize:12,
            fontFamily:'Space Mono,monospace',zIndex:9999,pointerEvents:'none',maxWidth:220,
            boxShadow:tooltip.node.suspicious?`0 0 28px ${col}22,0 8px 24px rgba(0,0,0,.5)`:'0 8px 24px rgba(0,0,0,.4)',
          }}>
            <div style={{color:col,fontWeight:700,marginBottom:8,paddingBottom:8,
              borderBottom:`1px solid ${bord}`,wordBreak:'break-all',fontSize:11}}>
              {tooltip.node.id}
            </div>
            {tooltip.node.suspicious?(
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{color:mut,fontSize:9,textTransform:'uppercase',letterSpacing:1.5}}>Risk Score</span>
                  <span style={{color:col,fontWeight:700,fontSize:22,textShadow:`0 0 14px ${col}80`}}>{s}</span>
                </div>
                <div style={{height:3,background:bord,borderRadius:2,overflow:'hidden',marginBottom:10}}>
                  <div style={{width:`${s}%`,height:'100%',background:`linear-gradient(90deg,${col}80,${col})`,boxShadow:`0 0 6px ${col}`}}/>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6,color:'#ff3b5c',fontSize:9,letterSpacing:1.5}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:'#ff3b5c',display:'inline-block',animation:'blink 1.2s infinite'}}/>
                  FLAGGED — SUSPICIOUS
                </div>
              </>
            ):(
              <div style={{color:mut,fontSize:11}}>Clean account — no suspicious patterns.</div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────
export default function Dashboard({ result, file, dark, setDark, onReset }) {
  const [activeTab, setActiveTab] = useState('rings')
  const [showAll,   setShowAll]   = useState(false)

  const graphData = showAll
    ? { nodes: result.graph_data.full_nodes, edges: result.graph_data.full_edges,   capped: result.graph_data.capped, cap_limit: result.graph_data.cap_limit }
    : { nodes: result.graph_data.nodes,      edges: result.graph_data.edges,         capped: result.graph_data.capped, cap_limit: result.graph_data.cap_limit }

  const T = dark ? {
    bg:       '#04080f',
    bg2:      '#060b14',
    card:     '#0a111e',
    border:   '#112240',
    text:     '#e0eaff',
    muted:    '#4a6080',
    accent:   '#00f5a0',
    accent2:  '#00c8f5',
    danger:   '#ff3b5c',
    warning:  '#ff9500',
    purple:   '#a78bfa',
    heading:  '#ffffff',
    sub:      '#7a9ac0',
    header:   'rgba(4,8,15,0.96)',
    panelBg:  '#080e1a',
    rowAlt:   '#ffffff04',
    toggleBg: '#0d1828',
  } : {
    bg:       '#eef6ff',
    bg2:      '#f4f9ff',
    card:     '#ffffff',
    border:   '#c8dff0',
    text:     '#1a2a3a',
    muted:    '#6080a0',
    accent:   '#007c60',
    accent2:  '#0070b0',
    danger:   '#c0203a',
    warning:  '#b06000',
    purple:   '#6040c0',
    heading:  '#061420',
    sub:      '#406080',
    header:   'rgba(234,244,255,0.96)',
    panelBg:  '#f0f8ff',
    rowAlt:   '#00000003',
    toggleBg: '#cce4f8',
  }

  const sc  = s  => scoreColor(s)
  const pc  = p  => patternColor(p, dark)
  const ptc = pt => patternTypeColor(pt, dark)

  // Pattern breakdown
  const patternCounts = result.fraud_rings.reduce((acc,r)=>{
    const l=r.pattern_type.includes('cycle')?'Cycles':r.pattern_type.includes('smurf')?'Smurfing':'Shell Networks'
    acc[l]=(acc[l]||0)+1; return acc
  },{})
  const totalRings = result.fraud_rings.length
  const patternColors = { Cycles:T.accent2, Smurfing:T.warning, 'Shell Networks':T.accent }
  const patternIcons  = { Cycles:'⟳', Smurfing:'⇄', 'Shell Networks':'◈' }

  function downloadJSON() {
    const blob=new Blob([JSON.stringify({
      suspicious_accounts:result.suspicious_accounts.map(a=>({
        account_id:a.account_id,suspicion_score:a.suspicion_score,
        detected_patterns:a.detected_patterns,ring_id:a.ring_id,
      })),
      fraud_rings:result.fraud_rings,summary:result.summary,
    },null,2)],{type:'application/json'})
    const url=URL.createObjectURL(blob),a=document.createElement('a')
    a.href=url;a.download='rift_analysis.json';a.click();URL.revokeObjectURL(url)
  }

  return (
    <div style={{
      minHeight:'100vh',background:T.bg,color:T.text,
      fontFamily:'Syne,sans-serif',transition:'background 0.35s,color 0.35s',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${T.bg2}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        ::selection{background:${T.accent}28;color:${T.accent}}
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header style={{
        position:'sticky',top:0,zIndex:300,
        background:T.header,backdropFilter:'blur(28px)',WebkitBackdropFilter:'blur(28px)',
        borderBottom:`1px solid ${T.border}`,
        height:60,padding:'0 28px',
        display:'flex',alignItems:'center',justifyContent:'space-between',
        transition:'background 0.35s',
      }}>
        {/* Logo */}
        <div style={{display:'flex',alignItems:'center',gap:13}}>
          <div style={{
            width:36,height:36,borderRadius:10,
            background:`linear-gradient(135deg,${T.accent}22,${T.accent2}22)`,
            border:`1.5px solid ${T.accent}55`,
            display:'flex',alignItems:'center',justifyContent:'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="4"  cy="10" r="2.5" fill={T.accent}/>
              <circle cx="16" cy="4"  r="2.5" fill={T.accent2}/>
              <circle cx="16" cy="16" r="2.5" fill={T.accent2}/>
              <circle cx="10" cy="10" r="2"   fill={T.danger}/>
              <line x1="6.2" y1="8.9"  x2="13.8" y2="5.1"  stroke={T.accent}  strokeWidth="1.3"/>
              <line x1="6.2" y1="11.1" x2="13.8" y2="14.9" stroke={T.accent2} strokeWidth="1.3"/>
            </svg>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:15,letterSpacing:3,color:T.heading,fontFamily:'Space Mono,monospace'}}>
              <span style={{color:T.accent}}>R</span>IFT
              <span style={{color:T.muted,fontSize:11,marginLeft:5}}>2026</span>
            </div>
            <div style={{fontSize:8,color:T.muted,fontFamily:'Space Mono,monospace',letterSpacing:2.5}}>
              MONEY MULING DETECTION
            </div>
          </div>
        </div>

        {/* Right controls */}
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {/* Ring count */}
          <div style={{
            display:'flex',alignItems:'center',gap:8,
            background:T.danger+'15',border:`1px solid ${T.danger}40`,
            borderRadius:20,padding:'5px 14px',
            fontSize:11,fontFamily:'Space Mono,monospace',color:T.danger,
          }}>
            <span style={{width:6,height:6,borderRadius:'50%',background:T.danger,display:'inline-block',
              animation:'blink 1.5s infinite',boxShadow:`0 0 8px ${T.danger}`}}/>
            {result.summary.fraud_rings_detected} RINGS DETECTED
          </div>

          {/* Add new file */}
          <button onClick={onReset} style={{
            background:'transparent',color:T.muted,
            border:`1px solid ${T.border}`,borderRadius:8,
            padding:'6px 14px',fontFamily:'Space Mono,monospace',
            fontSize:10,cursor:'pointer',letterSpacing:.5,
            display:'flex',alignItems:'center',gap:7,transition:'all 0.2s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.muted}}
          >
            + Add New File
          </button>

          {/* Analyze (re-run) — just reset */}
          <button onClick={onReset} style={{
            background:`linear-gradient(135deg,${T.accent},${T.accent2})`,
            color:'#020810',border:'none',borderRadius:8,
            padding:'6px 18px',fontFamily:'Space Mono,monospace',
            fontSize:11,cursor:'pointer',fontWeight:700,letterSpacing:.5,
            display:'flex',alignItems:'center',gap:7,
          }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="#020810" strokeWidth="1.6"/>
              <path d="M9.5 9.5l3 3" stroke="#020810" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            Analyze
          </button>

          {/* Download */}
          <button onClick={downloadJSON} style={{
            background:'transparent',color:T.accent,
            border:`1px solid ${T.accent}50`,borderRadius:8,
            padding:'6px 16px',fontFamily:'Space Mono,monospace',
            fontSize:11,cursor:'pointer',letterSpacing:.5,
            display:'flex',alignItems:'center',gap:7,transition:'all 0.2s',
          }}
            onMouseEnter={e=>e.currentTarget.style.background=T.accent+'14'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download JSON
          </button>

          {/* Dark/Light toggle */}
          <button onClick={()=>setDark(d=>!d)} style={{
            background:T.toggleBg,border:`1px solid ${T.border}`,
            borderRadius:30,padding:'5px 14px',cursor:'pointer',
            display:'flex',alignItems:'center',gap:7,
            fontFamily:'Space Mono,monospace',fontSize:10,color:T.muted,
            letterSpacing:.5,transition:'all 0.3s',
          }}>
            <span style={{fontSize:14}}>{dark?'☀️':'🌙'}</span>
            {dark?'LIGHT':'DARK'}
          </button>
        </div>
      </header>

      {/* ── 2-COLUMN BODY ──────────────────────────────────────── */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'1fr 400px',
        height:'calc(100vh - 60px)',
        overflow:'hidden',
      }}>

        {/* LEFT: Graph — sticky full height */}
        <div style={{
          borderRight:`1px solid ${T.border}`,
          padding:'24px',
          display:'flex',flexDirection:'column',
          overflow:'hidden',
          background:T.bg,
          transition:'background 0.35s',
        }}>
          {/* Graph header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexShrink:0}}>
            <div>
              <h2 style={{fontWeight:700,fontSize:20,color:T.heading,letterSpacing:'-.5'}}>
                Transaction Graph
              </h2>
              <div style={{fontSize:9,color:T.muted,marginTop:3,fontFamily:'Space Mono,monospace',letterSpacing:1.5}}>
                {graphData.nodes.length} NODES · {graphData.edges.length} EDGES
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>setShowAll(v=>!v)} style={{
                background: showAll ? T.accent+'20' : 'transparent',
                color: showAll ? T.accent : T.muted,
                border:`1px solid ${showAll ? T.accent+'60' : T.border}`,
                borderRadius:8, padding:'4px 12px',
                fontFamily:'Space Mono,monospace', fontSize:9,
                cursor:'pointer', letterSpacing:.5, transition:'all 0.2s',
                display:'flex', alignItems:'center', gap:6,
              }}>
                <span style={{
                  width:6,height:6,borderRadius:'50%',
                  background: showAll ? T.accent : T.muted,
                  display:'inline-block',
                  boxShadow: showAll ? `0 0 6px ${T.accent}` : 'none',
                }}/>
                {showAll ? 'FRAUD FOCUS' : 'SHOW ALL'}
              </button>
              <span style={{
                background:T.danger+'15',color:T.danger,
                border:`1px solid ${T.danger}40`,
                padding:'3px 12px',borderRadius:6,
                fontSize:10,fontFamily:'Space Mono,monospace',
              }}>
                {result.suspicious_accounts.length} flagged
              </span>
            </div>
          </div>

          {/* Canvas fills remaining space */}
          <div style={{flex:1,minHeight:0}}>
            <GraphCanvas graphData={graphData} dark={dark}/>
          </div>

          {/* Warnings inline */}
          {(result.summary.shell_detection_skipped||result.graph_data?.capped)&&(
            <div style={{
              marginTop:12,flexShrink:0,
              background:T.warning+'10',border:`1px solid ${T.warning}35`,
              borderRadius:8,padding:'8px 14px',
              color:T.warning,fontSize:10,fontFamily:'Space Mono,monospace',
              display:'flex',flexDirection:'column',gap:3,
            }}>
              {result.summary.shell_detection_skipped&&<div>⚠ Shell detection skipped — graph exceeds 2,000 nodes</div>}
              {result.graph_data?.capped&&<div>⚠ Graph capped at {result.graph_data.cap_limit} of {result.summary.total_accounts_analyzed} nodes</div>}
            </div>
          )}
        </div>

        {/* RIGHT: Stats panel — scrollable */}
        <div style={{
          overflowY:'auto',
          background:T.panelBg,
          borderLeft:`1px solid ${T.border}`,
          transition:'background 0.35s',
        }}>
          <div style={{padding:'24px 20px'}}>

            <h2 style={{fontWeight:800,fontSize:20,color:T.heading,marginBottom:18,letterSpacing:-.5}}>
              Analysis Results
            </h2>

            {/* ── STAT CARDS ──────────────────────────────────── */}
            {[
              {label:'ACCOUNTS ANALYZED',   value:result.summary.total_accounts_analyzed,     color:T.accent2},
              {label:'SUSPICIOUS ACCOUNTS', value:result.summary.suspicious_accounts_flagged, color:T.danger},
              {label:'FRAUD RINGS',         value:result.summary.fraud_rings_detected,        color:T.warning},
              {label:'PROCESSING TIME',     value:`${result.summary.processing_time_seconds}s`,color:T.accent},
            ].map(({label,value,color},i)=>(
              <div key={label} style={{
                background:T.card,
                border:`1px solid ${color}30`,
                borderRadius:14,padding:'20px 22px',marginBottom:10,
                position:'relative',overflow:'hidden',
                animation:`fadeUp .45s ease ${i*.07}s both`,
                boxShadow:dark?`0 2px 20px ${color}08`:`0 2px 16px ${color}10`,
                transition:'background 0.35s',
              }}>
                {/* top accent line */}
                <div style={{position:'absolute',top:0,left:0,right:0,height:2,
                  background:`linear-gradient(90deg,transparent,${color}90,transparent)`}}/>
                {/* bg glow */}
                <div style={{position:'absolute',top:-20,right:-20,width:70,height:70,
                  borderRadius:'50%',background:color+'08',filter:'blur(14px)'}}/>
                <div style={{
                  fontSize:36,fontWeight:800,color,
                  fontFamily:'Space Mono,monospace',lineHeight:1,
                  textShadow:`0 0 22px ${color}55`,
                }}>{value}</div>
                <div style={{
                  fontSize:9,color:T.muted,marginTop:7,
                  textTransform:'uppercase',letterSpacing:2.2,
                  fontFamily:'Space Mono,monospace',
                }}>{label}</div>
              </div>
            ))}

            {/* ── PATTERN BREAKDOWN ────────────────────────────── */}
            {totalRings>0&&(
              <div style={{
                background:T.card,border:`1px solid ${T.border}`,
                borderRadius:14,padding:'18px 20px',marginBottom:10,
                animation:'fadeUp .45s ease .32s both',
                transition:'background 0.35s',
              }}>
                <div style={{fontSize:9,color:T.muted,textTransform:'uppercase',letterSpacing:2.2,
                  marginBottom:16,fontFamily:'Space Mono,monospace'}}>
                  Pattern Breakdown
                </div>
                {Object.entries(patternCounts).map(([l,n])=>(
                  <div key={l} style={{marginBottom:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                      <span style={{fontSize:12,color:patternColors[l],display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:16}}>{patternIcons[l]}</span>{l}
                      </span>
                      <span style={{
                        fontSize:11,fontFamily:'Space Mono,monospace',color:patternColors[l],
                        background:patternColors[l]+'18',padding:'2px 9px',borderRadius:5,
                      }}>{n}</span>
                    </div>
                    <div style={{height:3,background:T.border,borderRadius:2,overflow:'hidden'}}>
                      <div style={{
                        width:`${(n/totalRings)*100}%`,height:'100%',
                        background:`linear-gradient(90deg,${patternColors[l]}80,${patternColors[l]})`,
                        boxShadow:`0 0 8px ${patternColors[l]}50`,
                      }}/>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── DETECTOR STATUS ──────────────────────────────── */}
            <div style={{
              background:T.card,border:`1px solid ${T.border}`,
              borderRadius:14,padding:'18px 20px',marginBottom:10,
              animation:'fadeUp .45s ease .38s both',
              transition:'background 0.35s',
            }}>
              <div style={{fontSize:9,color:T.muted,textTransform:'uppercase',letterSpacing:2.2,
                marginBottom:16,fontFamily:'Space Mono,monospace'}}>
                Detector Status
              </div>
              {[
                {name:'Cycle Detection',  skipped:false,                                   color:T.accent},
                {name:'Smurfing',         skipped:false,                                   color:T.warning},
                {name:'Shell Networks',   skipped:result.summary.shell_detection_skipped,  color:T.accent2},
              ].map(({name,skipped,color})=>(
                <div key={name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:13}}>
                  <span style={{fontSize:12,color:T.text,display:'flex',alignItems:'center',gap:9}}>
                    <span style={{width:5,height:5,borderRadius:'50%',background:skipped?T.warning:color,
                      display:'inline-block',boxShadow:`0 0 6px ${skipped?T.warning:color}`}}/>
                    {name}
                  </span>
                  <span style={{
                    fontSize:9,fontFamily:'Space Mono,monospace',letterSpacing:1,
                    color:skipped?T.warning:color,
                    background:skipped?T.warning+'14':color+'14',
                    border:`1px solid ${skipped?T.warning+'40':color+'40'}`,
                    borderRadius:4,padding:'2px 9px',
                  }}>
                    {skipped?'SKIPPED':'OK'}
                  </span>
                </div>
              ))}
              {result.graph_data?.capped&&(
                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`,
                  fontSize:10,color:T.muted,fontFamily:'Space Mono,monospace'}}>
                  Graph capped at {result.graph_data.cap_limit} of {result.summary.total_accounts_analyzed} nodes
                </div>
              )}
            </div>

            {/* ── TOP RISKS ────────────────────────────────────── */}
            {result.suspicious_accounts.length>0&&(
              <div style={{
                background:T.card,border:`1px solid ${T.border}`,
                borderRadius:14,padding:'18px 20px',marginBottom:10,
                animation:'fadeUp .45s ease .44s both',
                transition:'background 0.35s',
              }}>
                <div style={{fontSize:9,color:T.muted,textTransform:'uppercase',letterSpacing:2.2,
                  marginBottom:16,fontFamily:'Space Mono,monospace'}}>
                  Top Risks
                </div>
                {result.suspicious_accounts.slice(0,7).map((acc,i)=>(
                  <div key={acc.account_id} style={{
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                    paddingBottom:12,marginBottom:12,
                    borderBottom:i<6?`1px solid ${T.border}30`:'none',
                  }}>
                    <div style={{display:'flex',alignItems:'center',gap:9,minWidth:0,flex:1}}>
                      <span style={{fontFamily:'Space Mono,monospace',fontSize:9,color:T.muted,flexShrink:0,width:18}}>
                        #{i+1}
                      </span>
                      <div style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                        background:sc(acc.suspicion_score),
                        boxShadow:`0 0 8px ${sc(acc.suspicion_score)}`}}/>
                      <span style={{fontSize:10,fontFamily:'Space Mono,monospace',
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:T.text}}>
                        {acc.account_id}
                      </span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:9,flexShrink:0,marginLeft:10}}>
                      <div style={{width:32,height:2,background:T.border,borderRadius:2,overflow:'hidden'}}>
                        <div style={{width:`${acc.suspicion_score}%`,height:'100%',background:sc(acc.suspicion_score)}}/>
                      </div>
                      <span style={{color:sc(acc.suspicion_score),fontFamily:'Space Mono,monospace',
                        fontSize:16,fontWeight:700,textShadow:`0 0 12px ${sc(acc.suspicion_score)}90`}}>
                        {acc.suspicion_score}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTTOM TABLES (full width, below fold) ─────────────── */}
      <div style={{background:T.bg,padding:'32px 28px 48px',borderTop:`1px solid ${T.border}`}}>

        {/* Tabs */}
        {(result.fraud_rings.length>0||result.suspicious_accounts.length>0)&&(
          <div style={{borderBottom:`1px solid ${T.border}`,marginBottom:22}}>
            {[
              {id:'rings',    label:'Fraud Rings',         count:result.fraud_rings.length},
              {id:'accounts', label:'Suspicious Accounts', count:result.suspicious_accounts.length},
            ].map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
                background:'transparent',border:'none',
                borderBottom:`2px solid ${activeTab===tab.id?T.accent:'transparent'}`,
                padding:'10px 20px',cursor:'pointer',
                fontFamily:'Space Mono,monospace',fontSize:11,letterSpacing:1,
                marginBottom:-1,
                color:activeTab===tab.id?T.accent:T.muted,
                transition:'all 0.2s',display:'inline-flex',alignItems:'center',gap:8,
              }}>
                {tab.label}
                <span style={{
                  background:activeTab===tab.id?T.accent+'20':T.border,
                  color:activeTab===tab.id?T.accent:T.muted,
                  borderRadius:10,padding:'1px 8px',fontSize:10,
                }}>{tab.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Fraud Rings */}
        {activeTab==='rings'&&result.fraud_rings.length>0&&(
          <div style={{
            background:T.card,border:`1px solid ${T.border}`,
            borderRadius:18,overflow:'hidden',animation:'fadeUp .3s ease both',
            transition:'background 0.35s',
          }}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${T.border}`}}>
                    {['Ring ID','Pattern','Members','Risk Score','Accounts'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'14px 18px',color:T.muted,
                        fontFamily:'Space Mono,monospace',fontSize:9,textTransform:'uppercase',letterSpacing:2,fontWeight:400}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.fraud_rings.map((ring,i)=>(
                    <tr key={ring.ring_id} style={{
                      borderBottom:`1px solid ${T.border}20`,
                      background:i%2===1?T.rowAlt:'transparent',
                      transition:'background 0.15s',
                    }}
                      onMouseEnter={e=>e.currentTarget.style.background=T.accent+'07'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===1?T.rowAlt:'transparent'}
                    >
                      <td style={{padding:'12px 18px',fontFamily:'Space Mono,monospace',color:T.accent,fontSize:11}}>
                        {ring.ring_id}
                      </td>
                      <td style={{padding:'12px 18px'}}>
                        <Badge label={ring.pattern_type.replace(/_/g,' ').toUpperCase()} color={ptc(ring.pattern_type)}/>
                      </td>
                      <td style={{padding:'12px 18px',fontFamily:'Space Mono,monospace',fontSize:13,color:T.text}}>
                        {ring.member_accounts.length}
                      </td>
                      <td style={{padding:'12px 18px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:44,height:3,background:T.border,borderRadius:2,overflow:'hidden'}}>
                            <div style={{width:`${ring.risk_score}%`,height:'100%',background:sc(ring.risk_score),
                              boxShadow:`0 0 5px ${sc(ring.risk_score)}`}}/>
                          </div>
                          <span style={{color:sc(ring.risk_score),fontFamily:'Space Mono,monospace',
                            fontWeight:700,fontSize:13,textShadow:`0 0 8px ${sc(ring.risk_score)}70`}}>
                            {ring.risk_score}
                          </span>
                        </div>
                      </td>
                      <td style={{padding:'12px 18px',color:T.muted,fontSize:10,fontFamily:'Space Mono,monospace',maxWidth:300}}>
                        <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {ring.member_accounts.join(', ')}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Suspicious Accounts */}
        {activeTab==='accounts'&&result.suspicious_accounts.length>0&&(
          <div style={{
            background:T.card,border:`1px solid ${T.border}`,
            borderRadius:18,overflow:'hidden',animation:'fadeUp .3s ease both',
            transition:'background 0.35s',
          }}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${T.border}`}}>
                    {['Account ID','Risk Score','Primary Ring','All Rings','Detected Patterns'].map(h=>(
                      <th key={h} style={{textAlign:'left',padding:'14px 18px',color:T.muted,
                        fontFamily:'Space Mono,monospace',fontSize:9,textTransform:'uppercase',letterSpacing:2,fontWeight:400}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.suspicious_accounts.slice(0,60).map((acc,i)=>(
                    <tr key={acc.account_id} style={{
                      borderBottom:`1px solid ${T.border}20`,
                      background:i%2===1?T.rowAlt:'transparent',
                      transition:'background 0.15s',
                    }}
                      onMouseEnter={e=>e.currentTarget.style.background=T.accent+'07'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===1?T.rowAlt:'transparent'}
                    >
                      <td style={{padding:'12px 18px',fontFamily:'Space Mono,monospace',fontSize:11}}>
                        <div style={{display:'flex',alignItems:'center',gap:9}}>
                          <div style={{width:6,height:6,borderRadius:'50%',flexShrink:0,
                            background:sc(acc.suspicion_score),boxShadow:`0 0 6px ${sc(acc.suspicion_score)}`}}/>
                          <span style={{color:T.text}}>{acc.account_id}</span>
                        </div>
                      </td>
                      <td style={{padding:'12px 18px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:9}}>
                          <div style={{width:52,height:3,background:T.border,borderRadius:2,overflow:'hidden'}}>
                            <div style={{width:`${acc.suspicion_score}%`,height:'100%',background:sc(acc.suspicion_score),
                              boxShadow:`0 0 5px ${sc(acc.suspicion_score)}`}}/>
                          </div>
                          <span style={{color:sc(acc.suspicion_score),fontFamily:'Space Mono,monospace',
                            fontSize:13,fontWeight:700,textShadow:`0 0 8px ${sc(acc.suspicion_score)}70`}}>
                            {acc.suspicion_score}
                          </span>
                        </div>
                      </td>
                      <td style={{padding:'12px 18px',fontFamily:'Space Mono,monospace',color:T.accent,fontSize:11}}>
                        {acc.ring_id}
                      </td>
                      <td style={{padding:'12px 18px',fontFamily:'Space Mono,monospace',color:T.muted,fontSize:11}}>
                        {acc.all_ring_ids?.length>1?`${acc.all_ring_ids.length} rings`:'—'}
                      </td>
                      <td style={{padding:'12px 18px'}}>
                        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                          {acc.detected_patterns.map(p=>(
                            <Badge key={p} label={patternLabel(p)} color={pc(p)}/>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.suspicious_accounts.length>60&&(
                <div style={{padding:'12px 18px',color:T.muted,fontSize:10,
                  fontFamily:'Space Mono,monospace',borderTop:`1px solid ${T.border}`}}>
                  +{result.suspicious_accounts.length-60} more accounts in downloaded JSON
                </div>
              )}
            </div>
          </div>
        )}

        {result.suspicious_accounts.length===0&&(
          <div style={{
            background:T.accent+'08',border:`1px solid ${T.accent}30`,
            borderRadius:14,padding:'48px 40px',textAlign:'center',
          }}>
            <div style={{fontSize:38,marginBottom:14}}>✅</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:6,color:T.heading}}>No suspicious activity detected</div>
            <div style={{fontSize:13,color:T.muted}}>All accounts appear to be operating normally</div>
          </div>
        )}
      </div>
    </div>
  )
}