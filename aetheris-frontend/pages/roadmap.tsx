// Aetheris\aetheris-frontend\pages\roadmap.tsx

// Aetheris\aetheris-frontend\pages\roadmap.tsx
// UPDATED: Revised Whitepaper v3 — 5 milestone-gated phases, correct agent names, no fake metrics in terminal

"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function RoadmapPage() {
  const [selectedPhase, setSelectedPhase] = useState(1);

  // ── Phase data aligned to Whitepaper v3 Section 8 ─────────────────────────
  // Phases are milestone-gated, not calendar-gated.
  // Dates shown are targets, not commitments.
  const phases = [
    {
      id: 1,
      title: "FOUNDATION",
      status: "ACTIVE",
      progress: 45,
      color: "#06b6d4",
      glow: "rgba(6,182,212,0.5)",
      icon: "⚡",
      year: "Phase 1",
      target: "H1 2026",
      desc: "Two agents profitable on mainnet",
      achievements: [
        "Agent Alpha — stealth mainnet validation (Rust, sub-20ms)",
        "Agent Beta — ETH-PERP funding rate arb (Synthetix Perps v3)",
        "Agent Gas — ERC-4337 gasless infrastructure live",
        "Agent V — monitoring infrastructure operational",
        "Vault smart contract developed & audited",
        "AX token deployed on Base as ERC-20",
      ],
      gate: "Alpha + Beta validated profitable over 30+ mainnet days. Vault audited. AX deployed.",
    },
    {
      id: 2,
      title: "VAULT LAUNCH",
      status: "PLANNED",
      progress: 0,
      color: "#22c55e",
      glow: "rgba(34,197,94,0.5)",
      icon: "🏛️",
      year: "Phase 2",
      target: "H2 2026",
      desc: "Public vault, AX staking, governance live",
      achievements: [
        "Vault opens to public deposits (conservative TVL cap)",
        "AX staking live — real USDC distributions from protocol fees",
        "Governance module active — stakers vote from day one",
        "Agent Delta, Anchor, Omega, Armor, LP, Sigma, Pulse deployed",
        "Agent Beta expands: BTC-PERP, SOL-PERP + Arbitrum (GMX v2)",
        "AX upgrades from Base ERC-20 to LayerZero OFT",
      ],
      gate: "TVL cap raised 2× minimum. All 7 Phase 2 agents live. AX OFT on Base + Arbitrum. At least one governance vote processed.",
    },
    {
      id: 3,
      title: "ECOSYSTEM",
      status: "PLANNED",
      progress: 0,
      color: "#a855f7",
      glow: "rgba(168,85,247,0.5)",
      icon: "🛡️",
      year: "Phase 3",
      target: "2027",
      desc: "Full 3-layer security. V-PROOFS. Institutions.",
      achievements: [
        "Agent Shield — V-to-Shield intelligence loop live",
        "Agent Borrow — automated loan rate optimisation",
        "Agent Pi — prediction market arb (contingent on liquidity)",
        "Agent Restake — EigenLayer AVS management on Ethereum mainnet",
        "Agent Beta adds Hyperliquid as third chain",
        "V-PROOFS — ZK-SNARK cryptographic protocol attestations",
        "First institutional vault allocations targeted",
      ],
      gate: "All 3 defensive layer agents integrated. Beta on 3 chains. First institutional deposits received.",
    },
    {
      id: 4,
      title: "ADVANCED",
      status: "PLANNED",
      progress: 0,
      color: "#eab308",
      glow: "rgba(234,179,8,0.5)",
      icon: "📈",
      year: "Phase 4",
      target: "2027",
      desc: "Full strategy diversification",
      achievements: [
        "Agent Options — covered calls & cash-secured puts (Arbitrum)",
        "Agent Ghost — copy trader, curated profitable wallets",
        "Agent Vault Tax — real-time tax accounting & loss harvesting",
        "Agent Beta: statistical arb, volatility harvesting, Solana (Drift)",
      ],
      gate: "Options and Ghost both contributing measurable vault yield. Beta statistical arb active. Solana live.",
    },
    {
      id: 5,
      title: "MATURITY",
      status: "2027 HORIZON",
      progress: 0,
      color: "#f97316",
      glow: "rgba(249,115,22,0.5)",
      icon: "✨",
      year: "Phase 5",
      target: "2027+",
      desc: "22 agents. 5 chains. Full decentralisation.",
      achievements: [
        "Agent Legacy — programmable DeFi inheritance",
        "Agent Sovereign — personal endowment, principal preservation",
        "Agent Nexus — cross-chain coordinator + M2M settlement layer",
        "Agent Genesis — autonomous protocol launcher (requires $100M+ TVL)",
        "All 22 agents live across Base, Arbitrum, Ethereum, Hyperliquid, Solana",
        "No team multisig for any operational decision",
      ],
      gate: "All 22 agents live. 5-chain operation stable. Protocol governance fully decentralised.",
    },
  ];

  const current = phases.find((p) => p.id === selectedPhase);

  return (
    <div className="min-h-screen flex flex-col bg-[#020617] text-white overflow-hidden relative">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Space+Mono:wght@400;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'Space Mono', monospace; }
        .glass-panel {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.05);
        }
      `}</style>

      <Header />

      <main className="flex-grow flex items-center justify-center px-6 pt-24 pb-12 relative">
        {/* Grid Background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(6,182,212,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.1) 1px, transparent 1px)",
            backgroundSize: "100px 100px",
            transform: "perspective(500px) rotateX(60deg)",
            transformOrigin: "center",
          }}
        />

        <div className="max-w-7xl w-full relative z-10">
          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <h1 className="text-8xl font-black italic mb-4 tracking-tighter">
              THE{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                ROADMAP
              </span>
            </h1>
            <p className="text-gray-400 text-lg font-mono uppercase tracking-[0.2em]">
              Five phases. Milestone-gated. Zero fake dates.
            </p>
          </motion.div>

          {/* Main Display */}
          <div className="grid grid-cols-12 gap-6 min-h-[580px]">

            {/* LEFT — Phase Selector */}
            <div className="col-span-3 space-y-2">
              {phases.map((phase) => (
                <motion.div
                  key={phase.id}
                  onClick={() => setSelectedPhase(phase.id)}
                  whileHover={{ scale: 1.03, x: 8 }}
                  className={`glass-panel p-4 cursor-pointer relative overflow-hidden rounded-xl transition-all ${
                    selectedPhase === phase.id ? "border-opacity-50" : "border-white/5"
                  }`}
                  style={{
                    background:
                      selectedPhase === phase.id
                        ? `${phase.glow}12`
                        : "rgba(15, 23, 42, 0.3)",
                    borderColor:
                      selectedPhase === phase.id
                        ? `${phase.color}50`
                        : "rgba(255,255,255,0.05)",
                  }}
                >
                  {selectedPhase === phase.id && (
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(90deg, ${phase.glow}18, transparent)`,
                      }}
                      animate={{ x: ["-100%", "100%"] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    />
                  )}

                  <div className="relative z-10 flex items-center gap-3">
                    <div className="text-2xl filter drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]">
                      {phase.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-black text-[9px] font-mono tracking-widest"
                        style={{ color: phase.color }}
                      >
                        {phase.year.toUpperCase()}
                      </div>
                      <div className="text-[11px] text-white font-bold italic uppercase tracking-wide truncate">
                        {phase.title}
                      </div>
                    </div>
                    {/* Status indicator */}
                    {phase.status === "ACTIVE" && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center animate-pulse text-[7px] flex-shrink-0"
                        style={{ background: phase.color }}
                      >
                        ◉
                      </div>
                    )}
                    {phase.status === "PLANNED" && (
                      <div
                        className="w-5 h-5 rounded-full border flex items-center justify-center text-[7px] flex-shrink-0"
                        style={{
                          borderColor: phase.color,
                          color: phase.color,
                          background: `${phase.color}14`,
                        }}
                      >
                        ○
                      </div>
                    )}
                    {phase.status === "2027 HORIZON" && (
                      <div
                        className="w-5 h-5 rounded-full border flex items-center justify-center text-[7px] flex-shrink-0 opacity-60"
                        style={{
                          borderColor: phase.color,
                          color: phase.color,
                        }}
                      >
                        ◌
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* CENTER — Holographic Display */}
            <div className="col-span-6 relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Outer rotating ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                  className="absolute w-[380px] h-[380px] rounded-full"
                  style={{
                    border: `1px solid ${current?.color}18`,
                    boxShadow: `0 0 50px ${current?.glow}15`,
                  }}
                />
                {/* Inner counter-rotating ring */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
                  className="absolute w-[280px] h-[280px] rounded-full"
                  style={{
                    border: `1px dashed ${current?.color}10`,
                  }}
                />

                {/* Phase Orbits — 5 nodes evenly spaced */}
                {phases.map((phase) => {
                  const isActive = phase.id === selectedPhase;
                  // Spread 5 nodes around a circle: 72° apart, starting from top (-90°)
                  const angle = ((phase.id - 1) * 72 - 90) * (Math.PI / 180);
                  const distance = 210;

                  return (
                    <motion.div
                      key={phase.id}
                      className="absolute"
                      style={{
                        left: "50%",
                        top: "50%",
                        transform: `translate(calc(-50% + ${
                          distance * Math.cos(angle)
                        }px), calc(-50% + ${distance * Math.sin(angle)}px))`,
                        zIndex: 50,
                      }}
                    >
                      <motion.div
                        onClick={() => setSelectedPhase(phase.id)}
                        whileHover={{ scale: 1.35 }}
                        animate={{
                          scale: isActive ? 1.15 : 1,
                          boxShadow: isActive
                            ? [
                                `0 0 50px ${phase.glow}`,
                                `0 0 90px ${phase.glow}`,
                                `0 0 50px ${phase.glow}`,
                              ]
                            : `0 0 15px ${phase.glow}18`,
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-14 h-14 rounded-full flex items-center justify-center text-xl cursor-pointer relative"
                        style={{
                          background: isActive ? phase.color : `${phase.color}18`,
                          border: `2px solid ${phase.color}`,
                        }}
                      >
                        {phase.icon}
                        {/* Orbiting dots for active phase */}
                        {isActive &&
                          [...Array(3)].map((_, i) => (
                            <motion.div
                              key={i}
                              className="absolute w-1.5 h-1.5 rounded-full"
                              style={{ background: phase.color }}
                              animate={{
                                x: [
                                  30 * Math.cos((i * 120 * Math.PI) / 180),
                                  30 * Math.cos(((i * 120 + 360) * Math.PI) / 180),
                                ],
                                y: [
                                  30 * Math.sin((i * 120 * Math.PI) / 180),
                                  30 * Math.sin(((i * 120 + 360) * Math.PI) / 180),
                                ],
                              }}
                              transition={{
                                duration: 2.5,
                                repeat: Infinity,
                                ease: "linear",
                                delay: i * 0.25,
                              }}
                            />
                          ))}
                      </motion.div>
                    </motion.div>
                  );
                })}

                {/* Center Hologram Card */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedPhase}
                    initial={{ opacity: 0, scale: 0, rotateY: -180 }}
                    animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                    exit={{ opacity: 0, scale: 0, rotateY: 180 }}
                    transition={{ duration: 0.55, ease: "easeOut" }}
                    className="glass-panel p-7 text-center relative rounded-3xl w-[280px]"
                    style={{
                      background: `${current?.glow}06`,
                      borderColor: `${current?.color}38`,
                      boxShadow: `0 0 60px ${current?.glow}18`,
                    }}
                  >
                    <div className="text-5xl mb-3">{current?.icon}</div>
                    <h2
                      className="text-xl font-black italic mb-1 tracking-tight"
                      style={{ color: current?.color }}
                    >
                      {current?.title}
                    </h2>
                    <div className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1">
                      {current?.year} · {current?.target}
                    </div>
                    <div className="text-[10px] text-gray-500 mb-5 leading-relaxed">
                      {current?.desc}
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-2">
                      <motion.div
                        className="h-full"
                        style={{ background: current?.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${current?.progress}%` }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                      />
                    </div>
                    <div
                      className="text-[10px] font-mono font-bold"
                      style={{ color: current?.color }}
                    >
                      {current?.progress > 0
                        ? `${current?.progress}% COMPLETE`
                        : current?.status}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* RIGHT — Phase Details */}
            <div className="col-span-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedPhase}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  className="glass-panel p-5 h-full rounded-2xl flex flex-col overflow-hidden"
                  style={{
                    borderLeft: `2px solid ${current?.color}`,
                    background: `${current?.glow}04`,
                  }}
                >
                  <div className="text-[9px] font-mono text-cyan-400 font-bold mb-4 tracking-widest uppercase">
                    // Phase Details
                  </div>

                  <div className="space-y-4 flex-grow">
                    <div>
                      <div className="text-[9px] font-mono text-gray-500 uppercase mb-1">
                        Status
                      </div>
                      <div
                        className="font-black text-xs italic tracking-widest"
                        style={{ color: current?.color }}
                      >
                        {current?.status}
                      </div>
                    </div>

                    <div className="flex-grow">
                      <div className="text-[9px] font-mono text-gray-500 uppercase mb-3">
                        Deliverables
                      </div>
                      <div className="space-y-2 overflow-y-auto">
                        {current?.achievements.map((ach, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.07 }}
                            className="flex items-start gap-2"
                          >
                            <div
                              className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                              style={{ background: current?.color }}
                            />
                            <div className="text-[10px] font-mono text-gray-400 leading-relaxed">
                              {ach}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Completion gate */}
                    <div
                      className="p-3 rounded-lg text-[9px] font-mono text-gray-500 leading-relaxed border"
                      style={{
                        borderColor: `${current?.color}18`,
                        background: `${current?.color}05`,
                      }}
                    >
                      <div
                        className="font-bold mb-1"
                        style={{ color: current?.color }}
                      >
                        COMPLETION GATE:
                      </div>
                      {current?.gate}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Bottom Terminal — no fake live stats */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-panel p-5 mt-6 rounded-2xl"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6 font-mono text-[10px] text-gray-500 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ background: "#06b6d4" }}
                  />
                  <span style={{ color: "#06b6d4" }}>PHASE 1: ACTIVE</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                  MILESTONE-GATED PROGRESSION
                </div>
                <div className="text-gray-600">
                  NETWORK: BASE L2 (SEPOLIA TESTNET)
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-2 text-[10px] font-black tracking-widest rounded-full bg-gradient-to-r from-cyan-600 to-blue-700 transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                >
                  JOIN DISCORD
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-6 py-2 text-[10px] font-black tracking-widest rounded-full border hover:bg-white/5 transition-all"
                  style={{
                    borderColor: `${current?.color}40`,
                    color: current?.color,
                  }}
                >
                  FOLLOW UPDATES
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// "use client";
// import { motion, AnimatePresence } from "framer-motion";
// import { useState } from "react";
// import Header from "@/components/Header";
// import Footer from "@/components/Footer";

// export default function RoadmapPage() {
//   const [selectedPhase, setSelectedPhase] = useState(1);

//   const phases = [
//     { 
//       id: 1, 
//       title: "CORE LAUNCH", 
//       status: "IN DEVELOPMENT", 
//       progress: 35,
//       color: "#06b6d4", 
//       glow: "rgba(6,182,212,0.5)", 
//       icon: "🚀", 
//       year: "2026 Q2",
//       desc: "Essential agents for security and profit",
//       achievements: [
//         "Agent Alpha (Arbitrage)", 
//         "Agent V (Proof of Exit)", 
//         "Agent Gas infrastructure", 
//         "$AX token launch"
//       ],
//       x: 20, y: 30, z: 0
//     },
//     { 
//       id: 2, 
//       title: "AUDIT & MAINNET", 
//       status: "PLANNED", 
//       progress: 0,
//       color: "#22c55e", 
//       glow: "rgba(34,197,94,0.5)",
//       icon: "🛡️", 
//       year: "2026 Q3",
//       desc: "Security audit and public deployment",
//       achievements: [
//         "Security audit (Certik/OpenZeppelin)", 
//         "Bug fixes & optimizations", 
//         "Base mainnet deployment", 
//         "$AX DEX listing"
//       ],
//       x: 50, y: 50, z: -20
//     },
//     { 
//       id: 3, 
//       title: "FEATURE EXPANSION", 
//       status: "VISION", 
//       progress: 0,
//       color: "#eab308", 
//       glow: "rgba(234,179,8,0.5)",
//       icon: "📈", 
//       year: "2026 Q4",
//       desc: "Advanced agents and V-PROOFS",
//       achievements: [
//         "Agent Sigma (Privacy research)", 
//         "Agent Delta (Yield optimization)", 
//         "Agent Omega (Risk management)", 
//         "Full V-PROOFS activation"
//       ],
//       x: 80, y: 30, z: 0
//     },
//     { 
//       id: 4, 
//       title: "QED INTEGRATION", 
//       status: "FUTURE", 
//       progress: 0,
//       color: "#a855f7", 
//       glow: "rgba(168,85,247,0.5)",
//       icon: "✨", 
//       year: "2027+",
//       desc: "Institutional compliance and ZK-identity",
//       achievements: [
//         "ZK-identity system", 
//         "Institutional compliance layer", 
//         "Private data marketplace", 
//         "Cross-protocol integration"
//       ],
//       x: 50, y: 10, z: 20
//     }
//   ];

//   const current = phases.find(p => p.id === selectedPhase);

//   return (
//     <div className="min-h-screen flex flex-col bg-[#020617] text-white overflow-hidden relative">
//       <style jsx global>{`
//         @import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Space+Mono:wght@400;700&display=swap');
        
//         body { font-family: 'Inter', sans-serif; }
//         .font-mono { font-family: 'Space Mono', monospace; }

//         @keyframes pulse-glow {
//           0%, 100% { box-shadow: 0 0 20px currentColor; }
//           50% { box-shadow: 0 0 60px currentColor; }
//         }
//         .glass-panel {
//           background: rgba(15, 23, 42, 0.6);
//           backdrop-filter: blur(12px);
//           border: 1px solid rgba(255, 255, 255, 0.05);
//         }
//       `}</style>

//       <Header />

//       <main className="flex-grow flex items-center justify-center px-6 pt-24 pb-12 relative">
//         {/* Grid Background */}
//         <div className="absolute inset-0 opacity-20" style={{
//           backgroundImage: 'linear-gradient(rgba(6,182,212,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.1) 1px, transparent 1px)',
//           backgroundSize: '100px 100px',
//           transform: 'perspective(500px) rotateX(60deg)',
//           transformOrigin: 'center'
//         }} />

//         <div className="max-w-7xl w-full relative z-10">
//           {/* Title */}
//           <motion.div
//             initial={{ opacity: 0, y: -50 }}
//             animate={{ opacity: 1, y: 0 }}
//             className="text-center mb-8"
//           >
//             <h1 className="text-8xl font-black italic mb-4 tracking-tighter">
//               THE <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">ROADMAP</span>
//             </h1>
//             <p className="text-gray-400 text-lg font-mono uppercase tracking-[0.2em]">Four phases. One vision. Zero compromises.</p>
//           </motion.div>

//           {/* Main Holographic Display */}
//           <div className="grid grid-cols-12 gap-6 h-[550px]">
//             {/* Left: Phase Selector */}
//             <div className="col-span-3 space-y-3">
//               {phases.map((phase) => (
//                 <motion.div
//                   key={phase.id}
//                   onClick={() => setSelectedPhase(phase.id)}
//                   whileHover={{ scale: 1.05, x: 10 }}
//                   className={`glass-panel p-4 cursor-pointer relative overflow-hidden rounded-xl transition-all ${
//                     selectedPhase === phase.id ? 'border-cyan-500/50' : 'border-white/5'
//                   }`}
//                   style={{
//                     background: selectedPhase === phase.id ? `${phase.glow}15` : 'rgba(15, 23, 42, 0.3)'
//                   }}
//                 >
//                   {selectedPhase === phase.id && (
//                     <motion.div
//                       className="absolute inset-0"
//                       style={{ background: `linear-gradient(90deg, ${phase.glow}, transparent)` }}
//                       animate={{ x: ['-100%', '100%'] }}
//                       transition={{ duration: 2, repeat: Infinity }}
//                     />
//                   )}
                  
//                   <div className="relative z-10 flex items-center gap-3">
//                     <div className="text-3xl filter drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]">{phase.icon}</div>
//                     <div className="flex-1">
//                       <div className="font-black text-[10px] font-mono tracking-widest" style={{ color: phase.color }}>
//                         PHASE 0{phase.id}
//                       </div>
//                       <div className="text-xs text-white font-bold italic uppercase tracking-wider">{phase.year}</div>
//                     </div>
//                     {phase.status === 'IN DEVELOPMENT' && (
//                       <div className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center animate-pulse text-[8px]">◉</div>
//                     )}
//                     {phase.status === 'PLANNED' && (
//                       <div className="w-6 h-6 rounded-full bg-green-500/30 border border-green-500 flex items-center justify-center text-[8px]">○</div>
//                     )}
//                   </div>
//                 </motion.div>
//               ))}
//             </div>

//             {/* Center: 3D Holographic Display */}
//             <div className="col-span-6 relative flex items-center justify-center">
//               <div className="absolute inset-0 flex items-center justify-center">
//                 {/* Rotating Ring */}
//                 <motion.div
//                   animate={{ rotate: 360 }}
//                   transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
//                   className="absolute w-[400px] h-[400px] rounded-full"
//                   style={{
//                     border: `1px solid ${current?.color}20`,
//                     boxShadow: `0 0 40px ${current?.glow}20`
//                   }}
//                 />

//                 {/* Phase Orbits */}
//                 {phases.map((phase) => {
//                   const isActive = phase.id === selectedPhase;
//                   const angle = (phase.id - 1) * 90;
//                   const distance = 220;
                  
//                   return (
//                     <motion.div
//                       key={phase.id}
//                       className="absolute"
//                       style={{
//                         left: '50%',
//                         top: '50%',
//                         transform: `translate(calc(-50% + ${distance * Math.cos((angle * Math.PI) / 180)}px), calc(-50% + ${distance * Math.sin((angle * Math.PI) / 180)}px))`,
//                         zIndex: 50
//                       }}
//                     >
//                       <motion.div
//                         onClick={() => setSelectedPhase(phase.id)}
//                         whileHover={{ scale: 1.3 }}
//                         animate={{ 
//                           scale: isActive ? 1.2 : 1,
//                           boxShadow: isActive ? [`0 0 60px ${phase.glow}`, `0 0 100px ${phase.glow}`, `0 0 60px ${phase.glow}`] : `0 0 20px ${phase.glow}20`
//                         }}
//                         transition={{ duration: 2, repeat: Infinity }}
//                         className="w-16 h-16 rounded-full flex items-center justify-center text-2xl cursor-pointer relative"
//                         style={{
//                           background: isActive ? phase.color : `${phase.color}20`,
//                           border: `2px solid ${phase.color}`,
//                         }}
//                       >
//                         {phase.icon}
//                         {isActive && [...Array(3)].map((_, i) => (
//                           <motion.div
//                             key={i}
//                             className="absolute w-1.5 h-1.5 rounded-full"
//                             style={{ background: phase.color }}
//                             animate={{
//                               rotate: 360,
//                               x: [35 * Math.cos((i * 120 * Math.PI) / 180), 35 * Math.cos(((i * 120 + 360) * Math.PI) / 180)],
//                               y: [35 * Math.sin((i * 120 * Math.PI) / 180), 35 * Math.sin(((i * 120 + 360) * Math.PI) / 180)]
//                             }}
//                             transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: i * 0.3 }}
//                           />
//                         ))}
//                       </motion.div>
//                     </motion.div>
//                   );
//                 })}

//                 {/* Center Hologram */}
//                 <AnimatePresence mode="wait">
//                   <motion.div
//                     key={selectedPhase}
//                     initial={{ opacity: 0, scale: 0, rotateY: -180 }}
//                     animate={{ opacity: 1, scale: 1, rotateY: 0 }}
//                     exit={{ opacity: 0, scale: 0, rotateY: 180 }}
//                     transition={{ duration: 0.6, ease: "easeOut" }}
//                     className="glass-panel p-8 text-center relative rounded-3xl w-[320px]"
//                     style={{
//                       background: `${current?.glow}05`,
//                       borderColor: `${current?.color}40`,
//                       boxShadow: `0 0 60px ${current?.glow}20`
//                     }}
//                   >
//                     <div className="text-6xl mb-4">{current?.icon}</div>
//                     <h2 className="text-2xl font-black italic mb-2 tracking-tight" style={{ color: current?.color }}>
//                       {current?.title}
//                     </h2>
//                     <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-6">{current?.desc}</div>
                    
//                     <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-3">
//                       <motion.div
//                         className="h-full"
//                         style={{ background: current?.color }}
//                         initial={{ width: 0 }}
//                         animate={{ width: `${current?.progress}%` }}
//                         transition={{ duration: 1.5, ease: "easeOut" }}
//                       />
//                     </div>
                    
//                     <div className="text-[10px] font-mono font-bold" style={{ color: current?.color }}>
//                       {current?.progress}% COMPLETE
//                     </div>
//                   </motion.div>
//                 </AnimatePresence>
//               </div>
//             </div>

//             {/* Right: Mission Details */}
//             <div className="col-span-3">
//               <AnimatePresence mode="wait">
//                 <motion.div
//                   key={selectedPhase}
//                   initial={{ opacity: 0, x: 50 }}
//                   animate={{ opacity: 1, x: 0 }}
//                   exit={{ opacity: 0, x: -50 }}
//                   className="glass-panel p-6 h-full rounded-2xl flex flex-col"
//                   style={{
//                     borderLeft: `2px solid ${current?.color}`,
//                     background: `${current?.glow}05`
//                   }}
//                 >
//                   <div className="text-[10px] font-mono text-cyan-400 font-bold mb-6 tracking-widest uppercase">// Phase Details</div>
                  
//                   <div className="space-y-6">
//                     <div>
//                       <div className="text-[10px] font-mono text-gray-500 uppercase mb-1">Status</div>
//                       <div className="font-black text-sm italic tracking-widest" style={{ color: current?.color }}>
//                         {current?.status}
//                       </div>
//                     </div>

//                     <div className="flex-grow">
//                       <div className="text-[10px] font-mono text-gray-500 uppercase mb-3">Key Deliverables</div>
//                       {current?.achievements.map((ach, idx) => (
//                         <motion.div
//                           key={idx}
//                           initial={{ opacity: 0, x: 20 }}
//                           animate={{ opacity: 1, x: 0 }}
//                           transition={{ delay: idx * 0.1 }}
//                           className="flex items-start gap-3 mb-3"
//                         >
//                           <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: current?.color }} />
//                           <div className="text-[11px] font-mono text-gray-400 leading-relaxed">{ach}</div>
//                         </motion.div>
//                       ))}
//                     </div>
//                   </div>
//                 </motion.div>
//               </AnimatePresence>
//             </div>
//           </div>

//           {/* Bottom Terminal */}
//           <motion.div
//             initial={{ opacity: 0, y: 50 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: 0.5 }}
//             className="glass-panel p-6 mt-8 rounded-2xl"
//           >
//             <div className="flex items-center justify-between">
//               <div className="flex items-center gap-8 font-mono text-[10px] text-gray-500">
//                 <div className="flex items-center gap-2">
//                   <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
//                   PHASE 01: IN DEVELOPMENT
//                 </div>
//                 <div className="flex items-center gap-2 text-cyan-500">
//                   <span className="w-1.5 h-1.5 rounded-full bg-current" />
//                   TARGET: Q2 2026
//                 </div>
//                 <div>PROGRESS: 35%</div>
//               </div>
              
//               <div className="flex gap-4">
//                 <motion.button
//                   whileHover={{ scale: 1.05 }}
//                   whileTap={{ scale: 0.95 }}
//                   className="px-8 py-2.5 text-[10px] font-black tracking-widest rounded-full bg-gradient-to-r from-cyan-600 to-blue-700 transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]"
//                 >
//                   JOIN DISCORD
//                 </motion.button>
//                 <motion.button
//                   whileHover={{ scale: 1.05 }}
//                   whileTap={{ scale: 0.95 }}
//                   className="px-8 py-2.5 text-[10px] font-black tracking-widest rounded-full border border-white/10 hover:bg-white/5 transition-all text-cyan-400"
//                   style={{ borderColor: `${current?.color}40` }}
//                 >
//                   FOLLOW UPDATES
//                 </motion.button>
//               </div>
//             </div>
//           </motion.div>
//         </div>
//       </main>

//       <Footer />
//     </div>
//   );
// }