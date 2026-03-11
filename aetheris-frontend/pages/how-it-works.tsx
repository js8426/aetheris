// Aetheris\aetheris-frontend\pages\how-it-works.tsx

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function HowItWorksPage() {
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const userJourney = [
    {
      step: 1,
      title: "Connect Your Wallet",
      description: "Connect your crypto wallet (MetaMask, Coinbase Wallet, etc.) to Aetheris. Your wallet address becomes your account—no signup, no email, no KYC required.",
      details: "Aetheris never holds your private keys. The connection is secure and you maintain full control of your assets at all times. Your wallet becomes an ERC-4337 smart account, enabling gasless transactions and session keys from day one."
    },
    {
      step: 2,
      title: "Deposit USDC",
      description: "Deposit USDC into the Aetheris Vault smart contract. Your funds are secured by audited contracts and protected by Agent V's continuous monitoring.",
      details: "No ETH needed for gas fees! Our Paymaster automatically handles gas in the background, charging you the equivalent in USDC. See Gasless Transactions for details."
    },
    {
      step: 3,
      title: "Activate Your Agents",
      description: "Choose which AI agents to deploy. Agent Alpha generates profit through arbitrage. Agent V protects against exploits. Additional agents deploy across Phases 2 through 5 as each is validated.",
      details: "Each agent operates as an independent smart contract with a defined permission scope. No agent has unrestricted access to vault capital. Activation is instant and requires only a signature."
    },
    {
      step: 4,
      title: "Agents Work 24/7",
      description: "Your activated agents monitor the blockchain continuously, executing profitable trades and preventing security threats—all automatically while you sleep.",
      details: "Agent Alpha scans DEX prices at sub-20ms speed in real time. Agent V monitors all approved contracts on every block. No manual intervention required."
    },
    {
      step: 5,
      title: "Earn Automatically",
      description: "Profits from Agent Alpha are distributed automatically to your balance. Security threats are blocked instantly by Agent V. Withdraw your funds anytime.",
      details: "View real-time performance metrics in your dashboard. Track every trade, every profit, and every threat prevented. A 20% performance fee on agent-generated profits is distributed to AX stakers — the remaining 80% accrues directly to depositors."
    }
  ];

  const systemLayers = [
    {
      layer: "User Interface",
      icon: "🖥️",
      description: "Web dashboard where you manage deposits, activate agents, and monitor performance",
      color: "#06b6d4"
    },
    {
      layer: "Smart Contracts",
      icon: "📜",
      description: "Audited contracts on Base L2 handling all fund custody, profit distribution, and agent permissions",
      color: "#22c55e"
    },
    {
      layer: "AI Agents",
      icon: "🤖",
      description: "22 purpose-built autonomous agents across four categories: revenue generation, security, infrastructure, and specialised services",
      color: "#a855f7"
    },
    {
      layer: "Infrastructure",
      icon: "⚙️",
      description: "ERC-4337 paymasters, Chainlink oracles, LayerZero cross-chain messaging, and hardened off-chain monitoring bots",
      color: "#eab308"
    },
    {
      layer: "Blockchain",
      icon: "⛓️",
      description: "Base L2 as the protocol home chain, expanding to Arbitrum, Ethereum mainnet, Hyperliquid, and Solana at full maturity",
      color: "#ef4444"
    }
  ];

  const technicalFeatures = [
    {
      title: "ERC-4337 Account Abstraction",
      icon: "⚡",
      description: "Pay gas fees in USDC instead of ETH. Our Paymaster handles the conversion automatically. Session keys allow agents to act on your behalf without per-transaction wallet confirmations.",
      link: "/gasless-transactions"
    },
    {
      title: "Atomic Execution",
      icon: "🔒",
      description: "All multi-step operations happen in a single transaction. If any step fails, everything reverts—your funds are never left in a partially protected state.",
      link: null
    },
    {
      title: "Flash Loans",
      icon: "⚡",
      description: "Agent Alpha borrows capital with zero collateral to execute arbitrage trades. Loans are repaid in the same transaction — capital-efficient execution with no upfront investment required.",
      link: null
    },
    {
      title: "Proof of Exit",
      icon: "🛡️",
      description: "Agent V's Kill Switch monitors every smart contract at the bytecode level on every block. On confirmed threat detection, emergency withdrawal triggers within the same block.",
      link: "/proof-of-exit"
    },
    {
      title: "Multi-Signature Security",
      icon: "🔐",
      description: "Protocol admin keys use an M-of-N multi-signature structure with geographically distributed keyholders. Agent contract upgrades require governance approval and a mandatory 48-hour timelock.",
      link: null
    },
    {
      title: "Chainlink Oracles",
      icon: "🔮",
      description: "Decentralized price feeds from multiple sources prevent manipulation and ensure accurate market data for all position valuations, liquidation calculations, and entry/exit decisions.",
      link: null
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#020617]">
      <Header />
      
      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          
          {/* Hero Section */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="text-center mb-16"
          >
            <h1 className="text-5xl md:text-7xl font-black mb-6">
              How It
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600"> Works</span>
            </h1>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Aetheris combines AI agents, smart contracts, and gasless transactions to create 
              an autonomous DeFi experience that's both powerful and simple to use.
            </p>
          </motion.div>

          {/* User Journey - 5 Steps - Horizontal on Desktop */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-20"
          >
            <h2 className="text-4xl font-black text-center mb-12">
              Your Journey with Aetheris
            </h2>
            
            {/* Desktop: Horizontal Timeline */}
            <div className="hidden lg:block">
              <div className="relative">
                {/* Connecting Line */}
                <div className="absolute top-10 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" 
                     style={{ top: '40px' }} 
                />
                
                <div className="grid grid-cols-5 gap-4">
                  {userJourney.map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className="relative"
                    >
                      {/* Step Number Circle */}
                      <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-3xl font-black relative z-10 shadow-lg">
                          {item.step}
                        </div>
                      </div>
                      
                      {/* Content Card */}
                      <div className="glass-panel p-6 hover:bg-white/5 transition-all min-h-[280px] flex flex-col">
                        <h3 className="text-lg font-bold mb-3 text-cyan-400">{item.title}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed mb-4 flex-grow">
                          {item.description}
                        </p>
                        
                        {/* Expandable Details Button */}
                        <button
                          onClick={() => setExpandedSection(expandedSection === i ? null : i)}
                          className="text-cyan-400 text-xs font-bold hover:text-cyan-300 transition-colors flex items-center gap-2 mt-auto"
                        >
                          {expandedSection === i ? 'Show Less' : 'Learn More'}
                          <svg 
                            className={`w-4 h-4 transition-transform ${expandedSection === i ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        
                        {/* Expanded Details */}
                        {expandedSection === i && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-4 pt-4 border-t border-white/10"
                          >
                            <p className="text-gray-300 text-xs leading-relaxed">
                              {item.details}
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile: Vertical Stack */}
            <div className="lg:hidden space-y-4">
              {userJourney.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i }}
                  className="glass-panel overflow-hidden"
                >
                  <div 
                    className="p-6 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedSection(expandedSection === i ? null : i)}
                  >
                    <div className="w-16 h-16 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-black flex-shrink-0">
                      {item.step}
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                      <p className="text-gray-400 text-sm">{item.description}</p>
                    </div>
                    <svg 
                      className={`w-6 h-6 text-cyan-400 transition-transform flex-shrink-0 ${expandedSection === i ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  
                  {expandedSection === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-6 pb-6 border-t border-white/10"
                    >
                      <div className="pt-4 pl-20">
                        <p className="text-gray-300 text-sm leading-relaxed">
                          {item.details}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* System Architecture */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-20"
          >
            <h2 className="text-4xl font-black text-center mb-4">
              System Architecture
            </h2>
            <p className="text-center text-gray-400 mb-12 max-w-2xl mx-auto">
              Aetheris is built on five interconnected layers, each serving a critical role in the system.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {systemLayers.map((layer, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="glass-panel p-6 text-center hover:scale-105 transition-transform"
                  style={{ borderColor: `${layer.color}40` }}
                >
                  <div className="text-5xl mb-4">{layer.icon}</div>
                  <h3 className="font-black text-lg mb-3" style={{ color: layer.color }}>
                    {layer.layer}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {layer.description}
                  </p>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 p-6 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div>
                  <h3 className="font-bold mb-2">Layered Architecture Benefits</h3>
                  <p className="text-sm text-gray-400">
                    Each layer operates independently but communicates seamlessly. If one component needs upgrading, 
                    others continue functioning. This modular design ensures reliability and allows continuous improvement 
                    without disrupting the entire system.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Technical Features */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-20"
          >
            <h2 className="text-4xl font-black text-center mb-12">
              Key Technologies
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {technicalFeatures.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className="glass-panel p-8 hover:bg-white/5 transition-all group"
                >
                  <div className="text-5xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-black mb-3">{feature.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed mb-4">
                    {feature.description}
                  </p>
                  {feature.link && (
                    <Link href={feature.link}>
                      <button className="text-cyan-400 text-sm font-bold hover:text-cyan-300 transition-colors">
                        Learn More →
                      </button>
                    </Link>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* How Agents Work */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mb-20"
          >
            <h2 className="text-4xl font-black text-center mb-12">
              How the Agents Work
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Agent Alpha */}
              <div className="glass-panel p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="text-5xl">🎯</div>
                  <div>
                    <h3 className="text-2xl font-black text-cyan-400">Agent Alpha</h3>
                    <p className="text-sm text-gray-400">The Arbitrageur</p>
                  </div>
                </div>
                
                <div className="space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-cyan-400 font-bold">1.</span>
                    <p className="text-gray-300">Scans prices across Uniswap V3, Aerodrome, and Balancer at sub-20ms speed in real time</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-cyan-400 font-bold">2.</span>
                    <p className="text-gray-300">Detects price differences (e.g., ETH costs $3,000 on Uniswap but $3,003 on Aerodrome)</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-cyan-400 font-bold">3.</span>
                    <p className="text-gray-300">Calculates profitability after fees, gas, and slippage — only executes if net positive</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-cyan-400 font-bold">4.</span>
                    <p className="text-gray-300">Takes flash loan — borrows capital with zero collateral, no user capital at risk</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-cyan-400 font-bold">5.</span>
                    <p className="text-gray-300">Executes buy-low-sell-high in one atomic transaction</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-cyan-400 font-bold">6.</span>
                    <p className="text-gray-300">Repays flash loan and deposits profit to the vault — increasing NAV per share</p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                  <p className="text-xs text-gray-400">
                    <strong className="text-cyan-400">Key Advantage:</strong> Flash loans enable capital-efficient 
                    trading with no upfront investment. If any step fails, the entire transaction reverts — funds 
                    are never left in a partially protected state.
                  </p>
                </div>
              </div>

              {/* Agent V */}
              <div className="glass-panel p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="text-5xl">⚡</div>
                  <div>
                    <h3 className="text-2xl font-black text-green-400">Agent V</h3>
                    <p className="text-sm text-gray-400">The Guardian</p>
                  </div>
                </div>
                
                <div className="space-y-4 text-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">1.</span>
                    <p className="text-gray-300">Monitors every smart contract the protocol interacts with at the bytecode level</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">2.</span>
                    <p className="text-gray-300">Runs on every block, in real time — no polling delay, no detection gaps</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">3.</span>
                    <p className="text-gray-300">Detects proxy implementation swaps, ownership transfers, hidden function activations, and oracle manipulation precursors</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">4.</span>
                    <p className="text-gray-300">Classifies threat severity: monitoring anomaly, confirmed proxy change, or active exploit in progress</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">5.</span>
                    <p className="text-gray-300">Triggers Kill Switch on confirmed threats — emergency withdrawal executes in the same block as detection</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">6.</span>
                    <p className="text-gray-300">Withdrawn capital returns to Aave USDC base yield — continues earning while threat is assessed</p>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-xs text-gray-400">
                    <strong className="text-green-400">Key Advantage:</strong> Same-block response. The window 
                    between a malicious upgrade and the first drain transaction is often one to three blocks. 
                    Agent V acts faster than any attacker can exploit.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Security & Trust */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="glass-panel p-8 md:p-12 mb-20"
          >
            <h2 className="text-3xl font-black text-center mb-8">
              Security & Trust
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-5xl mb-4">🔒</div>
                <h3 className="font-bold text-lg mb-3">Audited Contracts</h3>
                <p className="text-sm text-gray-400">
                  Every smart contract — vault, each agent, ProfitDistributor, AX token — audited by independent firms with DeFi expertise before mainnet deployment.
                </p>
              </div>

              <div className="text-center">
                <div className="text-5xl mb-4">🔐</div>
                <h3 className="font-bold text-lg mb-3">Multi-Signature</h3>
                <p className="text-sm text-gray-400">
                  M-of-N multi-signature governance approval required for any protocol changes, plus a mandatory 48-hour timelock. The vault contract is fully immutable.
                </p>
              </div>

              <div className="text-center">
                <div className="text-5xl mb-4">⛓️</div>
                <h3 className="font-bold text-lg mb-3">Ethereum Security</h3>
                <p className="text-sm text-gray-400">
                  Built on Base L2, secured by Ethereum's finality. All transactions backed by Ethereum validators.
                </p>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link href="/security">
                <button className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 rounded-full font-bold hover:bg-cyan-400/10 transition-colors">
                  Learn About Security →
                </button>
              </Link>
            </div>
          </motion.div>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="glass-panel p-12 text-center"
          >
            <h2 className="text-4xl font-black mb-4">Ready to Go Deeper?</h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Explore our AI agents in detail, or read the full whitepaper for technical architecture and tokenomics.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full font-black shadow-lg"
                >
                  EXPLORE AGENTS
                </motion.button>
              </Link>
              <Link href="/whitepaper">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 border-2 border-cyan-400 text-cyan-400 rounded-full font-black hover:bg-cyan-400/10 transition-colors"
                >
                  READ WHITEPAPER
                </motion.button>
              </Link>
            </div>
          </motion.div>

        </div>
      </main>

      <Footer />
    </div>
  );
}