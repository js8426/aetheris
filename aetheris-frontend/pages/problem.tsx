// Aetheris\aetheris-frontend\pages\problem.tsx

// Aetheris\aetheris-frontend\pages\problem.tsx
// CHANGES FROM ORIGINAL (surgical — structure/design/layout untouched):
// 1. Added 4th problem card: "Fragmented Infrastructure" (whitepaper section 2.4)
// 2. Title: "The Three Crises" → "The Four Problems"
// 3. Grid: md:grid-cols-3 → md:grid-cols-2 (4 cards)
// 4. "SOLVES ALL THREE" → "SOLVES ALL FOUR"
// 5. All existing stats (40M, $1.1B, 52%, 9.8%) confirmed in whitepaper — preserved unchanged

"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ProblemPage() {
  const problems = [
    {
      icon: "⛽",
      title: "The Gas Barrier",
      stat: "40M+ Accounts",
      statLabel: "ERC-4337 wallets demand gasless",
      description: "You have $5,000 in USDC but need $20 in ETH just to execute one trade. Managing gas fees is complex, expensive, and frustrating.",
      pain: "Buy ETH, pay fees, wait for confirmations—just to make ONE transaction",
      source: "¹",
    },
    {
      icon: "🔒",
      title: "The Trust Crisis",
      stat: "$1.1B Lost",
      statLabel: "DeFi exploits in H1 2025 alone",
      description: "One malicious contract upgrade and your funds vanish forever. 52% of breaches are smart contract vulnerabilities or intentional developer backdoors, with no user protection.",
      pain: "Wake up to find the protocol upgraded and your entire portfolio drained",
      source: "²",
    },
    {
      icon: "💤",
      title: "Dead Capital",
      stat: "9.8% vs 0.5%",
      statLabel: "DeFi yields vs traditional savings",
      description: "Your funds earn 0% while sitting idle. DeFi offers 9.8% average APY on stablecoins, but arbitrage, funding rate capture, and optimised liquidity provision require superhuman speed or 24/7 attention.",
      pain: "Miss profitable opportunities every minute because you're asleep or at work",
      source: "²",
    },
    {
      icon: "🗺️",
      title: "Fragmented Infrastructure",
      stat: "5 Chains",
      statLabel: "Required for optimal yield in 2026",
      description: "An optimal yield strategy in 2026 requires positions on Base, Arbitrum, Ethereum mainnet, and Hyperliquid simultaneously. Managing this manually — with different wallets, different bridges, and different gas tokens — is beyond the practical capacity of any individual user.",
      pain: "Miss the best yield opportunities because your capital is on the wrong chain",
      source: "³",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      <Header />

      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight">
              The Four Problems
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                Blocking DeFi
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Why billions in capital remain locked out of the autonomous economy
            </p>
          </motion.div>

          {/* Problem Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {problems.map((problem, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 * i }}
                whileHover={{ y: -10, boxShadow: "0 0 40px rgba(6,182,212,0.3)" }}
                className="glass-panel p-8 relative overflow-hidden"
              >
                {/* Corner glow */}
                <div 
                  className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20"
                  style={{ background: i === 0 ? '#06b6d4' : i === 1 ? '#ef4444' : i === 2 ? '#22c55e' : '#a855f7' }}
                />

                <div className="relative z-10">
                  <div className="text-6xl mb-4">{problem.icon}</div>
                  
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                    Problem {i + 1}
                  </div>
                  
                  <h3 className="text-2xl font-black mb-4">{problem.title}</h3>
                  
                  {/* Verified Stat */}
                  <div className="mb-4">
                    <div 
                      className="text-3xl font-black mb-1"
                      style={{ color: i === 0 ? '#06b6d4' : i === 1 ? '#ef4444' : i === 2 ? '#22c55e' : '#a855f7' }}
                    >
                      {problem.stat}
                      <sup className="text-xs text-gray-500">{problem.source}</sup>
                    </div>
                    <div className="text-xs text-gray-500">{problem.statLabel}</div>
                  </div>

                  <p className="text-gray-400 mb-6 leading-relaxed text-sm">
                    {problem.description}
                  </p>

                  {/* User Pain Quote */}
                  <div 
                    className="rounded-lg p-4 border-l-4"
                    style={{ 
                      background: i === 0 ? 'rgba(6,182,212,0.1)' : i === 1 ? 'rgba(239,68,68,0.1)' : i === 2 ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                      borderColor: i === 0 ? '#06b6d4' : i === 1 ? '#ef4444' : i === 2 ? '#22c55e' : '#a855f7'
                    }}
                  >
                    <p className="text-sm italic" style={{ color: i === 0 ? '#06b6d4' : i === 1 ? '#ef4444' : i === 2 ? '#22c55e' : '#a855f7' }}>
                      "{problem.pain}"
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* The Convergence Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="glass-panel p-12 mb-12"
          >
            <h2 className="text-3xl font-black mb-6 text-center">
              Why This Matters in <span className="text-cyan-400">2026</span>
            </h2>
            <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
              We're entering the era of <strong className="text-white">Autonomous Commerce</strong>. 
              Millions of AI agents will need to make independent financial decisions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/5 rounded-lg p-6">
                <div className="text-2xl mb-3">🤖</div>
                <h3 className="font-bold mb-2">The M2M Economy</h3>
                <p className="text-sm text-gray-400">
                  Machine-to-Machine payments are exploding. AI agents need to buy data, compute, and services autonomously.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-6">
                <div className="text-2xl mb-3">⚡</div>
                <h3 className="font-bold mb-2">The Speed Problem</h3>
                <p className="text-sm text-gray-400">
                  A human cannot execute arbitrage in a two-second window. Institutional bots execute within 200ms. Manual participation is structurally impossible.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-6">
                <div className="text-2xl mb-3">🛡️</div>
                <h3 className="font-bold mb-2">The Vigilance Gap</h3>
                <p className="text-sm text-gray-400">
                  A human cannot monitor smart contract bytecode changes at the block level while sleeping. One missed upgrade destroys everything.
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-6">
                <div className="text-2xl mb-3">💰</div>
                <h3 className="font-bold mb-2">Capital Efficiency</h3>
                <p className="text-sm text-gray-400">
                  Idle capital in wallets or on the wrong chain earns nothing. Agents that never sleep keep capital deployed where the best opportunity currently exists.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Solution CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="glass-panel p-12 text-center"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-6">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                AETHERIS
              </span>{" "}
              SOLVES ALL FOUR
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Deploy autonomous AI agents that handle gas, protect against rugs, earn yield, and coordinate capital across chains — all while you sleep.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/how-it-works">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full font-black"
                >
                  See How It Works →
                </motion.button>
              </Link>
              <Link href="/agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 border-2 border-cyan-400 text-cyan-400 rounded-full font-black hover:bg-cyan-400/10"
                >
                  Meet the Agents
                </motion.button>
              </Link>
            </div>
          </motion.div>

          {/* Sources Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-12 pt-8 border-t border-white/10"
          >
            <div className="text-xs text-gray-500 space-y-2">
              <p className="font-bold text-gray-400 mb-3">Data Sources:</p>
              <p>
                <sup>1</sup> Alchemy. "What is ERC-4337?" January 2026.{" "}
                <a 
                  href="https://www.alchemy.com/overviews/what-is-account-abstraction" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  Source
                </a>
              </p>
              <p>
                <sup>2</sup> CoinLaw. "DeFi vs. Traditional Banking Statistics 2025." July 2025.{" "}
                <a 
                  href="https://coinlaw.io/defi-vs-traditional-banking-statistics/" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  Source
                </a>
              </p>
              <p>
                <sup>3</sup> Aetheris Revised Whitepaper v3, Section 2.4 — Fragmented Infrastructure.
              </p>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </div>
  );
}