// Aetheris\aetheris-frontend\pages\security.tsx

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SecurityPage() {
  const [selectedTab, setSelectedTab] = useState<"overview" | "audits" | "operations" | "response">("overview");

  const securityLayers = [
    {
      icon: "🔒",
      layer: "Layer 1",
      title: "Smart Contract Security",
      description: "Every smart contract — vault, each agent, ProfitDistributor, AX token — undergoes a full independent audit before mainnet deployment. Code is publicly verified and open source.",
      features: ["Full pre-deployment audit", "Per-upgrade audit policy", "Open source on GitHub", "BaseScan verified contracts"]
    },
    {
      icon: "🛡️",
      layer: "Layer 2",
      title: "Detection — Agent V",
      description: "Agent V monitors every smart contract the protocol interacts with at the bytecode level, on every block, in real time. Emergency withdrawal triggers in the same block as detection.",
      features: ["Every-block bytecode monitoring", "Proof of Exit Kill Switch", "Same-block emergency response", "Proxy swap & ownership transfer detection"],
      link: "/proof-of-exit"
    },
    {
      icon: "⚔️",
      layer: "Layer 3",
      title: "Prevention — Agent Omega & Armor",
      description: "Omega prevents liquidation losses on leveraged positions by maintaining safety buffers and executing protective exits. Armor eliminates MEV sandwich attacks via private mempool routing.",
      features: ["Liquidation buffer management", "Automated position protection", "Private mempool submission", "MEV sandwich elimination"]
    },
    {
      icon: "🔐",
      layer: "Layer 4",
      title: "Operational Security",
      description: "Protocol admin keys use M-of-N multi-signature structure with geographically distributed keyholders. Agent contract upgrades require governance approval and execute with a mandatory 48-hour timelock. The vault contract is fully immutable.",
      features: ["M-of-N multi-sig governance", "Hardware wallet enforcement", "48-hour upgrade timelock", "Immutable vault contract"]
    },
    {
      icon: "💚",
      layer: "Layer 5",
      title: "Compensation — Agent Shield",
      description: "Agent Shield autonomously purchases and manages on-chain insurance coverage from Nexus Mutual, InsurAce, and Sherlock. When a covered event occurs, Shield initiates the claims process automatically.",
      features: ["Autonomous coverage purchasing", "Nexus Mutual / InsurAce / Sherlock", "Automatic claims initiation", "Continuous coverage management"]
    }
  ];

  const auditSchedule = [
    {
      phase: "Pre-Mainnet",
      auditor: "Independent Firm — Full Scope",
      scope: "Vault, all agents, ProfitDistributor, AX token",
      duration: "4-6 weeks",
      status: "Scheduled before public vault launch"
    },
    {
      phase: "Pre-Mainnet",
      auditor: "Independent Firm — Full Scope",
      scope: "All core contracts — second independent review",
      duration: "4-6 weeks",
      status: "Scheduled before public vault launch"
    },
    {
      phase: "Post-Launch",
      auditor: "Ongoing Reviews",
      scope: "Each agent upgrade and new agent deployment",
      duration: "Per upgrade",
      status: "Permanent policy from Phase 1"
    }
  ];

  const multiSigSigners = [
    { role: "Keyholder 1", type: "Core Team", responsibility: "Strategic oversight" },
    { role: "Keyholder 2", type: "Core Team", responsibility: "Technical validation" },
    { role: "Keyholder 3", type: "Core Team", responsibility: "Security review" },
    { role: "Keyholder 4", type: "Distributed", responsibility: "Independent signatory" },
    { role: "Keyholder 5", type: "Distributed", responsibility: "Independent signatory" },
    { role: "Keyholder 6", type: "Distributed", responsibility: "Independent signatory" },
    { role: "Keyholder 7", type: "Distributed", responsibility: "Independent signatory" }
  ];

  const bountyTiers = [
    {
      severity: "CRITICAL",
      reward: "Highest tier",
      examples: ["Steal all protocol funds", "Mint unlimited $AX", "Bypass all security", "Permanently lock funds"],
      color: "red"
    },
    {
      severity: "HIGH",
      reward: "High tier",
      examples: ["Steal significant funds", "Manipulate protocol state", "DOS critical functions"],
      color: "orange"
    },
    {
      severity: "MEDIUM",
      reward: "Medium tier",
      examples: ["Limited fund loss", "DOS non-critical functions", "Griefing attacks"],
      color: "yellow"
    },
    {
      severity: "LOW",
      reward: "Low tier",
      examples: ["Best practice violations", "Code quality issues", "Minor improvements"],
      color: "blue"
    }
  ];

  const incidentSteps = [
    {
      phase: "Detection",
      timeline: "0-1 hour",
      actions: ["Automated monitoring alerts", "Assign incident commander", "Assess severity", "Assemble response team"]
    },
    {
      phase: "Containment",
      timeline: "1-4 hours",
      actions: ["Pause affected contracts", "Alert team & auditors", "Begin forensics", "Draft public statement"]
    },
    {
      phase: "Communication",
      timeline: "2-6 hours",
      actions: ["First public statement", "Updates every 2 hours", "Twitter, Discord, Email", "Transparent status"]
    },
    {
      phase: "Resolution",
      timeline: "4-48 hours",
      actions: ["Develop fix", "Auditor review", "Deploy patch", "Verify & resume", "Post-mortem"]
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
              Security 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600"> & Trust</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto">
              Five-layer defense-in-depth security — audited contracts, real-time bytecode detection, 
              active loss prevention, governance timelocks, and autonomous insurance coverage
            </p>
          </motion.div>

          {/* Security Overview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-8 md:p-12 mb-16 text-center"
          >
            <h2 className="text-3xl font-black mb-6">Comprehensive Security Approach</h2>
            <p className="text-gray-400 max-w-3xl mx-auto mb-8">
              Aetheris implements a three-layer autonomous security architecture: Agent V detects threats 
              at the bytecode level on every block, Omega and Armor prevent losses before they occur, 
              and Shield provides automated compensation when prevention is insufficient.
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-4xl mb-3">🔒</div>
                <div className="font-bold mb-1">Independent Audits</div>
                <div className="text-xs text-gray-400">Every contract, pre-deployment</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-4xl mb-3">🛡️</div>
                <div className="font-bold mb-1">Active Detection</div>
                <div className="text-xs text-gray-400">Agent V — every block</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-4xl mb-3">🔐</div>
                <div className="font-bold mb-1">M-of-N Governance</div>
                <div className="text-xs text-gray-400">48-hour timelock on upgrades</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-4xl mb-3">💚</div>
                <div className="font-bold mb-1">Agent Shield</div>
                <div className="text-xs text-gray-400">Autonomous on-chain insurance</div>
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
            <div className="flex gap-4 border-b border-white/10 overflow-x-auto">
              {(["overview", "audits", "operations", "response"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`px-6 py-3 font-bold transition-colors relative capitalize whitespace-nowrap ${
                    selectedTab === tab 
                      ? "text-green-400" 
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab === "audits" ? "Audits & Code" : tab === "operations" ? "Operational Security" : tab === "response" ? "Incident Response" : tab}
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
            {/* Overview Tab */}
            {selectedTab === "overview" && (
              <div className="space-y-8">
                {/* 5 Security Layers */}
                <div className="space-y-6">
                  {securityLayers.map((layer, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="glass-panel p-6 md:p-8 hover:bg-white/5 transition-all"
                    >
                      <div className="flex flex-col md:flex-row items-start gap-6">
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-6xl">{layer.icon}</div>
                          <div>
                            <div className="text-sm text-cyan-400 font-bold">{layer.layer}</div>
                            <h3 className="text-2xl font-black">{layer.title}</h3>
                          </div>
                        </div>
                        
                        <div className="flex-grow">
                          <p className="text-gray-400 mb-4">{layer.description}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {layer.features.map((feature, j) => (
                              <div key={j} className="flex items-center gap-2 text-sm">
                                <span className="text-green-400">✓</span>
                                <span className="text-gray-300">{feature}</span>
                              </div>
                            ))}
                          </div>
                          {layer.link && (
                            <Link href={layer.link}>
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                className="mt-4 px-6 py-2 bg-green-500/20 border border-green-500 text-green-400 rounded-lg font-bold text-sm hover:bg-green-500/30 transition-colors"
                              >
                                Learn More →
                              </motion.button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Bug Bounty */}
                <div className="glass-panel p-8 md:p-12 text-center bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30">
                  <h2 className="text-3xl font-black mb-4">Bug Bounty Program</h2>
                  <div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 mb-4">
                    SEVERITY-TIERED
                  </div>
                  <p className="text-xl text-gray-300 mb-8">Permanent bounty program — live from mainnet launch, no expiry</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-4xl mx-auto">
                    <div className="bg-black/30 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-purple-400">In Scope</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✓ All deployed smart contracts</li>
                        <li>✓ Token & governance contracts</li>
                        <li>✓ Frontend vulnerabilities (XSS, CSRF)</li>
                        <li>✓ Infrastructure (if leads to fund theft)</li>
                      </ul>
                    </div>
                    <div className="bg-black/30 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-pink-400">How to Report</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>• Email: security@aetheris.io</li>
                        <li>• Response within 48 hours</li>
                        <li>• Rewards scale with severity</li>
                        <li>• Payment upon fix deployment</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mt-8">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-full font-black"
                    >
                      VIEW FULL PROGRAM
                    </motion.button>
                  </div>
                </div>

                {/* Comparison */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6 text-center">Security Comparison</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4">Security Measure</th>
                          <th className="text-center py-3 px-4">Typical DeFi</th>
                          <th className="text-center py-3 px-4">Aetheris</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-300">
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Professional Audits</td>
                          <td className="text-center py-3 px-4 text-yellow-400">1 audit</td>
                          <td className="text-center py-3 px-4 text-green-400 font-bold">Dual + Per Upgrade</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Active Monitoring</td>
                          <td className="text-center py-3 px-4 text-red-400">None</td>
                          <td className="text-center py-3 px-4 text-green-400 font-bold">Agent V — every block</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">MEV Protection</td>
                          <td className="text-center py-3 px-4 text-red-400">None</td>
                          <td className="text-center py-3 px-4 text-green-400 font-bold">Agent Armor (private mempool)</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Liquidation Protection</td>
                          <td className="text-center py-3 px-4 text-red-400">None</td>
                          <td className="text-center py-3 px-4 text-green-400 font-bold">Agent Omega</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Insurance Coverage</td>
                          <td className="text-center py-3 px-4 text-red-400">None</td>
                          <td className="text-center py-3 px-4 text-green-400 font-bold">Agent Shield (Nexus/InsurAce/Sherlock)</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Bug Bounty</td>
                          <td className="text-center py-3 px-4 text-red-400">None</td>
                          <td className="text-center py-3 px-4 text-green-400 font-bold">Severity-tiered, permanent</td>
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4">Upgrade Governance</td>
                          <td className="text-center py-3 px-4 text-yellow-400">Team-only</td>
                          <td className="text-center py-3 px-4 text-green-400 font-bold">M-of-N + 48hr timelock</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Audits Tab */}
            {selectedTab === "audits" && (
              <div className="space-y-8">
                {/* Audit Schedule */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6">Audit Schedule</h3>
                  <div className="space-y-4">
                    {auditSchedule.map((audit, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.1 }}
                        className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                      >
                        <div className="flex-grow mb-4 md:mb-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-bold text-lg">{audit.auditor}</h4>
                            <span className="text-xs bg-cyan-500/20 px-2 py-1 rounded-full text-cyan-400">
                              {audit.phase}
                            </span>
                          </div>
                          <div className="text-sm text-gray-400 space-y-1">
                            <div>Scope: {audit.scope}</div>
                            <div>Duration: {audit.duration}</div>
                          </div>
                        </div>
                        <div className="text-sm font-bold text-green-400">{audit.status}</div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">✓</span>
                      <div>
                        <h4 className="font-bold mb-2 text-green-400">Why Two Independent Audits?</h4>
                        <p className="text-sm text-gray-400">
                          Different auditing firms have different methodologies and areas of expertise. Having two 
                          independent firms review the same code dramatically increases the probability of finding 
                          vulnerabilities — each approaches the codebase from a different angle and catches different 
                          classes of bugs. This is the standard for protocols handling significant TVL.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vulnerability Categories */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6">What Audits Check For</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { name: "Reentrancy Attacks", desc: "Recursive calls that drain funds before state updates" },
                      { name: "Integer Overflow/Underflow", desc: "Math operations that wrap around causing incorrect balances" },
                      { name: "Access Control Issues", desc: "Functions accessible by unauthorized users" },
                      { name: "Front-Running Vulnerabilities", desc: "Transactions exploitable by MEV bots" },
                      { name: "Logic Errors", desc: "Business logic that doesn't match specification" },
                      { name: "Gas Optimization", desc: "Inefficient code causing high transaction costs" }
                    ].map((vuln, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <h4 className="font-bold mb-2 text-cyan-400">{vuln.name}</h4>
                        <p className="text-sm text-gray-400">{vuln.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Open Source */}
                <div className="glass-panel p-8 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
                  <h3 className="text-3xl font-black mb-6 text-center">100% Open Source</h3>
                  <p className="text-center text-gray-300 mb-8">
                    All smart contracts are publicly visible on GitHub and verified on BaseScan. Anyone can review, 
                    audit, and verify the code matches what's deployed on-chain.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-5xl mb-3">📖</div>
                      <div className="font-bold mb-2">GitHub Repository</div>
                      <div className="text-sm text-gray-400">Full source code + tests</div>
                    </div>
                    <div className="text-center">
                      <div className="text-5xl mb-3">✓</div>
                      <div className="font-bold mb-2">Verified Contracts</div>
                      <div className="text-sm text-gray-400">BaseScan verification</div>
                    </div>
                    <div className="text-center">
                      <div className="text-5xl mb-3">🔓</div>
                      <div className="font-bold mb-2">Public Audits</div>
                      <div className="text-sm text-gray-400">All audit reports published</div>
                    </div>
                  </div>

                  <div className="mt-8 text-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      className="px-8 py-3 bg-cyan-500 text-black rounded-full font-black"
                    >
                      VIEW ON GITHUB
                    </motion.button>
                  </div>
                </div>
              </div>
            )}

            {/* Operations Tab */}
            {selectedTab === "operations" && (
              <div className="space-y-8">
                {/* Multi-Sig Structure */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6">M-of-N Multi-Signature Governance</h3>
                  <p className="text-gray-400 mb-8">
                    Protocol admin keys use an M-of-N multi-signature structure with geographically distributed 
                    keyholders and hardware wallet enforcement. No single person holds a key that can unilaterally 
                    execute any administrative action. The signing set is designed so that no geographic concentration 
                    can result in a single point of compromise.
                  </p>

                  <div className="space-y-3 mb-8">
                    {multiSigSigners.map((signer, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500 flex items-center justify-center font-bold text-green-400">
                            {i + 1}
                          </div>
                          <div>
                            <div className="font-bold">{signer.role}</div>
                            <div className="text-sm text-gray-400">{signer.responsibility}</div>
                          </div>
                        </div>
                        <div className={`text-xs px-3 py-1 rounded-full ${
                          signer.type === 'Core Team' ? 'bg-cyan-500/20 text-cyan-400' :
                          'bg-purple-500/20 text-purple-400'
                        }`}>
                          {signer.type}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-green-400">Powers</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✓ Upgrade agent contracts (with timelock)</li>
                        <li>✓ Change protocol parameters</li>
                        <li>✓ Pause contracts (emergency)</li>
                        <li>✓ Allocate development funds</li>
                      </ul>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-red-400">Cannot Do</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✗ Steal user funds</li>
                        <li>✗ Mint new $AX tokens</li>
                        <li>✗ Bypass vesting schedules</li>
                        <li>✗ Upgrade the vault contract (immutable)</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Timelock */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6">48-Hour Timelock</h3>
                  <p className="text-gray-400 mb-6">
                    Even after multi-sig approval, all agent contract upgrades must wait 48 hours before execution. 
                    This gives the community time to review changes and withdraw funds if concerned. 
                    The vault contract itself is fully immutable — it cannot be upgraded at all.
                  </p>

                  <div className="space-y-4">
                    {[
                      { step: "Proposal Created", time: "Day 0", desc: "Multi-sig signers create upgrade proposal on-chain" },
                      { step: "Review Period", time: "Day 0-7", desc: "Community reviews code changes and raises concerns" },
                      { step: "Signers Approve", time: "Day 7", desc: "Required M-of-N signers approve the proposal" },
                      { step: "Timelock Begins", time: "Day 7-9", desc: "48-hour mandatory waiting period begins" },
                      { step: "Execution", time: "Day 9", desc: "Upgrade automatically executes if no veto" }
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center font-bold text-cyan-400 flex-shrink-0 mt-1">
                          {i + 1}
                        </div>
                        <div className="flex-grow">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-bold">{item.step}</div>
                            <div className="text-xs text-gray-500">{item.time}</div>
                          </div>
                          <div className="text-sm text-gray-400">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">⏱️</span>
                      <div>
                        <h4 className="font-bold mb-2">Minimum 9 Days Total</h4>
                        <p className="text-sm text-gray-400">
                          From proposal creation to execution: 7 days review + 2 days timelock = 9 days minimum. 
                          Protects users from malicious upgrades or compromised admin keys.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency Pause */}
                <div className="glass-panel p-8 bg-yellow-500/5 border-yellow-500/20">
                  <h3 className="text-3xl font-black mb-6 text-yellow-400">Emergency Pause Mechanism</h3>
                  <p className="text-gray-400 mb-6">
                    If a critical vulnerability is discovered, the protocol can be paused to prevent exploitation 
                    while the response team investigates and develops a fix. Emergency withdrawals remain 
                    available to users at all times — the pause never traps funds.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 rounded-lg p-4 text-center">
                      <div className="text-3xl mb-2">🔴</div>
                      <div className="font-bold mb-1">What Gets Paused</div>
                      <div className="text-sm text-gray-400">Deposits, agent executions, new trades</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 text-center">
                      <div className="text-3xl mb-2">🟢</div>
                      <div className="font-bold mb-1">Always Available</div>
                      <div className="text-sm text-gray-400">Emergency withdrawals, Proof of Exit, view functions</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-4 text-center">
                      <div className="text-3xl mb-2">⏰</div>
                      <div className="font-bold mb-1">Auto-Unpause</div>
                      <div className="text-sm text-gray-400">After 7 days max (prevents permanent locking)</div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 italic text-center">
                    Emergency pause has saved protocols from losing tens of millions in exploits by buying time for coordinated response.
                  </div>
                </div>

                {/* Agent Shield */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6">Agent Shield — Autonomous Insurance</h3>
                  <p className="text-gray-400 mb-6">
                    Agent Shield autonomously purchases and manages on-chain insurance coverage from decentralised 
                    insurance protocols. When a covered event occurs, Shield initiates the claims process automatically — 
                    no manual claim submission required from affected users.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                      <div className="text-3xl mb-2">🔵</div>
                      <div className="font-bold mb-2">Nexus Mutual</div>
                      <div className="text-sm text-gray-400">Smart contract cover for protocol exploits</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                      <div className="text-3xl mb-2">🟡</div>
                      <div className="font-bold mb-2">InsurAce</div>
                      <div className="text-sm text-gray-400">Multi-chain coverage with portfolio protection</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                      <div className="text-3xl mb-2">🟢</div>
                      <div className="font-bold mb-2">Sherlock</div>
                      <div className="text-sm text-gray-400">Audit-backed coverage with fast claims processing</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-green-400">How Shield Works</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✓ Continuously evaluates coverage needs</li>
                        <li>✓ Purchases coverage autonomously from best-priced provider</li>
                        <li>✓ Monitors claim eligibility in real time</li>
                        <li>✓ Initiates claims automatically on qualifying events</li>
                      </ul>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                      <h4 className="font-bold mb-3 text-red-400">Coverage Limitations</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✗ User error (wrong address)</li>
                        <li>✗ Phishing attacks on individual users</li>
                        <li>✗ Market price movements</li>
                        <li>✗ Events outside active policy scope</li>
                      </ul>
                    </div>
                  </div>

                  <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">💡</span>
                      <div>
                        <h4 className="font-bold mb-2">Phase Deployment</h4>
                        <p className="text-sm text-gray-400">
                          Agent Shield deploys in Phase 3 alongside Agent Omega and Agent Armor — the first time 
                          all three security layers (detection, prevention, compensation) are live simultaneously. 
                          Agent V operates as the detection layer from Phase 1.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Response Tab */}
            {selectedTab === "response" && (
              <div className="space-y-8">
                {/* Incident Response Plan */}
                <div className="glass-panel p-8">
                  <h3 className="text-3xl font-black mb-6">Incident Response Plan</h3>
                  <p className="text-gray-400 mb-8">
                    Clear, documented procedures for handling security incidents ensure rapid, coordinated response 
                    to protect user funds and maintain trust.
                  </p>

                  <div className="space-y-4">
                    {incidentSteps.map((step, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.1 }}
                        className="bg-white/5 border border-white/10 rounded-lg p-6"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xl font-bold">{step.phase}</h4>
                          <span className="text-sm text-cyan-400 font-mono">{step.timeline}</span>
                        </div>
                        <ul className="space-y-2 text-sm text-gray-400">
                          {step.actions.map((action, j) => (
                            <li key={j} className="flex items-center gap-2">
                              <span className="text-green-400">→</span>
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* User Actions */}
                <div className="glass-panel p-8 bg-cyan-500/5 border-cyan-500/20">
                  <h3 className="text-2xl font-black mb-6">What Users Should Do During Incident</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-bold mb-3 text-green-400">DO:</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✓ Read official communications carefully</li>
                        <li>✓ Verify sources (Twitter, Discord, Website)</li>
                        <li>✓ Follow team instructions</li>
                        <li>✓ Ask questions in official channels</li>
                        <li>✓ Be patient during resolution</li>
                        <li>✓ Document your positions</li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-bold mb-3 text-red-400">DON'T:</h4>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li>✗ Panic sell (may worsen situation)</li>
                        <li>✗ Trust random people offering help</li>
                        <li>✗ Click suspicious links</li>
                        <li>✗ Share your private keys</li>
                        <li>✗ Use phishing sites</li>
                        <li>✗ Make emotional decisions</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Post-Mortem Commitment */}
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black mb-4">Transparent Post-Mortems</h3>
                  <p className="text-gray-400 mb-6">
                    After every incident, a detailed post-mortem report is published including timeline, root cause, 
                    impact, and preventive measures. Full transparency builds trust.
                  </p>

                  <div className="bg-white/5 rounded-lg p-6">
                    <h4 className="font-bold mb-3">Every Post-Mortem Includes:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-400">
                      <div className="space-y-2">
                        <div>• Complete timeline of events</div>
                        <div>• Root cause analysis</div>
                        <div>• Impact assessment</div>
                        <div>• Response evaluation</div>
                      </div>
                      <div className="space-y-2">
                        <div>• Preventive measures implemented</div>
                        <div>• Code changes made</div>
                        <div>• Compensation details (if applicable)</div>
                        <div>• Lessons learned</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 text-center text-sm text-gray-500 italic">
                    Published on blog, GitHub, and sent to all users within 1-2 weeks of incident resolution.
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
            <h2 className="text-4xl font-black mb-4">Security is Our Priority</h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Five-layer defense-in-depth ensures your funds are protected by audited code, 
              real-time bytecode detection, active loss prevention, governance timelocks, and autonomous insurance.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/proof-of-exit">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full font-black shadow-lg"
                >
                  LEARN ABOUT PROOF OF EXIT
                </motion.button>
              </Link>
              <Link href="/agents">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-10 py-4 border-2 border-green-400 text-green-400 rounded-full font-black hover:bg-green-400/10 transition-colors"
                >
                  MEET ALL SECURITY AGENTS
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