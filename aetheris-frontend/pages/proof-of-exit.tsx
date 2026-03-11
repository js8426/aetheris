// Aetheris\aetheris-frontend\pages\proof-of-exit.tsx

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ProofOfExitPage() {
  const [selectedTab, setSelectedTab] = useState<"overview" | "how-it-works" | "demo">("overview");
  const [demoStep, setDemoStep] = useState(0);

  const threatVectors = [
    {
      name: "Proxy Implementation Swap",
      severity: "CRITICAL",
      description: "The most common rug-pull vector. A protocol replaces its underlying implementation contract with a malicious one in a single transaction. Agent V tracks the implementation slot of every proxy contract in the watchlist — any change triggers an immediate response.",
      color: "#ef4444",
    },
    {
      name: "Ownership Transfer",
      severity: "CRITICAL",
      description: "Admin key compromise or intentional malicious transfer gives an attacker protocol-level control. Agent V monitors the owner and admin addresses of every watched contract. An unexpected transfer to an unknown EOA triggers the emergency sequence.",
      color: "#ef4444",
    },
    {
      name: "Hidden Function Activation",
      severity: "HIGH",
      description: "Some exploits involve functions that exist in the original contract but are gated behind time locks or conditions. When these activate, Agent V detects the change in contract state and flags the event for classification.",
      color: "#f97316",
    },
    {
      name: "Oracle Manipulation Precursors",
      severity: "HIGH",
      description: "Large position accumulations, unusual price feed divergence, and flash loan patterns that historically precede oracle manipulation attacks are monitored in parallel with bytecode surveillance.",
      color: "#f97316",
    },
  ];

  const executionSteps = [
    {
      step: 1,
      title: "V Flags the Threat",
      description: "Agent V classifies the detected event by severity: monitoring anomaly, confirmed proxy change, or active exploit in progress.",
      time: "Same block",
      status: "Automated — no human decision required",
    },
    {
      step: 2,
      title: "Emergency Withdrawal Triggered",
      description: "For confirmed threats, V triggers emergency withdrawal from the affected protocol immediately — within the same block as detection.",
      time: "Same block",
      status: "The critical window between upgrade and drain is closed",
    },
    {
      step: 3,
      title: "Capital Returns to Base Yield",
      description: "Withdrawn capital returns to the vault's base yield position (Aave USDC) pending reassessment of the affected protocol. Capital stays productive while the threat is evaluated.",
      time: "Block N+1",
      status: "No idle capital — vault continues operating",
    },
    {
      step: 4,
      title: "Agent Shield Initiates Claim",
      description: "If the event qualifies under active coverage from Nexus Mutual, InsurAce, or Sherlock, Agent Shield initiates the insurance claims process automatically.",
      time: "Block N+1",
      status: "Compensation layer activated if prevention was insufficient",
    },
    {
      step: 5,
      title: "Vault NAV Recalculated",
      description: "If a loss occurred before withdrawal completed, it is reflected in NAV per share and distributed proportionally across depositors. Full on-chain transparency — nothing is hidden.",
      time: "Block N+2",
      status: "Dashboard notification dispatched to all depositors",
    },
  ];

  const benefits = [
    {
      icon: "⚡",
      title: "Same-Block Response",
      description:
        "The window between a malicious upgrade and the first drain transaction is often one to three blocks. Agent V's emergency withdrawal triggers in the same block as detection — faster than any attacker can act.",
    },
    {
      icon: "🤖",
      title: "Fully Autonomous",
      description:
        "For active exploit scenarios, the response sequence executes automatically. No human decision-making is in the critical path. Human speed is irrelevant — the agent responds.",
    },
    {
      icon: "🔒",
      title: "Atomic Execution",
      description:
        "All multi-step operations execute in a single transaction. If any step fails, the entire operation reverts. You are never left in a partially protected state.",
    },
    {
      icon: "🛡️",
      title: "Three-Layer Defence",
      description:
        "V detects the threat. Omega prevents liquidation losses. Shield compensates if prevention fails. Together they form a defence stack no other DeFi protocol currently provides simultaneously.",
    },
  ];

  const realWorldExamples = [
    {
      name: "Uranium Finance",
      date: "April 2021",
      loss: "$50M",
      description: "Malicious upgrade enabled a drain function. Users lost everything overnight — no automated protection existed.",
    },
    {
      name: "Merlin DEX",
      date: "April 2023",
      loss: "$1.8M",
      description: "Developers added a backdoor during an upgrade. Total rug pull completed in minutes before users could react.",
    },
    {
      name: "Kokomo Finance",
      date: "March 2023",
      loss: "$4M",
      description: "Contract upgrade allowed unlimited withdrawals by the attacker. All user funds drained before any response.",
    },
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
              Proof of
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-600"> Exit</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-6">
              Agent V's Kill Switch that monitors every smart contract at the bytecode level on every block — and triggers emergency withdrawal within the same block as detection.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full">
              <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#22c55e", borderRadius: "50%", boxShadow: "0 0 8px #22c55e" }} />
              <span className="text-green-400 text-sm font-bold">AGENT V MONITORING LIVE — PHASE 1</span>
            </div>
          </motion.div>

          {/* The Problem */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-8 md:p-12 mb-16 border-2 border-red-500/30"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="text-5xl">⚠️</div>
              <div>
                <h2 className="text-3xl font-black mb-4 text-red-400">The $1.1 Billion Problem</h2>
                <p className="text-gray-300 leading-relaxed mb-4">
                  In H1 2025 alone, <strong className="text-white">$1.1 billion was lost</strong> to DeFi exploits. Approximately 90% of DeFi protocols use upgradeable proxy contracts — a legitimate architectural pattern that allows developers to fix bugs. The same pattern allows them to replace the underlying contract with a malicious drain function in a single transaction.
                </p>
                <p className="text-gray-300 leading-relaxed">
                  Users have no native defence. Reading smart contract code requires Solidity proficiency that 99.9% of users do not have. Audits only reflect code at audit time — not after an upgrade. By the time a user notices, the funds are already gone.
                </p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              {realWorldExamples.map((example, i) => (
                <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-white">{example.name}</h3>
                    <span className="text-red-400 text-sm font-bold">{example.loss}</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">{example.date}</div>
                  <p className="text-sm text-gray-400">{example.description}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* What is Proof of Exit */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel p-8 md:p-12 mb-16"
          >
            <h2 className="text-3xl font-black mb-6">What is Proof of Exit?</h2>
            <div className="space-y-6 text-gray-300">
              <p className="leading-relaxed text-lg">
                Proof of Exit is <strong className="text-white">Agent V's automated emergency rescue system</strong> that detects malicious smart contract upgrades and triggers emergency withdrawal before funds can be drained.
              </p>

              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
                <h3 className="font-bold text-lg mb-3 text-green-400">How It Works (Simple Version):</h3>
                <ol className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">1.</span>
                    <span><strong>Continuous Monitoring:</strong> Agent V tracks the bytecode of every smart contract the protocol interacts with, on every block, in real time — no polling delay, no gaps.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">2.</span>
                    <span><strong>Instant Detection:</strong> When a contract changes — proxy swap, ownership transfer, hidden function activation — Agent V detects it within the same block it occurs.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">3.</span>
                    <span><strong>Threat Classification:</strong> V classifies severity: monitoring anomaly, confirmed proxy change, or active exploit in progress. The classification determines the response level.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">4.</span>
                    <span><strong>Automatic Rescue:</strong> For confirmed threats, V triggers emergency withdrawal from the affected protocol in the same block — before an attacker can exploit the change.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-400 font-bold">5.</span>
                    <span><strong>Shield + Notification:</strong> Agent Shield assesses whether the event qualifies for insurance coverage. You receive a dashboard alert explaining exactly what happened and what was done.</span>
                  </li>
                </ol>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <h4 className="font-bold mb-4 flex items-center gap-2">
                    <span className="text-2xl">⚡</span>
                    <span>Detection Speed</span>
                  </h4>
                  <div className="text-5xl font-black text-cyan-400 mb-2">Every Block</div>
                  <p className="text-sm text-gray-400">
                    Agent V monitors every contract on every block — not on a timer. Real-time bytecode surveillance with no gaps.
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                  <h4 className="font-bold mb-4 flex items-center gap-2">
                    <span className="text-2xl">🛡️</span>
                    <span>Response Speed</span>
                  </h4>
                  <div className="text-5xl font-black text-green-400 mb-2">Same Block</div>
                  <p className="text-sm text-gray-400">
                    Emergency withdrawal triggers within the same block as detection. The window attackers need is closed before they can use it.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Tab Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-8"
          >
            <div className="flex gap-4 border-b border-white/10">
              {(["overview", "how-it-works", "demo"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`px-6 py-3 font-bold transition-colors relative capitalize ${
                    selectedTab === tab ? "text-red-400" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "how-it-works" ? "Technical Details" : tab === "demo" ? "Interactive Demo" : "Overview"}
                  {selectedTab === tab && (
                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400" />
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

            {/* Overview Tab */}
            {selectedTab === "overview" && (
              <div className="space-y-8">

                {/* Benefits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {benefits.map((benefit, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="glass-panel p-6 hover:bg-white/5 transition-all"
                    >
                      <div className="text-5xl mb-4">{benefit.icon}</div>
                      <h3 className="text-xl font-black mb-3">{benefit.title}</h3>
                      <p className="text-sm text-gray-400 leading-relaxed">{benefit.description}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Where Rescued Funds Go */}
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black mb-6">Where Funds Go After Rescue</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <p className="text-gray-300 mb-4 leading-relaxed">
                        When V triggers an emergency withdrawal, funds do not sit idle. Capital returns to the vault's <strong className="text-white">base yield position — Aave USDC</strong> — pending reassessment of the affected protocol. Your capital continues earning while the threat is evaluated.
                      </p>
                      <p className="text-gray-300 leading-relaxed">
                        If the event qualifies under active insurance coverage, Agent Shield initiates the claims process automatically via Nexus Mutual, InsurAce, or Sherlock — no manual claim filing required.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {[
                        { step: "Emergency withdrawal executes", sub: "Same block as threat detection", color: "#ef4444" },
                        { step: "Capital moves to Aave USDC base yield", sub: "Continues earning while threat is assessed", color: "#06b6d4" },
                        { step: "Shield assesses insurance eligibility", sub: "Automated — no manual claim required", color: "#a855f7" },
                        { step: "Protocol reassessed for redeployment", sub: "Governance decision on reapproval", color: "#22c55e" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                          <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black mt-0.5" style={{ background: `${item.color}20`, color: item.color, border: `1px solid ${item.color}40` }}>
                            {i + 1}
                          </div>
                          <div>
                            <div className="font-bold text-sm">{item.step}</div>
                            <div className="text-xs text-gray-500">{item.sub}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Comparison */}
                <div className="glass-panel p-8 bg-gradient-to-br from-red-500/5 to-orange-500/5 border-red-500/20">
                  <h3 className="text-2xl font-black mb-6">Why Proof of Exit is Superior</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4">Method</th>
                          <th className="text-center py-3 px-4">Speed</th>
                          <th className="text-center py-3 px-4">Automation</th>
                          <th className="text-center py-3 px-4">Works While Sleeping</th>
                          <th className="text-center py-3 px-4">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-300">
                        <tr className="border-b border-white/10 bg-green-500/5">
                          <td className="py-3 px-4 font-bold text-green-400">Proof of Exit</td>
                          <td className="text-center py-3 px-4 text-green-400">Same block</td>
                          <td className="text-center py-3 px-4 text-green-400">✓ Fully Auto</td>
                          <td className="text-center py-3 px-4 text-green-400">✓ Always</td>
                          <td className="text-center py-3 px-4">Included</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Manual Monitoring</td>
                          <td className="text-center py-3 px-4 text-red-400">Minutes–Hours</td>
                          <td className="text-center py-3 px-4 text-red-400">✗ Manual</td>
                          <td className="text-center py-3 px-4 text-red-400">✗ Never</td>
                          <td className="text-center py-3 px-4">Free</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Governance Timelock</td>
                          <td className="text-center py-3 px-4 text-yellow-400">48 Hours</td>
                          <td className="text-center py-3 px-4 text-red-400">✗ Manual</td>
                          <td className="text-center py-3 px-4 text-yellow-400">Partial</td>
                          <td className="text-center py-3 px-4">Free</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Post-Exploit Insurance</td>
                          <td className="text-center py-3 px-4 text-red-400">Weeks–Months</td>
                          <td className="text-center py-3 px-4 text-yellow-400">Semi (Shield)</td>
                          <td className="text-center py-3 px-4 text-green-400">✓ Always</td>
                          <td className="text-center py-3 px-4 text-yellow-400">Premium cost</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* Technical Details Tab */}
            {selectedTab === "how-it-works" && (
              <div className="space-y-8">

                {/* Response Sequence */}
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black mb-4">The 5-Step Response Sequence</h3>
                  <p className="text-gray-400 mb-8">
                    For confirmed threats, this sequence executes automatically. No human intervention is in the critical path. Steps 1 and 2 occur within the same block as detection.
                  </p>
                  <div className="space-y-4">
                    {executionSteps.map((step, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="flex items-start gap-4 p-4 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500 flex items-center justify-center font-bold text-red-400 flex-shrink-0">
                          {step.step}
                        </div>
                        <div className="flex-grow">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-white">{step.title}</h4>
                            <span className="text-xs text-cyan-400 font-mono">{step.time}</span>
                          </div>
                          <p className="text-sm text-gray-400 mb-2">{step.description}</p>
                          <div className="text-xs text-gray-500 italic">→ {step.status}</div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">⚡</span>
                      <div>
                        <h4 className="font-bold mb-2">Atomic Guarantee</h4>
                        <p className="text-sm text-gray-400">
                          All steps within a single transaction execute atomically — either all succeed or all revert. You are never left in a partially protected state.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Threat Vectors */}
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black mb-6">Threat Vectors Agent V Monitors</h3>
                  <p className="text-gray-300 mb-6">
                    Agent V monitors every smart contract the Aetheris protocol interacts with at the bytecode level, in real time, on every block. The specific threat vectors it watches for:
                  </p>
                  <div className="space-y-4 mb-6">
                    {threatVectors.map((threat, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.1 }}
                        className="flex items-start gap-4 p-5 rounded-xl"
                        style={{ background: `${threat.color}08`, border: `1px solid ${threat.color}25` }}
                      >
                        <span className="text-xs font-black px-2 py-1 rounded flex-shrink-0 mt-0.5" style={{ background: `${threat.color}20`, color: threat.color, border: `1px solid ${threat.color}40` }}>
                          {threat.severity}
                        </span>
                        <div>
                          <h4 className="font-black mb-2" style={{ color: threat.color }}>{threat.name}</h4>
                          <p className="text-sm text-gray-400 leading-relaxed">{threat.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Example detection */}
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                    <h4 className="font-bold mb-4 text-red-400">Example: Confirmed Proxy Swap Detected</h4>
                    <div className="space-y-3 text-sm">
                      {[
                        { label: "Implementation slot changed", detail: "0xabc123... → 0xdrain99...", severity: "CONFIRMED" },
                        { label: "New implementation not in whitelist", detail: "Unknown contract — zero prior interaction history", severity: "CRITICAL" },
                        { label: "Admin address transferred same block", detail: "Pattern matches known rug-pull signature", severity: "CRITICAL" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-black/30 rounded">
                          <div>
                            <span className="text-gray-300">{item.label}</span>
                            <div className="text-xs text-gray-500 mt-0.5">{item.detail}</div>
                          </div>
                          <span className="text-red-400 text-xs font-bold ml-4">{item.severity}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between p-3 bg-red-500/20 rounded font-bold border border-red-500/30 mt-2">
                        <span>VERDICT</span>
                        <span className="text-red-400">EMERGENCY WITHDRAWAL TRIGGERED</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* User Configuration */}
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black mb-6">User Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-bold mb-3 text-green-400">Default Settings (Recommended)</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Auto-execute emergency withdrawal: Enabled</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Monitoring scope: All vault-approved protocols</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Fallback destination: Aave USDC base yield</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Insurance claims: Auto-initiated by Shield</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          <span>Notifications: Dashboard + Email</span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-bold mb-3 text-cyan-400">Advanced Options</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Require manual confirmation before withdrawal</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Manual trigger: exit any position at any time</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Enable Telegram / SMS alerts</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>Per-protocol monitoring toggle</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <span className="text-cyan-400">•</span>
                          <span>View full monitoring log on dashboard</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Known Limitations */}
                <div className="glass-panel p-8 border-yellow-500/20 bg-yellow-500/5">
                  <h3 className="text-2xl font-black mb-4 text-yellow-400">Known Limitations — Disclosed Without Spin</h3>
                  <div className="space-y-3 text-sm">
                    {[
                      { title: "Novel Attack Vectors", desc: "Agent V's detection model is built on known attack patterns. A genuinely novel exploit technique with no historical precedent may not trigger existing detection logic. Agent Shield provides compensation coverage as the backstop." },
                      { title: "Oracle Risk", desc: "Aetheris relies on price oracles for position valuations and liquidation calculations. Oracle manipulation remains a viable attack vector that V monitors but cannot fully prevent." },
                      { title: "Third-Party Protocol Risk", desc: "A vulnerability in Uniswap, Aave, or any interacted protocol could result in loss before V detects it. V monitors these contracts but cannot patch them." },
                    ].map((risk, i) => (
                      <div key={i} className="p-4 bg-black/30 rounded-lg border border-yellow-500/10">
                        <div className="font-bold text-yellow-400 mb-1">{risk.title}</div>
                        <div className="text-gray-400">{risk.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* Interactive Demo Tab */}
            {selectedTab === "demo" && (
              <div className="glass-panel p-8">
                <h3 className="text-2xl font-black mb-6">Interactive Demonstration</h3>
                <p className="text-gray-400 mb-8">
                  Step through a simulated malicious upgrade event and see exactly how Proof of Exit responds — block by block.
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Timeline */}
                  <div>
                    <h4 className="font-bold mb-4">Block Timeline</h4>
                    <div className="space-y-3">
                      {[
                        { time: "Block N", event: "Malicious proxy swap deployed on-chain", active: demoStep >= 0 },
                        { time: "Block N (same)", event: "Agent V detects bytecode change in watched contract", active: demoStep >= 1 },
                        { time: "Block N (same)", event: "Threat classified: confirmed proxy implementation swap", active: demoStep >= 2 },
                        { time: "Block N (same)", event: "Emergency withdrawal triggered from affected protocol", active: demoStep >= 3 },
                        { time: "Block N+1", event: "Capital redeployed to Aave USDC base yield", active: demoStep >= 4 },
                        { time: "Block N+1", event: "Agent Shield assesses for insurance claim eligibility", active: demoStep >= 5 },
                        { time: "Block N+2", event: "Dashboard notification dispatched — RESPONSE COMPLETE", active: demoStep >= 6 },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-4 p-3 rounded-lg transition-all ${
                            item.active ? "bg-green-500/10 border border-green-500/30" : "bg-white/5 border border-white/10"
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${item.active ? "bg-green-400" : "bg-gray-600"}`} />
                          <div className="flex-grow">
                            <div className="text-xs text-gray-500 font-mono">{item.time}</div>
                            <div className={`text-sm font-bold ${item.active ? "text-green-400" : "text-gray-400"}`}>{item.event}</div>
                          </div>
                          {item.active && <span className="text-green-400 text-xl flex-shrink-0">✓</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Visual Status */}
                  <div>
                    <h4 className="font-bold mb-4">Current Status</h4>
                    <div className="bg-black/40 border border-white/10 rounded-lg p-6 mb-4">
                      <div className="text-center mb-4">
                        <div className="text-6xl mb-4">
                          {demoStep < 2 ? "⚠️" : demoStep < 6 ? "⚡" : "✅"}
                        </div>
                        <div className="text-2xl font-black mb-2">
                          {demoStep === 0 && "Malicious Upgrade Deployed"}
                          {demoStep === 1 && "Agent V: Change Detected"}
                          {demoStep === 2 && "Threat Confirmed"}
                          {demoStep === 3 && "Emergency Withdrawal Executing"}
                          {demoStep === 4 && "Capital Secured — Earning Base Yield"}
                          {demoStep === 5 && "Shield Assessing Coverage"}
                          {demoStep === 6 && "Response Complete"}
                        </div>
                        {demoStep === 6 && (
                          <div className="text-sm text-gray-400">
                            Funds secured and earning. Total response: same block as the attack.
                          </div>
                        )}
                      </div>

                      {demoStep === 6 && (
                        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-sm space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Funds Status:</span>
                            <span className="text-green-400 font-bold">Secured — Aave USDC</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Total Response Time:</span>
                            <span className="text-white font-bold">Same block as attack</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Human Intervention:</span>
                            <span className="text-cyan-400 font-bold">None required</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">Insurance Claim:</span>
                            <span className="text-purple-400 font-bold">Assessed by Shield</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setDemoStep(Math.min(demoStep + 1, 6))}
                        disabled={demoStep === 6}
                        className={`flex-1 px-6 py-3 rounded-lg font-bold transition-colors ${
                          demoStep === 6
                            ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                            : "bg-red-500 text-white hover:bg-red-400"
                        }`}
                      >
                        {demoStep === 6 ? "Complete" : "Next Step →"}
                      </button>
                      <button
                        onClick={() => setDemoStep(0)}
                        className="px-6 py-3 border-2 border-white/20 rounded-lg font-bold hover:bg-white/5 transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="glass-panel p-12 text-center mt-16"
          >
            <h2 className="text-4xl font-black mb-4">Never Get Rugged Again</h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Agent V is live and monitoring all Phase 1 protocol interactions. The complete three-layer defensive stack — V, Omega, and Shield — will be fully operational by Phase 3.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-full font-black shadow-lg"
                >
                  MEET ALL SECURITY AGENTS
                </motion.button>
              </Link>
              <Link href="/security">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 border-2 border-red-400 text-red-400 rounded-full font-black hover:bg-red-400/10 transition-colors"
                >
                  FULL SECURITY ARCHITECTURE
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