// Aetheris\aetheris-frontend\pages\index.tsx

"use client";

import { useRef, type CSSProperties } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Header from "@/components/Header";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useAetherisUser } from "@/hooks/useAetherisUser";

// ── Reusable agent components ────────────────────────────────────────────────
// Each lives at /components/agents/AgentXxx.jsx
// compact={true}  → renders only <canvas>, no wrapper (used here in cards)
// compact={false} → full standalone page with dark bg + border (used in /pages/agents/*)
import AgentAlpha from "@/components/agents/AgentAlpha";
import AgentBeta  from "@/components/agents/AgentBeta";
import AgentV     from "@/components/agents/AgentV";
import AgentGas   from "@/components/agents/AgentGas";

// ── Card geometry ────────────────────────────────────────────────────────────
// Canvas native: 400 × 520 px
// Card display:  230 × 299 px   →   scale = 230 / 400 = 0.575
const CANVAS_W = 400;
const CANVAS_H = 520;
const CARD_W   = 230;
const CARD_H   = Math.round(CANVAS_H * (CARD_W / CANVAS_W)); // 299
const SCALE    = CARD_W / CANVAS_W;                           // 0.575

const AGENTS = [
  { id:"alpha", Component:AgentAlpha, color:"#06b6d4", title:"ALPHA", subtitle:"DEX Arbitrage",    status:"STEALTH VALIDATION", href:"/agents/alpha" },
  { id:"beta",  Component:AgentBeta,  color:"#a855f7", title:"BETA",  subtitle:"Funding Rate",     status:"IN DEVELOPMENT",     href:"/agents/beta"  },
  { id:"v",     Component:AgentV,     color:"#f59e0b", title:"V",     subtitle:"Contract Monitor", status:"OPERATIONAL",        href:"/agents/v"     },
  { id:"gas",   Component:AgentGas,   color:"#22c55e", title:"GAS",   subtitle:"Gasless Layer",    status:"DEPLOYING",          href:"/agents/gas"   },
];

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { openConnectModal } = useConnectModal();
  const { isConnected } = useAccount();
  const { depositedUSDC, claimableProfit, isLoading: userLoading } = useAetherisUser();

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });

  const heroScale   = useTransform(scrollYProgress, [0, 0.2],           [1, 0.6]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2, 0.25],     [1, 1, 0]);

  const featuresOpacity = useTransform(scrollYProgress, [0.2, 0.3, 0.55, 0.65], [0, 1, 1, 0]);
  const featuresY       = useTransform(scrollYProgress, [0.2, 0.3, 0.55, 0.65], ["40px","0px","0px","-40px"]);

  const gridScale         = useTransform(scrollYProgress, [0.55, 0.7, 0.9, 0.98], [0.4, 1, 1, 2]);
  const gridOpacity       = useTransform(scrollYProgress, [0.55, 0.65, 0.9, 0.98], [0, 1, 1, 0]);
  const gridPointerEvents = useTransform(gridOpacity, (v) => (v > 0.1 ? "auto" : "none"));

  return (
    <div ref={containerRef} style={{ background:"#020617", minHeight:"100vh", position:"relative" }}>
      <style jsx global>{`
        html, body {
          margin: 0; padding: 0;
          background: #020617 !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
          height: auto !important;
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #06b6d4; border-radius: 4px; }
      `}</style>

      <Header />
      <div style={fixedBg} />

      <div style={{ height:"400vh", position:"relative", zIndex:10 }}>

        {/* ── HERO ─────────────────────────────────────────────── */}
        <motion.div style={{ ...heroWrapper, scale:heroScale, opacity:heroOpacity }}>
          <motion.div animate={{ y:[0,-15,0] }} transition={{ duration:4, repeat:Infinity, ease:"easeInOut" }}>
            <div style={logoContainer}>
              <img src="/aetherisLogo.jpg" alt="Logo" style={logoImage} />
            </div>
          </motion.div>

          <div style={phasePill}>
            <span style={{ display:"inline-block", width:"7px", height:"7px", background:"#22c55e", borderRadius:"50%", boxShadow:"0 0 8px #22c55e", marginRight:"8px" }} />
            PHASE 1 · STEALTH MAINNET VALIDATION
          </div>

          <h1 style={mainHeading}>
            THE PROTOCOL THAT<br />
            <span style={gradientText}>WORKS FOR YOU</span>
          </h1>

          <div style={{ marginTop:"20px" }}>
            <p style={heroSubText}>Arbitrage. Yield. Security. Inheritance. All autonomous.</p>
            <p style={heroSecondaryText}>Built on Base L2 · Protected by Agent V · Gasless via ERC-4337</p>
          </div>

          <div style={{ display:"flex", gap:"20px", marginTop:"40px" }}>
            {isConnected
              ? <Link href="/dashboard"><button style={primaryBtn}>LAUNCH APP ⚡</button></Link>
              : <button style={primaryBtn} onClick={openConnectModal}>LAUNCH APP ⚡</button>
            }
            <Link href="/whitepaper"><button style={secondaryBtn}>READ WHITEPAPER 📄</button></Link>
          </div>
        </motion.div>

        {/* ── STATS & FEATURES ──────────────────────────────────── */}
        <motion.section style={{ ...fullCenter, opacity:featuresOpacity, y:featuresY, pointerEvents:"none" }}>
          <div style={statsGrid}>
            <div style={statItem}><div style={statValue}>Phase 1</div><div style={statLabel}>Current Stage</div></div>
            <div style={statItem}><div style={statValue}>4</div><div style={statLabel}>Phase 1 Agents</div></div>
            <div style={statItem}><div style={statValue}>&lt;20ms</div><div style={statLabel}>Alpha Scan Speed</div></div>
          </div>

          <h2 style={{ fontSize:"32px", fontWeight:900, marginBottom:"40px" }}>Why Retail Needs Aetheris</h2>

          <div style={featuresGrid}>
            <div className="glass-panel" style={featureCard}>
              <div style={iconSmall}>⚡</div>
              <h3 style={featTitle}>Gasless Trading</h3>
              <p style={featDesc}>No ETH needed. Every tx paid in USDC via ERC-4337.</p>
            </div>
            <div className="glass-panel" style={featureCard}>
              <div style={iconSmall}>🔍</div>
              <h3 style={featTitle}>Proof of Exit</h3>
              <p style={featDesc}>Agent V monitors every contract. Exits before rug pulls.</p>
            </div>
            <div className="glass-panel" style={featureCard}>
              <div style={iconSmall}>🤖</div>
              <h3 style={featTitle}>Autonomous Yield</h3>
              <p style={featDesc}>Deposit once. Agents work 24/7. No active management required.</p>
            </div>
          </div>
        </motion.section>

        {/* ── PHASE 1 AGENT SHOWCASE ────────────────────────────── */}
        <motion.section
          style={{ ...fullCenter, scale:gridScale, opacity:gridOpacity, pointerEvents:gridPointerEvents, zIndex:100 }}
        >
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontSize: 12, color: "#06b6d4", letterSpacing: "0.55em", fontWeight: 900, marginBottom: 10, textTransform: "uppercase" }}>
              ● Phase 1 · Foundation Agents · Active Build
            </div>
            <h1 style={{ fontSize: 38, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: "-0.01em", fontStyle: "italic", wordSpacing: "0.25em"  }}>
              Meet Your AI Workforce
            </h1>
            <p style={{ color: "rgba(255,255,255,.3)", fontSize: 16, marginTop: 8, letterSpacing: "0.12em" }}>
              4 agents. Building now. Vault opens when they prove it.
            </p>
          </div>
          {/* <div style={{ textAlign:"center", marginBottom:"36px" }}>
            <h2 style={{ fontSize:"12px", color:"#06b6d4", letterSpacing:"0.8em", fontWeight:900, textTransform:"uppercase", marginBottom:"10px" }}>
              Phase 1 — In Progress
            </h2>
            <h3 style={{ fontSize:"42px", fontWeight:900, fontStyle:"italic", color:"#fff" }}>
              Meet the AI Workforce
            </h3>
            <p style={{ color:"rgba(255,255,255,0.4)", fontSize:"14px", marginTop:"10px" }}>
              4 foundation agents building now — 22 total planned across 5 phases
            </p>
          </div> */}

          {/* ── Agent canvas cards ───────────────────────────────── */}
          <div style={agentRow}>
            {AGENTS.map(({ id, Component, color, title, subtitle, status, href }) => (
              <Link key={id} href={href} style={{ textDecoration:"none" }}>
                <motion.div
                  style={cardWrapper(color)}
                  whileHover={{ scale:1.04, zIndex:110, boxShadow:`0 0 55px ${color}44` }}
                  transition={{ type:"spring", stiffness:380, damping:18 }}
                >
                  {/* Scaled canvas window */}
                  <div style={canvasClip}>
                    <div style={canvasScaleBox}>
                      <Component compact />
                    </div>
                  </div>

                  {/* Label bar */}
                  <div style={labelBar(color)}>
                    <div>
                      <div style={{ color:"#fff", fontWeight:900, fontSize:"12px", letterSpacing:"0.08em" }}>
                        AGENT {title}
                      </div>
                      <div style={{ color:`${color}cc`, fontSize:"9px", fontWeight:700, letterSpacing:"0.12em", marginTop:"1px" }}>
                        {subtitle.toUpperCase()}
                      </div>
                    </div>
                    <span style={statusPill(color)}>{status}</span>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>

          <Link href="/agents">
            <motion.button
              style={viewAllBtn}
              whileHover={{ scale:1.05, backgroundColor:"rgba(6,182,212,0.15)", boxShadow:"0 0 25px rgba(6,182,212,0.3)" }}
              whileTap={{ scale:0.95 }}
            >
              View All 22 Planned Agents →
            </motion.button>
          </Link>
        </motion.section>
      </div>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <div style={finalHubWrapper}>
        <div style={finalCtaContent}>
          <h2 style={finalCtaTitle}>FOLLOW THE BUILD</h2>
          <p style={finalCtaSubtitle}>
            Arbitrage, yield, security, inheritance — all running autonomously.<br />
            Alpha is in stealth mainnet validation. The vault opens when the agents prove it.
          </p>

          {isConnected ? (
            <Link href="/dashboard">
              <motion.button style={massiveBtn} whileHover={{ scale:1.05, boxShadow:"0 0 60px rgba(6,182,212,0.5)" }} whileTap={{ scale:0.95 }}>
                ENTER THE AETHERIS ⚡
              </motion.button>
            </Link>
          ) : (
            <motion.button style={massiveBtn} onClick={openConnectModal} whileHover={{ scale:1.05, boxShadow:"0 0 60px rgba(6,182,212,0.5)" }} whileTap={{ scale:0.95 }}>
              ENTER THE AETHERIS ⚡
            </motion.button>
          )}

          <div style={footerFeatures}>
            <div style={footerFeatItem}><span>⚡</span> Gasless</div>
            <div style={footerFeatItem}><span>🔍</span> Proof of Exit</div>
            <div style={footerFeatItem}><span>🤖</span> Autonomous</div>
            <div style={footerFeatItem}><span>🏗️</span> Phase 1 Active</div>
          </div>

          <div style={terminalLine}>
            <span style={{ display:"inline-block", width:"8px", height:"8px", background:"#22c55e", borderRadius:"50%", boxShadow:"0 0 10px #22c55e", marginRight:"10px" }} />
            SYSTEM STATUS: BUILDING | ALPHA: STEALTH VALIDATION | BETA: IN DEVELOPMENT
          </div>
          <p style={footerCopyright}>© 2026 AETHERIS PROTOCOL | BUILT ON BASE L2</p>
        </div>
      </div>
    </div>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const fixedBg: CSSProperties = {
  position:"fixed", inset:0,
  background:"radial-gradient(circle at 50% 40%, rgba(6,182,212,0.15), transparent 70%)",
  zIndex:0,
};
const heroWrapper: CSSProperties = {
  position:"fixed", top:0, left:0, width:"100%", height:"100vh",
  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
  textAlign:"center", zIndex:10, pointerEvents:"auto",
};
const fullCenter: CSSProperties = {
  position:"fixed", top:0, left:0, width:"100%", height:"100vh",
  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
  zIndex:5,
};
const phasePill: CSSProperties = {
  display:"inline-flex", alignItems:"center",
  fontSize:"10px", fontWeight:900, letterSpacing:"0.25em", textTransform:"uppercase",
  color:"#22c55e", border:"1px solid rgba(34,197,94,0.3)",
  background:"rgba(34,197,94,0.07)", borderRadius:"99px",
  padding:"6px 16px", marginBottom:"24px",
};
const mainHeading: CSSProperties = {
  fontSize:"clamp(48px, 10vw, 110px)", fontWeight:900, fontStyle:"italic",
  margin:0, letterSpacing:"-0.02em", lineHeight:1.05,
};
const gradientText: CSSProperties = {
  background:"linear-gradient(90deg, #22d3ee, #2563eb)",
  WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
};
const logoContainer: CSSProperties = {
  width:"140px", height:"140px", borderRadius:"50%", overflow:"hidden",
  border:"2px solid #06b6d4", marginBottom:"30px",
  boxShadow:"0 0 40px rgba(6,182,212,0.3)",
};
const logoImage: CSSProperties     = { width:"100%", height:"100%", objectFit:"cover" };
const heroSubText: CSSProperties   = { color:"#06b6d4", fontSize:"18px", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" };
const heroSecondaryText: CSSProperties = { color:"rgba(255,255,255,0.3)", fontSize:"11px", marginTop:"8px", letterSpacing:"0.2em", textTransform:"uppercase" };
const primaryBtn: CSSProperties    = { padding:"16px 32px", background:"linear-gradient(90deg, #06b6d4, #2563eb)", borderRadius:"99px", border:"none", color:"#fff", fontWeight:900, cursor:"pointer", fontSize:"16px" };
const secondaryBtn: CSSProperties  = { padding:"16px 32px", background:"transparent", border:"2px solid #06b6d4", borderRadius:"99px", color:"#06b6d4", fontWeight:900, cursor:"pointer", fontSize:"16px" };
const statsGrid: CSSProperties     = { display:"flex", gap:"60px", marginBottom:"60px" };
const statValue: CSSProperties     = { fontSize:"40px", fontWeight:900, color:"#22d3ee" };
const statLabel: CSSProperties     = { fontSize:"12px", color:"#64748b", textTransform:"uppercase", letterSpacing:"2px" };
const statItem: CSSProperties      = { textAlign:"center", display:"flex", flexDirection:"column" };
const featuresGrid: CSSProperties  = { display:"flex", gap:"24px", width:"100%", maxWidth:"1100px" };
const featureCard: CSSProperties   = { flex:1, padding:"30px", textAlign:"center", background:"rgba(15,23,42,0.5)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"24px", backdropFilter:"blur(10px)" };
const iconSmall: CSSProperties     = { fontSize:"32px", marginBottom:"10px" };
const featTitle: CSSProperties     = { fontSize:"16px", fontWeight:700, marginBottom:"8px" };
const featDesc: CSSProperties      = { fontSize:"12px", color:"rgba(255,255,255,0.45)", lineHeight:1.5 };

// ── Agent card ────────────────────────────────────────────────────────────────
const agentRow: CSSProperties = { display:"flex", gap:"14px", flexWrap:"wrap", justifyContent:"center", maxWidth:"1040px" };

const cardWrapper = (color: string): CSSProperties => ({
  width:`${CARD_W}px`, borderRadius:"14px", overflow:"hidden",
  border:`1px solid ${color}33`, background:"#020617",
  boxShadow:`0 0 18px ${color}18`, cursor:"pointer", flexShrink:0,
  display:"flex", flexDirection:"column",
});

// Clip the scaled canvas to CARD_W × CARD_H
const canvasClip: CSSProperties = {
  width:`${CARD_W}px`, height:`${CARD_H}px`,
  overflow:"hidden", position:"relative", flexShrink:0,
};

// Scale 400×520 → CARD_W×CARD_H
const canvasScaleBox: CSSProperties = {
  position:"absolute", top:0, left:0,
  width:`${CANVAS_W}px`, height:`${CANVAS_H}px`,
  transform:`scale(${SCALE})`, transformOrigin:"top left",
  pointerEvents:"none",
};

const labelBar = (color: string): CSSProperties => ({
  display:"flex", alignItems:"center", justifyContent:"space-between",
  padding:"9px 12px", background:"rgba(2,6,23,0.97)",
  borderTop:`1px solid ${color}2a`, flexShrink:0,
});

const statusPill = (color: string): CSSProperties => ({
  fontSize:"7px", fontWeight:900, letterSpacing:"0.07em",
  border:`1px solid ${color}`, color:color,
  background:`${color}14`, padding:"3px 8px",
  borderRadius:"99px", boxShadow:`0 0 7px ${color}22`,
  whiteSpace:"nowrap" as const,
});

const viewAllBtn: CSSProperties = {
  marginTop:"36px", padding:"12px 32px", background:"transparent",
  border:"2px solid #06b6d4", borderRadius:"99px", color:"#06b6d4",
  fontWeight:900, fontSize:"14px", cursor:"pointer", position:"relative", zIndex:120,
};

// ── Final CTA ─────────────────────────────────────────────────────────────────
const finalHubWrapper: CSSProperties  = { position:"relative", zIndex:20, minHeight:"80vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#020617", borderTop:"1px solid rgba(6,182,212,0.1)" };
const finalCtaContent: CSSProperties  = { textAlign:"center", padding:"100px 20px" };
const finalCtaTitle: CSSProperties    = { fontSize:"48px", fontWeight:900, fontStyle:"italic", marginBottom:"16px", letterSpacing:"0.1em" };
const finalCtaSubtitle: CSSProperties = { fontSize:"16px", color:"rgba(255,255,255,0.45)", lineHeight:1.7, marginBottom:"40px" };
const massiveBtn: CSSProperties       = { padding:"24px 60px", background:"linear-gradient(90deg, #06b6d4, #2563eb)", borderRadius:"99px", border:"none", color:"#fff", fontWeight:900, cursor:"pointer", fontSize:"18px", boxShadow:"0 0 50px rgba(6,182,212,0.3)", pointerEvents:"auto", position:"relative", zIndex:100 };
const footerFeatures: CSSProperties   = { display:"flex", justifyContent:"center", gap:"40px", marginTop:"60px", opacity:0.6 };
const footerFeatItem: CSSProperties   = { fontSize:"14px", fontWeight:700, display:"flex", alignItems:"center", gap:"8px" };
const terminalLine: CSSProperties     = { marginTop:"80px", fontSize:"12px", color:"#06b6d4", fontFamily:"monospace", letterSpacing:"0.2em", display:"flex", alignItems:"center", justifyContent:"center", gap:"10px" };
const footerCopyright: CSSProperties  = { marginTop:"30px", opacity:0.2, fontSize:"10px", letterSpacing:"0.5em", fontWeight:900 };