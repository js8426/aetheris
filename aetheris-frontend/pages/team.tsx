// Aetheris\aetheris-frontend\pages\team.tsx

"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function TeamPage() {
  const [selectedCategory, setSelectedCategory] = useState<"leadership" | "advisors" | "join">("leadership");

  const leadership = [
    {
      name: "TBA",
      role: "Founder & CEO",
      image: "👤",
      bio: "Strategic vision and protocol architecture. Building Aetheris to make DeFi accessible to everyone.",
      linkedin: "#",
      twitter: "#"
    },
    {
      name: "TBA",
      role: "Chief Technology Officer",
      image: "👤",
      bio: "Leading smart contract development and security infrastructure. 10+ years in blockchain engineering.",
      linkedin: "#",
      twitter: "#"
    },
    {
      name: "TBA",
      role: "Head of Security",
      image: "👤",
      bio: "Formerly at leading security firms. Specializes in smart contract auditing and zero-knowledge protocols.",
      linkedin: "#",
      twitter: "#"
    },
    {
      name: "TBA",
      role: "Head of AI/ML",
      image: "👤",
      bio: "AI research and autonomous agent development. PhD in Machine Learning, former Google AI researcher.",
      linkedin: "#",
      twitter: "#"
    }
  ];

  const advisors = [
    {
      name: "TBA",
      role: "DeFi Strategy Advisor",
      image: "🎯",
      bio: "Former protocol lead at major DeFi platform. Advising on tokenomics and market strategy.",
      expertise: "DeFi Protocol Design"
    },
    {
      name: "TBA",
      role: "Security Advisor",
      image: "🔐",
      bio: "Lead auditor at Certik. Advising on smart contract security and formal verification.",
      expertise: "Smart Contract Security"
    },
    {
      name: "TBA",
      role: "ZK/Privacy Advisor",
      image: "🛡️",
      bio: "Zero-knowledge protocol researcher. Advising on V-Proofs implementation.",
      expertise: "Zero-Knowledge Proofs"
    },
    {
      name: "TBA",
      role: "Legal Advisor",
      image: "⚖️",
      bio: "Crypto securities lawyer. Advising on regulatory compliance and token structure.",
      expertise: "Regulatory Compliance"
    }
  ];

  const openPositions = [
    {
      title: "Senior Solidity Developer",
      type: "Full-Time",
      location: "Remote",
      description: "Build and audit core smart contracts. Experience with ERC-4337, upgradeability patterns, and gas optimization required.",
      requirements: ["5+ years Solidity", "Smart contract security expertise", "ERC-4337 experience preferred"]
    },
    {
      title: "Frontend Developer",
      type: "Full-Time",
      location: "Remote",
      description: "Build beautiful, intuitive dApp interface. React/Next.js expert with web3 integration experience.",
      requirements: ["3+ years React/Next.js", "Web3.js/Ethers.js", "UI/UX design sensibility"]
    },
    {
      title: "AI/ML Engineer",
      type: "Full-Time",
      location: "Remote",
      description: "Develop autonomous trading agents and threat detection systems. Strong ML background required.",
      requirements: ["ML/AI experience", "Python proficiency", "DeFi knowledge preferred"]
    },
    {
      title: "DevOps Engineer",
      type: "Full-Time",
      location: "Remote",
      description: "Maintain infrastructure, monitoring, and deployment pipelines for agents and services.",
      requirements: ["Kubernetes/Docker", "AWS/GCP", "Blockchain node operation"]
    },
    {
      title: "Community Manager",
      type: "Full-Time",
      location: "Remote",
      description: "Build and engage community across Discord, Twitter, and Telegram. Crypto-native required.",
      requirements: ["Community building experience", "Crypto native", "Excellent communication"]
    },
    {
      title: "Marketing Lead",
      type: "Full-Time",
      location: "Remote",
      description: "Drive growth strategy, partnerships, and brand awareness. DeFi marketing experience essential.",
      requirements: ["DeFi marketing experience", "Partnership development", "Content strategy"]
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
              The <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">Team</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto">
              Building the future of autonomous DeFi with world-class talent in blockchain, AI, and security
            </p>
          </motion.div>

          {/* Tab Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-12"
          >
            <div className="flex gap-4 border-b border-white/10 justify-center">
              {[
                { id: "leadership", label: "Leadership Team" },
                { id: "advisors", label: "Advisors" },
                { id: "join", label: "Join Us" }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedCategory(tab.id as any)}
                  className={`px-6 py-3 font-bold transition-colors relative ${
                    selectedCategory === tab.id 
                      ? "text-cyan-400" 
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab.label}
                  {selectedCategory === tab.id && (
                    <motion.div 
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                    />
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            key={selectedCategory}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Leadership Team */}
            {selectedCategory === "leadership" && (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {leadership.map((member, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="glass-panel p-8"
                    >
                      <div className="flex items-start gap-6">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-4xl flex-shrink-0">
                          {member.image}
                        </div>
                        <div className="flex-grow">
                          <h3 className="text-2xl font-black mb-1">{member.name}</h3>
                          <div className="text-cyan-400 font-bold mb-3">{member.role}</div>
                          <p className="text-sm text-gray-400 leading-relaxed mb-4">{member.bio}</p>
                          <div className="flex gap-3">
                            <a 
                              href={member.linkedin} 
                              className="text-gray-400 hover:text-cyan-400 transition-colors"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span className="text-xl">💼</span>
                            </a>
                            <a 
                              href={member.twitter} 
                              className="text-gray-400 hover:text-cyan-400 transition-colors"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span className="text-xl">🐦</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-12 glass-panel p-8 bg-cyan-500/5 border-cyan-500/20">
                  <div className="text-center">
                    <h3 className="text-2xl font-black mb-3">Team profiles being finalized</h3>
                    <p className="text-gray-400 max-w-2xl mx-auto">
                      Our leadership team brings decades of combined experience from top blockchain protocols, 
                      AI research labs, and security firms. Full profiles will be announced during our public launch.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Advisors */}
            {selectedCategory === "advisors" && (
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {advisors.map((advisor, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="glass-panel p-8"
                    >
                      <div className="flex items-start gap-6">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center text-3xl flex-shrink-0">
                          {advisor.image}
                        </div>
                        <div className="flex-grow">
                          <h3 className="text-xl font-black mb-1">{advisor.name}</h3>
                          <div className="text-purple-400 font-bold mb-2">{advisor.role}</div>
                          <div className="text-xs text-cyan-400 mb-3 bg-cyan-500/10 px-2 py-1 rounded inline-block">
                            {advisor.expertise}
                          </div>
                          <p className="text-sm text-gray-400 leading-relaxed">{advisor.bio}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-12 glass-panel p-8 text-center">
                  <h3 className="text-2xl font-black mb-4">Become an Advisor</h3>
                  <p className="text-gray-400 mb-6 max-w-2xl mx-auto">
                    We're seeking advisors with deep expertise in DeFi, security, AI/ML, legal/regulatory, 
                    and business development to guide our protocol development and growth.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-3 border-2 border-purple-400 text-purple-400 rounded-full font-black hover:bg-purple-400/10"
                  >
                    Apply to Advise
                  </motion.button>
                </div>
              </div>
            )}

            {/* Join Us */}
            {selectedCategory === "join" && (
              <div>
                <div className="text-center mb-12">
                  <h2 className="text-3xl font-black mb-4">Open Positions</h2>
                  <p className="text-gray-400 max-w-3xl mx-auto">
                    Join us in building the future of autonomous DeFi. We're looking for talented individuals 
                    passionate about blockchain, AI, and making DeFi accessible to everyone.
                  </p>
                </div>

                <div className="space-y-6">
                  {openPositions.map((position, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="glass-panel p-8 hover:bg-white/5 transition-all"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                        <div>
                          <h3 className="text-2xl font-black mb-2">{position.title}</h3>
                          <div className="flex gap-3 text-sm">
                            <span className="text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full">
                              {position.type}
                            </span>
                            <span className="text-gray-400 bg-white/5 px-3 py-1 rounded-full">
                              📍 {position.location}
                            </span>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-full font-bold text-sm self-start"
                        >
                          Apply Now
                        </motion.button>
                      </div>

                      <p className="text-gray-400 mb-4">{position.description}</p>

                      <div>
                        <div className="font-bold text-sm mb-2">Requirements:</div>
                        <ul className="space-y-1">
                          {position.requirements.map((req, j) => (
                            <li key={j} className="text-sm text-gray-400 flex items-center gap-2">
                              <span className="text-green-400">✓</span>
                              {req}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass-panel p-6 text-center">
                    <div className="text-4xl mb-3">🌍</div>
                    <h3 className="font-bold mb-2">Remote-First</h3>
                    <p className="text-sm text-gray-400">Work from anywhere in the world</p>
                  </div>
                  <div className="glass-panel p-6 text-center">
                    <div className="text-4xl mb-3">💰</div>
                    <h3 className="font-bold mb-2">Competitive Equity</h3>
                    <p className="text-sm text-gray-400">$AX token allocation for all team members</p>
                  </div>
                  <div className="glass-panel p-6 text-center">
                    <div className="text-4xl mb-3">🚀</div>
                    <h3 className="font-bold mb-2">Ground Floor</h3>
                    <p className="text-sm text-gray-400">Join early and shape the protocol</p>
                  </div>
                </div>

                <div className="mt-12 glass-panel p-8 text-center bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border-cyan-500/30">
                  <h3 className="text-2xl font-black mb-4">Don't see your role?</h3>
                  <p className="text-gray-400 mb-6">
                    We're always looking for exceptional talent. Send us your resume and we'll keep you in mind 
                    for future openings.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-3 border-2 border-cyan-400 text-cyan-400 rounded-full font-black hover:bg-cyan-400/10"
                  >
                    Send General Application
                  </motion.button>
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