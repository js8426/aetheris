// Aetheris\aetheris-frontend\pages\v-proofs.tsx

// Aetheris\aetheris-frontend\pages\v-proofs.tsx
// UPDATED: Revised Whitepaper v3 — removed burn/buyback refs, fixed fee model to 20% performance fee, updated agent list

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function VProofsPage() {
  const [selectedTab, setSelectedTab] = useState<"overview" | "latest" | "history">("overview");
  const [showVerification, setShowVerification] = useState(false);

  // NOTE: These are illustrative figures for a future live protocol state.
  // V-PROOFS are not yet active — Phase 1 is currently in stealth mainnet validation.
  const latestProof = {
    proofNumber: 847,
    timestamp: "2026-02-18 14:30:00 UTC",
    blockNumber: 18234567,
    status: "VERIFIED",
    data: {
      totalValueLocked:     "$142,347,523",
      vaultDepositors:      "3,847",
      contractsMonitored:   "2,847",
      agentTransactions24h: "89,234",
      threatsDetected:      "23",
      threatsBlocked:       "23",
      usersProtected:       "143",
      protocolFeeUSDC:      "$28,469",   // 20% performance fee on agent profits (v3 Section 5.1)
      stakerDistributions:  "$28,469",   // 100% of protocol fee → ProfitDistributor (v3 Section 4.3)
    },
    ipfsHash: "QmXyz123...",
    verificationTime: "47ms"
  };

  const historicalProofs = [
    { number: 847, time: "Feb 18, 20:00", tvl: "$142.5M", depositors: 3851, threats: 2,  status: "verified" },
    { number: 846, time: "Feb 18, 14:00", tvl: "$142.3M", depositors: 3847, threats: 23, status: "verified" },
    { number: 845, time: "Feb 18, 08:00", tvl: "$142.7M", depositors: 3850, threats: 1,  status: "verified" },
    { number: 844, time: "Feb 18, 02:00", tvl: "$141.9M", depositors: 3845, threats: 0,  status: "verified" },
    { number: 843, time: "Feb 17, 20:00", tvl: "$141.2M", depositors: 3842, threats: 3,  status: "verified" },
  ];

  const benefits = [
    {
      icon: "🔐",
      title: "Zero-Knowledge Privacy",
      description: "Aggregate statistics are proven correct without revealing any individual user data, balances, or transaction details."
    },
    {
      icon: "✓",
      title: "Mathematical Certainty",
      description: "ZK-SNARKs provide cryptographic proof that cannot be faked. Either the proof is valid or it isn't — no middle ground."
    },
    {
      icon: "⚡",
      title: "Real-Time Verification",
      description: "Anyone can verify any V-PROOF independently in ~50ms. No need to trust Aetheris — verify the math yourself."
    },
    {
      icon: "📊",
      title: "Transparent Operations",
      description: "Prove vault solvency, agent performance, security effectiveness, and fee collection without third-party audits."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      <Header />

      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">

          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-7xl font-black mb-6">
              V-
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">PROOFS</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-4">
              Cryptographic attestations proving protocol integrity without revealing private data
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full">
              <span className="text-yellow-500 text-sm font-bold">⚠️ PLANNED — PHASE 3</span>
            </div>
          </motion.div>

          {/* What Are V-PROOFS */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-8 md:p-12 mb-16"
          >
            <h2 className="text-3xl font-black mb-6">What Are V-PROOFS?</h2>

            <div className="space-y-6 text-gray-300">
              <p className="leading-relaxed">
                V-PROOFS (Verifiable Proofs) are <strong className="text-white">Zero-Knowledge cryptographic attestations</strong> published
                every 6 hours that prove Aetheris is operating correctly. They provide mathematical certainty about protocol
                health — vault TVL, agent performance, security events, fee distribution — without revealing any individual user data.
              </p>

              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
                <h3 className="font-bold text-lg mb-3 text-green-400">The Innovation:</h3>
                <p className="text-sm leading-relaxed">
                  V-PROOFS solve the impossible: <strong>100% transparency AND 100% privacy simultaneously.</strong> Using
                  ZK-SNARKs (Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge), we prove aggregate statistics
                  are correct without revealing the underlying private data. You don't need to trust Aetheris — you can verify
                  the math yourself in ~50 milliseconds.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <h4 className="font-bold mb-3 text-green-400">✓ What V-PROOFS Prove</h4>
                  <ul className="space-y-2 text-sm">
                    <li>• Vault TVL is accurate — no phantom deposits</li>
                    <li>• Agent-generated profit figures are real</li>
                    <li>• Protocol fee (20% of profits) is correctly calculated</li>
                    <li>• USDC staker distributions match ProfitDistributor records</li>
                    <li>• Security events detected and blocked by Agent V</li>
                    <li>• Vault NAV per share calculation is correct</li>
                  </ul>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <h4 className="font-bold mb-3 text-red-400">✗ What V-PROOFS Don't Reveal</h4>
                  <ul className="space-y-2 text-sm">
                    <li>• Individual depositor balances or vault shares</li>
                    <li>• Specific wallet addresses</li>
                    <li>• Individual staker distribution amounts</li>
                    <li>• Agent execution parameters or thresholds</li>
                    <li>• Any personally identifiable data</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Tab Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex gap-4 border-b border-white/10">
              {(["overview", "latest", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`px-6 py-3 font-bold transition-colors relative capitalize ${
                    selectedTab === tab ? "text-green-400" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "latest" ? "Latest Proof" : tab}
                  {selectedTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400"
                    />
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Tab Content */}
          <motion.div
            key={selectedTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >

            {/* ── OVERVIEW ── */}
            {selectedTab === "overview" && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {benefits.map((benefit, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="glass-panel p-6 hover:bg-white/5 transition-all"
                    >
                      <div className="text-5xl mb-4">{benefit.icon}</div>
                      <h3 className="text-xl font-black mb-3">{benefit.title}</h3>
                      <p className="text-sm text-gray-400 leading-relaxed">{benefit.description}</p>
                    </motion.div>
                  ))}
                </div>

                {/* How It Works */}
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black mb-6">How V-PROOFS Work</h3>
                  <div className="space-y-6">
                    {[
                      {
                        title: "Data Collection",
                        desc: "Every 6 hours, the V-PROOFS service queries Base L2 for all vault share balances, agent profit cycles, ProfitDistributor distributions, and Agent V security events."
                      },
                      {
                        title: "Aggregate Calculation",
                        desc: "Private data is aggregated into public statistics: total TVL, vault depositor count, agent profits generated, 20% protocol fee collected, USDC distributed to stakers, threats blocked."
                      },
                      {
                        title: "ZK-SNARK Generation",
                        desc: "A cryptographic proof is generated that proves the aggregates are correctly computed from the private data — without revealing the private data itself."
                      },
                      {
                        title: "Publication",
                        desc: "The proof and public data are published on-chain (Base L2) and to IPFS (decentralized storage). Anyone can access and verify independently."
                      },
                      {
                        title: "Verification",
                        desc: "Anyone can verify the proof mathematically in ~50ms. No trust required — the math either checks out or it doesn't. Groth16 ZK-SNARK on BN254 curve."
                      }
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center font-bold text-green-400 flex-shrink-0">
                          {i + 1}
                        </div>
                        <div>
                          <h4 className="font-bold mb-2">{step.title}</h4>
                          <p className="text-sm text-gray-400">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Why It Matters */}
                <div className="glass-panel p-8 bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
                  <h3 className="text-2xl font-black mb-4">Why This Matters</h3>
                  <div className="space-y-4 text-sm text-gray-300">
                    <p>
                      <strong className="text-white">Traditional DeFi requires blind trust.</strong> Protocols claim
                      they have X in TVL, Y in profits, and Z in distributed yield — but you have no way to verify these
                      claims without accessing private user data. Dashboard numbers are self-reported.
                    </p>
                    <p>
                      <strong className="text-white">V-PROOFS eliminate this trust requirement.</strong> Using
                      Zero-Knowledge cryptography, Aetheris proves every claim mathematically. You don't need to
                      trust the team, the dashboard, or third-party auditors. You verify the math yourself.
                    </p>
                    <p className="text-green-400 font-bold">
                      In H1 2025, $1.1 billion was lost because users trusted protocols that lied about their code and solvency.
                      V-PROOFS ensure Aetheris can never lie about its metrics.
                    </p>
                  </div>
                </div>

                {/* Phase 3 Note */}
                <div className="glass-panel p-6 border-yellow-500/20 bg-yellow-500/5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🗓️</span>
                    <div>
                      <h4 className="font-bold mb-2 text-yellow-400">Planned for Phase 3</h4>
                      <p className="text-sm text-gray-400">
                        V-PROOFS deploy in Phase 3, once the vault is live and Agent Shield's full defensive stack is operational.
                        Phase 3 targets first institutional vault allocations — and V-PROOFS are a prerequisite for that: institutions
                        require cryptographic proof of solvency, not dashboard screenshots. The ZK proving infrastructure is being
                        scoped now; it deploys when the protocol has sufficient on-chain activity to make the proofs meaningful.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── LATEST PROOF (Illustrative) ── */}
            {selectedTab === "latest" && (
              <div className="space-y-4">
                {/* Illustrative data banner */}
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <div className="font-bold text-yellow-400 text-sm mb-1">Illustrative Data</div>
                    <div className="text-xs text-gray-400">
                      V-PROOFS are not yet live. The figures below illustrate what a V-PROOF will look like once Phase 3 activates
                      and the vault has meaningful TVL. Current status: Phase 1 stealth mainnet validation.
                    </div>
                  </div>
                </div>

                <div className="glass-panel p-8 border-2 border-green-500/50">
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"/>
                      <h2 className="text-2xl md:text-3xl font-black text-green-500">PROTOCOL STATUS: VERIFIED</h2>
                    </div>
                    <div className="text-left md:text-right">
                      <div className="text-sm text-gray-400">V-PROOF #{latestProof.proofNumber}</div>
                      <div className="text-xs text-gray-500">{latestProof.timestamp}</div>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8">
                    {Object.entries(latestProof.data).map(([key, value], i) => (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + i * 0.05 }}
                        className="text-center p-4 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div className="text-2xl md:text-3xl font-black text-cyan-400 mb-2">{value}</div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Fee model note */}
                  <div className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-sm text-gray-400">
                    <strong className="text-white">Fee model (v3):</strong> 20% performance fee on all agent profits.
                    80% accrues to vault depositors as increased NAV per share. 20% flows to ProfitDistributor → distributed
                    to AX stakers in USDC. No management fee. No deposit fee. No buyback mechanism.
                  </div>

                  {/* Proof Details */}
                  <div className="bg-black/30 rounded-lg p-6 border border-green-500/20">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <span className="text-green-500">✓</span> Proof Details
                    </h3>
                    <div className="space-y-3 font-mono text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Status:</span>
                        <span className="text-green-500 font-bold">VERIFIED ✓</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Block Number:</span>
                        <span className="text-white">{latestProof.blockNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">IPFS Hash:</span>
                        <span className="text-cyan-400 truncate ml-2">{latestProof.ipfsHash}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Verification Time:</span>
                        <span className="text-white">{latestProof.verificationTime}</span>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row gap-4">
                      <button
                        onClick={() => setShowVerification(!showVerification)}
                        className="flex-1 px-6 py-3 bg-green-500 text-black rounded-lg font-bold hover:bg-green-400 transition-colors"
                      >
                        {showVerification ? "Hide Verification" : "Verify Proof Yourself"}
                      </button>
                      <button className="px-6 py-3 border-2 border-cyan-400 text-cyan-400 rounded-lg font-bold hover:bg-cyan-400/10 transition-colors">
                        View on IPFS →
                      </button>
                    </div>

                    {showVerification && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg"
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-2xl">✓</div>
                          <div>
                            <h4 className="font-bold text-green-400 mb-2">Proof Verified Successfully</h4>
                            <p className="text-xs text-gray-400 mb-3">
                              This proof is mathematically valid. The published statistics are correct and derived
                              from real on-chain data.
                            </p>
                            <div className="font-mono text-xs space-y-1 text-gray-500">
                              <div>Proof type: Groth16 ZK-SNARK</div>
                              <div>Elliptic curve: BN254</div>
                              <div>Verification completed in {latestProof.verificationTime}</div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── HISTORY (Illustrative) ── */}
            {selectedTab === "history" && (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div className="text-xs text-gray-400">
                    <span className="font-bold text-yellow-400">Illustrative Data · </span>
                    Historical proofs shown below are examples of what the archive will look like once V-PROOFS are live in Phase 3.
                  </div>
                </div>

                <div className="glass-panel p-8">
                  <h2 className="text-2xl font-black mb-6">Historical V-PROOFS</h2>
                  <div className="space-y-3">
                    {historicalProofs.map((proof, i) => (
                      <motion.div
                        key={proof.number}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.1 }}
                        className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors cursor-pointer gap-4"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center font-bold text-green-400 flex-shrink-0">
                            {proof.number}
                          </div>
                          <div>
                            <div className="font-bold">{proof.time}</div>
                            <div className="text-xs text-gray-400">Block {18234567 - (847 - proof.number)}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 md:gap-8">
                          <div className="text-center md:text-right">
                            <div className="text-sm font-bold text-cyan-400">{proof.tvl}</div>
                            <div className="text-xs text-gray-500">TVL</div>
                          </div>
                          <div className="text-center md:text-right">
                            <div className="text-sm font-bold">{proof.depositors}</div>
                            <div className="text-xs text-gray-500">Depositors</div>
                          </div>
                          <div className="text-center md:text-right">
                            <div className="text-sm font-bold text-red-400">{proof.threats}</div>
                            <div className="text-xs text-gray-500">Threats</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-green-500 text-sm">✓</span>
                            <span className="text-xs text-gray-400 uppercase">{proof.status}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-6 text-center">
                    <button className="px-8 py-3 border border-white/20 rounded-lg text-sm font-bold hover:bg-white/5 transition-colors">
                      Load More Historical Proofs
                    </button>
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// "use client";
// import { motion } from "framer-motion";
// import { useState } from "react";
// import Header from "@/components/Header";
// import Footer from "@/components/Footer";

// export default function VProofsPage() {
//   const [selectedTab, setSelectedTab] = useState<"overview" | "latest" | "history">("overview");
//   const [showVerification, setShowVerification] = useState(false);

//   const latestProof = {
//     proofNumber: 847,
//     timestamp: "2026-02-18 14:30:00 UTC",
//     blockNumber: 18234567,
//     status: "VERIFIED",
//     data: {
//       totalValueLocked: "$142,347,523",
//       activeUsers: "3,847",
//       contractsMonitored: "2,847",
//       transactionsLast24h: "89,234",
//       threatsDetected: "23",
//       threatsBlocked: "23",
//       usersProtected: "143",
//       feesCollected: "$12,847",
//       axBurned: "428,900"
//     },
//     ipfsHash: "QmXyz123...",
//     verificationTime: "47ms"
//   };

//   const historicalProofs = [
//     { number: 847, time: "Feb 18, 20:00", tvl: "$142.5M", users: 3851, threats: 2, status: "verified" },
//     { number: 846, time: "Feb 18, 14:00", tvl: "$142.3M", users: 3847, threats: 23, status: "verified" },
//     { number: 845, time: "Feb 18, 08:00", tvl: "$142.7M", users: 3850, threats: 1, status: "verified" },
//     { number: 844, time: "Feb 18, 02:00", tvl: "$141.9M", users: 3845, threats: 0, status: "verified" },
//     { number: 843, time: "Feb 17, 20:00", tvl: "$141.2M", users: 3842, threats: 3, status: "verified" }
//   ];

//   const benefits = [
//     {
//       icon: "🔐",
//       title: "Zero-Knowledge Privacy",
//       description: "Aggregate statistics are proven correct without revealing any individual user data, balances, or transaction details."
//     },
//     {
//       icon: "✓",
//       title: "Mathematical Certainty",
//       description: "ZK-SNARKs provide cryptographic proof that cannot be faked. Either the proof is valid or it isn't—no middle ground."
//     },
//     {
//       icon: "⚡",
//       title: "Real-Time Verification",
//       description: "Anyone can verify any V-PROOF independently in ~50ms. No need to trust Aetheris—verify the math yourself."
//     },
//     {
//       icon: "📊",
//       title: "Transparent Operations",
//       description: "Prove protocol solvency, security effectiveness, and fee collection without expensive third-party audits."
//     }
//   ];

//   return (
//     <div className="min-h-screen flex flex-col bg-[#020617]">
//       <Header />
      
//       <main className="flex-grow pt-32 pb-20 px-6">
//         <div className="max-w-7xl mx-auto">
          
//           {/* Hero Section */}
//           <motion.div 
//             initial={{ opacity: 0, y: 30 }} 
//             animate={{ opacity: 1, y: 0 }} 
//             className="text-center mb-16"
//           >
//             <h1 className="text-5xl md:text-7xl font-black mb-6">
//               V-
//               <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600">PROOFS</span>
//             </h1>
//             <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-4">
//               Cryptographic attestations that prove protocol integrity without revealing private data
//             </p>
//             <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full">
//               <span className="text-yellow-500 text-sm font-bold">⚠️ COMING Q4 2026</span>
//             </div>
//           </motion.div>

//           {/* What Are V-PROOFS */}
//           <motion.div
//             initial={{ opacity: 0, y: 30 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: 0.1 }}
//             className="glass-panel p-8 md:p-12 mb-16"
//           >
//             <h2 className="text-3xl font-black mb-6">What Are V-PROOFS?</h2>
            
//             <div className="space-y-6 text-gray-300">
//               <p className="leading-relaxed">
//                 V-PROOFS (Verifiable Proofs) are <strong className="text-white">Zero-Knowledge cryptographic attestations</strong> published 
//                 every 6 hours that prove Aetheris is operating correctly. They provide mathematical certainty about protocol 
//                 health without revealing any individual user data.
//               </p>

//               <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
//                 <h3 className="font-bold text-lg mb-3 text-green-400">The Innovation:</h3>
//                 <p className="text-sm leading-relaxed">
//                   V-PROOFS solve the impossible: <strong>100% transparency AND 100% privacy simultaneously.</strong> Using 
//                   ZK-SNARKs (Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge), we prove aggregate statistics 
//                   are correct without revealing the underlying private data. You don't need to trust Aetheris—you can verify 
//                   the math yourself in ~50 milliseconds.
//                 </p>
//               </div>

//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
//                 <div className="bg-white/5 border border-white/10 rounded-lg p-6">
//                   <h4 className="font-bold mb-3 text-green-400">✓ What V-PROOFS Prove</h4>
//                   <ul className="space-y-2 text-sm">
//                     <li>• Protocol solvency (TVL is accurate)</li>
//                     <li>• User activity (active users count)</li>
//                     <li>• Security effectiveness (threats blocked)</li>
//                     <li>• Fee transparency (actual fees collected)</li>
//                     <li>• Token economics ($AX burn is real)</li>
//                   </ul>
//                 </div>

//                 <div className="bg-white/5 border border-white/10 rounded-lg p-6">
//                   <h4 className="font-bold mb-3 text-red-400">✗ What V-PROOFS Don't Reveal</h4>
//                   <ul className="space-y-2 text-sm">
//                     <li>• Individual user balances</li>
//                     <li>• Specific wallet addresses</li>
//                     <li>• Transaction counterparties</li>
//                     <li>• Agent performance per user</li>
//                     <li>• Any personally identifiable data</li>
//                   </ul>
//                 </div>
//               </div>
//             </div>
//           </motion.div>

//           {/* Tab Navigation */}
//           <motion.div
//             initial={{ opacity: 0, y: 30 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ delay: 0.2 }}
//             className="mb-8"
//           >
//             <div className="flex gap-4 border-b border-white/10">
//               {(["overview", "latest", "history"] as const).map((tab) => (
//                 <button
//                   key={tab}
//                   onClick={() => setSelectedTab(tab)}
//                   className={`px-6 py-3 font-bold transition-colors relative capitalize ${
//                     selectedTab === tab 
//                       ? "text-green-400" 
//                       : "text-gray-400 hover:text-white"
//                   }`}
//                 >
//                   {tab === "latest" ? "Latest Proof" : tab}
//                   {selectedTab === tab && (
//                     <motion.div 
//                       layoutId="activeTab"
//                       className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400"
//                     />
//                   )}
//                 </button>
//               ))}
//             </div>
//           </motion.div>

//           {/* Tab Content */}
//           <motion.div
//             key={selectedTab}
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.3 }}
//           >
//             {/* Overview Tab */}
//             {selectedTab === "overview" && (
//               <div className="space-y-8">
//                 {/* Benefits */}
//                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//                   {benefits.map((benefit, i) => (
//                     <motion.div
//                       key={i}
//                       initial={{ opacity: 0, y: 20 }}
//                       animate={{ opacity: 1, y: 0 }}
//                       transition={{ delay: 0.3 + i * 0.1 }}
//                       className="glass-panel p-6 hover:bg-white/5 transition-all"
//                     >
//                       <div className="text-5xl mb-4">{benefit.icon}</div>
//                       <h3 className="text-xl font-black mb-3">{benefit.title}</h3>
//                       <p className="text-sm text-gray-400 leading-relaxed">{benefit.description}</p>
//                     </motion.div>
//                   ))}
//                 </div>

//                 {/* How It Works */}
//                 <div className="glass-panel p-8">
//                   <h3 className="text-2xl font-black mb-6">How V-PROOFS Work</h3>
                  
//                   <div className="space-y-6">
//                     {[
//                       {
//                         title: "Data Collection",
//                         desc: "Every 6 hours, the V-PROOFS service queries the blockchain for all user balances, threat detection events, trades, fees, and burns."
//                       },
//                       {
//                         title: "Aggregate Calculation",
//                         desc: "Private data is aggregated into public statistics: total TVL, user count, threats blocked, fees collected, etc."
//                       },
//                       {
//                         title: "ZK-SNARK Generation",
//                         desc: "A cryptographic proof is generated that proves the aggregates are correctly computed from the private data, without revealing the private data itself."
//                       },
//                       {
//                         title: "Publication",
//                         desc: "The proof and public data are published on-chain (Base L2) and to IPFS (decentralized storage). Anyone can access and verify."
//                       },
//                       {
//                         title: "Verification",
//                         desc: "Anyone can verify the proof mathematically in ~50ms. No trust required—the math either checks out or it doesn't."
//                       }
//                     ].map((step, i) => (
//                       <div key={i} className="flex items-start gap-4">
//                         <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center font-bold text-green-400 flex-shrink-0">
//                           {i + 1}
//                         </div>
//                         <div>
//                           <h4 className="font-bold mb-2">{step.title}</h4>
//                           <p className="text-sm text-gray-400">{step.desc}</p>
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>

//                 {/* Why It Matters */}
//                 <div className="glass-panel p-8 bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
//                   <h3 className="text-2xl font-black mb-4">Why This Matters</h3>
//                   <div className="space-y-4 text-sm text-gray-300">
//                     <p>
//                       <strong className="text-white">Traditional DeFi requires blind trust.</strong> Protocols claim 
//                       they have X in TVL, Y users, and Z in profits—but you have no way to verify these claims without 
//                       accessing private user data.
//                     </p>
//                     <p>
//                       <strong className="text-white">V-PROOFS eliminate this trust requirement.</strong> Using 
//                       Zero-Knowledge cryptography, Aetheris proves every claim mathematically. You don't need to 
//                       trust the team, the dashboard, or third-party auditors. You verify the math yourself.
//                     </p>
//                     <p className="text-green-400 font-bold">
//                       In H1 2025, $1.1 billion was lost because users trusted protocols that lied. V-PROOFS ensure 
//                       Aetheris can never lie about its metrics.
//                     </p>
//                   </div>
//                 </div>
//               </div>
//             )}

//             {/* Latest Proof Tab */}
//             {selectedTab === "latest" && (
//               <div className="glass-panel p-8 border-2 border-green-500/50">
//                 <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
//                   <div className="flex items-center gap-3">
//                     <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse"/>
//                     <h2 className="text-2xl md:text-3xl font-black text-green-500">PROTOCOL STATUS: VERIFIED</h2>
//                   </div>
//                   <div className="text-left md:text-right">
//                     <div className="text-sm text-gray-400">V-PROOF #{latestProof.proofNumber}</div>
//                     <div className="text-xs text-gray-500">{latestProof.timestamp}</div>
//                   </div>
//                 </div>

//                 {/* Metrics Grid */}
//                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8">
//                   {Object.entries(latestProof.data).map(([key, value], i) => (
//                     <motion.div
//                       key={key}
//                       initial={{ opacity: 0, scale: 0.9 }}
//                       animate={{ opacity: 1, scale: 1 }}
//                       transition={{ delay: 0.4 + i * 0.05 }}
//                       className="text-center p-4 bg-white/5 rounded-lg border border-white/10"
//                     >
//                       <div className="text-2xl md:text-3xl font-black text-cyan-400 mb-2">{value}</div>
//                       <div className="text-xs text-gray-400 uppercase tracking-wider">
//                         {key.replace(/([A-Z])/g, ' $1').trim()}
//                       </div>
//                     </motion.div>
//                   ))}
//                 </div>

//                 {/* Proof Details */}
//                 <div className="bg-black/30 rounded-lg p-6 border border-green-500/20">
//                   <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
//                     <span className="text-green-500">✓</span> Proof Details
//                   </h3>
//                   <div className="space-y-3 font-mono text-sm">
//                     <div className="flex justify-between">
//                       <span className="text-gray-400">Status:</span>
//                       <span className="text-green-500 font-bold">VERIFIED ✓</span>
//                     </div>
//                     <div className="flex justify-between">
//                       <span className="text-gray-400">Block Number:</span>
//                       <span className="text-white">{latestProof.blockNumber}</span>
//                     </div>
//                     <div className="flex justify-between">
//                       <span className="text-gray-400">IPFS Hash:</span>
//                       <span className="text-cyan-400 truncate ml-2">{latestProof.ipfsHash}</span>
//                     </div>
//                     <div className="flex justify-between">
//                       <span className="text-gray-400">Verification Time:</span>
//                       <span className="text-white">{latestProof.verificationTime}</span>
//                     </div>
//                   </div>

//                   {/* Verify Button */}
//                   <div className="mt-6 flex flex-col sm:flex-row gap-4">
//                     <button
//                       onClick={() => setShowVerification(!showVerification)}
//                       className="flex-1 px-6 py-3 bg-green-500 text-black rounded-lg font-bold hover:bg-green-400 transition-colors"
//                     >
//                       {showVerification ? "Hide Verification" : "Verify Proof Yourself"}
//                     </button>
//                     <button className="px-6 py-3 border-2 border-cyan-400 text-cyan-400 rounded-lg font-bold hover:bg-cyan-400/10 transition-colors">
//                       View on IPFS →
//                     </button>
//                   </div>

//                   {/* Verification Result */}
//                   {showVerification && (
//                     <motion.div
//                       initial={{ opacity: 0, height: 0 }}
//                       animate={{ opacity: 1, height: 'auto' }}
//                       exit={{ opacity: 0, height: 0 }}
//                       className="mt-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg"
//                     >
//                       <div className="flex items-start gap-3">
//                         <div className="text-2xl">✓</div>
//                         <div>
//                           <h4 className="font-bold text-green-400 mb-2">Proof Verified Successfully</h4>
//                           <p className="text-xs text-gray-400 mb-3">
//                             This proof is mathematically valid. The published statistics are correct and derived 
//                             from real on-chain data.
//                           </p>
//                           <div className="font-mono text-xs space-y-1 text-gray-500">
//                             <div>Proof type: Groth16 ZK-SNARK</div>
//                             <div>Elliptic curve: BN254</div>
//                             <div>Verification completed in {latestProof.verificationTime}</div>
//                           </div>
//                         </div>
//                       </div>
//                     </motion.div>
//                   )}
//                 </div>
//               </div>
//             )}

//             {/* History Tab */}
//             {selectedTab === "history" && (
//               <div className="glass-panel p-8">
//                 <h2 className="text-2xl font-black mb-6">Historical V-PROOFS</h2>
                
//                 <div className="space-y-3">
//                   {historicalProofs.map((proof, i) => (
//                     <motion.div
//                       key={proof.number}
//                       initial={{ opacity: 0, x: -20 }}
//                       animate={{ opacity: 1, x: 0 }}
//                       transition={{ delay: 0.4 + i * 0.1 }}
//                       className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors cursor-pointer gap-4"
//                     >
//                       <div className="flex items-center gap-4">
//                         <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center font-bold text-green-400 flex-shrink-0">
//                           {proof.number}
//                         </div>
//                         <div>
//                           <div className="font-bold">{proof.time}</div>
//                           <div className="text-xs text-gray-400">Block {18234567 - (847 - proof.number)}</div>
//                         </div>
//                       </div>
                      
//                       <div className="flex items-center gap-6 md:gap-8">
//                         <div className="text-center md:text-right">
//                           <div className="text-sm font-bold text-cyan-400">{proof.tvl}</div>
//                           <div className="text-xs text-gray-500">TVL</div>
//                         </div>
//                         <div className="text-center md:text-right">
//                           <div className="text-sm font-bold">{proof.users}</div>
//                           <div className="text-xs text-gray-500">Users</div>
//                         </div>
//                         <div className="text-center md:text-right">
//                           <div className="text-sm font-bold text-red-400">{proof.threats}</div>
//                           <div className="text-xs text-gray-500">Threats</div>
//                         </div>
//                         <div className="flex items-center gap-2">
//                           <span className="text-green-500 text-sm">✓</span>
//                           <span className="text-xs text-gray-400 uppercase">{proof.status}</span>
//                         </div>
//                       </div>
//                     </motion.div>
//                   ))}
//                 </div>

//                 <div className="mt-6 text-center">
//                   <button className="px-8 py-3 border border-white/20 rounded-lg text-sm font-bold hover:bg-white/5 transition-colors">
//                     Load More Historical Proofs
//                   </button>
//                 </div>
//               </div>
//             )}
//           </motion.div>

//         </div>
//       </main>

//       <Footer />
//     </div>
//   );
// }