// Aetheris\aetheris-frontend\pages\gasless-transactions.tsx

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function GaslessTransactionsPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const tiers = [
    {
      tier: "Base",
      discount: "0%",
      requirement: "No $AX needed",
      stake: "0 $AX",
      example: "$5.25/tx",
      color: "#64748b"
    },
    {
      tier: "Bronze",
      discount: "10%",
      requirement: "Stake 1,000 $AX",
      stake: "1,000 $AX",
      example: "$4.73/tx",
      color: "#cd7f32"
    },
    {
      tier: "Silver",
      discount: "25%",
      requirement: "Stake 10,000 $AX",
      stake: "10,000 $AX",
      example: "$3.94/tx",
      color: "#c0c0c0"
    },
    {
      tier: "Gold",
      discount: "50%",
      requirement: "Stake 100,000 $AX",
      stake: "100,000 $AX",
      example: "$2.63/tx",
      color: "#ffd700"
    },
    {
      tier: "Platinum",
      discount: "100% FREE",
      requirement: "Stake 1,000,000 $AX",
      stake: "1,000,000 $AX",
      example: "$0.00/tx",
      color: "#e5e4e2"
    }
  ];

  const benefits = [
    {
      icon: "⚡",
      title: "No ETH Required",
      description: "You only need USDC. No buying ETH on exchanges. No withdrawal fees. No managing two tokens."
    },
    {
      icon: "🎯",
      title: "Instant Execution",
      description: "Agent Alpha executes arbitrage at sub-20ms scan speed without pausing to acquire ETH. The window between opportunity and execution is never blocked by a missing gas token."
    },
    {
      icon: "🛡️",
      title: "Emergency Access",
      description: "Agent V can trigger emergency withdrawal even if your wallet holds zero ETH. Security is never blocked by a gas shortage — the Paymaster covers it regardless."
    },
    {
      icon: "🔑",
      title: "Session Keys for Agents",
      description: "Smart accounts enable session keys — you grant the protocol permission to execute a pre-approved set of actions (rebalancing, compounding, emergency withdrawals) without requiring a wallet confirmation for each individual transaction."
    }
  ];

  const faqs = [
    {
      question: "How does this actually work if blockchain requires ETH?",
      answer: "Aetheris uses ERC-4337 (Account Abstraction). Our Paymaster smart contract pays the ETH gas fee on your behalf, then immediately collects the equivalent amount in USDC from your wallet. You never see the ETH—it's handled automatically behind the scenes."
    },
    {
      question: "Is this secure? Can the Paymaster steal my funds?",
      answer: "Completely secure. The Paymaster can ONLY deduct the exact gas fee amount after a transaction successfully executes. It has zero access to your deposited funds or any USDC beyond the gas fee. Built on Ethereum Foundation's ERC-4337 standard, audited by industry leaders."
    },
    {
      question: "What if I run out of USDC?",
      answer: "Transactions simply won't execute if you lack sufficient USDC to cover the gas fee. There's no debt, no overdraft, no surprise charges. The system validates your balance before any transaction processes."
    },
    {
      question: "Why do I need to stake $AX for discounts?",
      answer: "Staking $AX aligns long-term incentives. It reduces sell pressure, rewards loyal users, and creates sustainable tokenomics. The more $AX you stake, the more you save—up to 100% free transactions at Platinum tier."
    },
    {
      question: "Can I unstake my $AX anytime?",
      answer: "Yes, but a seven-day unstaking delay applies. This exists for one reason: preventing governance manipulation via flash-stake-vote-unstake attacks. Governance participants must have sustained skin in the game — seven days is the minimum window that makes flash-stake attacks economically non-viable. Your discount tier updates immediately upon unstaking, before the delay completes."
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
              Gasless
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600"> Transactions</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto">
              Pay fees in USDC. No ETH required. Ever.
            </p>
          </motion.div>

          {/* The Problem Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-8 md:p-12 mb-16"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="text-5xl">⚠️</div>
              <div>
                <h2 className="text-3xl font-black mb-4">The Problem with Traditional DeFi</h2>
                <p className="text-gray-300 leading-relaxed mb-4">
                  Normally, doing <strong>ANYTHING</strong> on Ethereum or Base requires ETH for gas fees. 
                  Even if you have $10,000 USDC sitting in your wallet, you can't deposit, trade, withdraw, 
                  or execute any transaction without first acquiring ETH separately.
                </p>
                <p className="text-gray-300 leading-relaxed mb-4">
                  This forces users into a painful multi-step process: sign up for a centralised exchange, 
                  complete KYC verification, buy ETH, pay withdrawal fees, wait for confirmations, 
                  and constantly monitor your ETH balance. A $5,000 USDC deposit can require $20–40 in 
                  preliminary costs and 30–60 minutes of friction before the deposit transaction even executes.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  <strong className="text-red-400">The worst case:</strong> Emergency situations become 
                  nightmares — you need to withdraw immediately, but have no ETH for gas. Your funds are 
                  exposed while you scramble for a gas token.
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                <div className="text-3xl mb-2">💸</div>
                <h3 className="font-bold text-lg mb-2">Expensive Onboarding</h3>
                <p className="text-sm text-gray-400">$10-20 in fees just to buy and withdraw ETH before your first transaction</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                <div className="text-3xl mb-2">⏰</div>
                <h3 className="font-bold text-lg mb-2">Time Consuming</h3>
                <p className="text-sm text-gray-400">KYC verification, exchange delays, and constant ETH balance monitoring — before a single DeFi action</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                <div className="text-3xl mb-2">🚨</div>
                <h3 className="font-bold text-lg mb-2">Emergency Risk</h3>
                <p className="text-sm text-gray-400">A zero ETH balance during a security event means you cannot exit — your capital is exposed while you scramble for gas</p>
              </div>
            </div>
          </motion.div>

          {/* The Solution Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel p-8 md:p-12 mb-16"
          >
            <div className="flex items-start gap-4 mb-8">
              <div className="text-5xl">✅</div>
              <div>
                <h2 className="text-3xl font-black mb-4">The Aetheris Solution</h2>
                <p className="text-gray-300 leading-relaxed mb-4">
                  Aetheris uses <strong className="text-cyan-400">ERC-4337 (Account Abstraction)</strong> to 
                  eliminate the ETH requirement entirely. You pay transaction fees in USDC—the stablecoin 
                  you already have. No ETH needed. No extra steps. No complexity.
                </p>
                <p className="text-gray-300 leading-relaxed mb-4">
                  Behind the scenes, our Paymaster smart contract pays the required ETH gas fee on your behalf, 
                  then automatically deducts the equivalent amount in USDC from your wallet. The entire process 
                  is invisible to you. It simply works.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  Smart accounts also enable <strong className="text-cyan-400">session keys</strong> — a mechanism 
                  where you grant the protocol permission to execute a specific set of pre-approved actions 
                  (rebalancing, compounding, emergency withdrawals) without requiring a wallet confirmation for each 
                  individual transaction. This is what allows agents to act autonomously on your behalf.
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">🎯</span>
                <h3 className="text-xl font-black">Proven Technology</h3>
              </div>
              <p className="text-gray-300 text-sm">
                Over <strong className="text-cyan-400">40 million accounts</strong> have already adopted 
                ERC-4337 gasless transactions. This isn't experimental—it's the new standard for user-friendly DeFi.
              </p>
            </div>
          </motion.div>

          {/* How It Works - 4 Steps */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-16"
          >
            <h2 className="text-4xl font-black text-center mb-12">
              How It Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { step: "1", title: "Sign Transaction", desc: "You sign the transaction in your wallet using only USDC. No ETH required." },
                { step: "2", title: "Paymaster Validates", desc: "Our Paymaster verifies you have sufficient USDC to cover the gas fee." },
                { step: "3", title: "Paymaster Pays Gas", desc: "Paymaster pays the ETH gas fee to the blockchain on your behalf." },
                { step: "4", title: "Execute & Collect", desc: "Transaction executes, equivalent USDC deducted from your wallet automatically." }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="glass-panel p-8 text-center hover:scale-105 transition-transform"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-black">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Fee Tiers */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-panel p-8 md:p-12 mb-16"
          >
            <h2 className="text-4xl font-black text-center mb-4">Fee Tier System</h2>
            <p className="text-center text-gray-400 mb-12 max-w-2xl mx-auto">
              Stake $AX tokens to unlock permanent fee discounts. The more you stake, the less you pay.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {tiers.map((tier, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className="glass-panel p-6 text-center hover:scale-105 transition-all relative overflow-hidden"
                  style={{
                    borderColor: `${tier.color}40`
                  }}
                >
                  {/* Glow effect */}
                  <div 
                    className="absolute inset-0 opacity-10 blur-xl"
                    style={{ background: tier.color }}
                  />
                  
                  <div className="relative z-10">
                    <div className="text-2xl font-black mb-2" style={{ color: tier.color }}>
                      {tier.tier}
                    </div>
                    <div className="text-3xl font-black mb-4 text-cyan-400">
                      {tier.discount}
                    </div>
                    <div className="text-xs text-gray-400 mb-2">Requirement:</div>
                    <div className="text-sm font-bold mb-4">{tier.stake}</div>
                    <div className="text-xs text-gray-500 mb-1">Example Cost:</div>
                    <div className="text-lg font-mono font-bold" style={{ color: tier.color }}>
                      {tier.example}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 p-6 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div>
                  <h3 className="font-bold mb-2">Example: Silver Tier Savings</h3>
                  <p className="text-sm text-gray-400 mb-2">
                    At Silver tier (10,000 $AX staked), you pay $3.94 per transaction instead of $5.25.
                  </p>
                  <p className="text-sm text-gray-400">
                    <strong className="text-cyan-400">Savings:</strong> $1.31 per transaction. 
                    With 100 transactions/month, you save $131/month or $1,572/year.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Why This Matters */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mb-16"
          >
            <h2 className="text-4xl font-black text-center mb-12">
              Why This Matters
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {benefits.map((benefit, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                  className="glass-panel p-8 hover:bg-white/5 transition-all"
                >
                  <div className="text-5xl mb-4">{benefit.icon}</div>
                  <h3 className="text-2xl font-black mb-3">{benefit.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{benefit.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* FAQ Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="glass-panel p-8 md:p-12"
          >
            <h2 className="text-4xl font-black text-center mb-12">
              Common Questions
            </h2>
            <div className="space-y-4 max-w-4xl mx-auto">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-white/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-all"
                  >
                    <span className="font-bold text-left">{faq.question}</span>
                    <svg
                      className={`w-5 h-5 transition-transform flex-shrink-0 ml-4 ${expandedFaq === i ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-6 py-4 bg-white/5 border-t border-white/10"
                    >
                      <p className="text-gray-400 leading-relaxed">{faq.answer}</p>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

        </div>
      </main>

      <Footer />
    </div>
  );
}