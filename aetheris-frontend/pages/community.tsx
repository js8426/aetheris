// Aetheris\aetheris-frontend\pages\community.tsx

"use client";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function CommunityPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mb-16">
            <h1 className="text-6xl font-black mb-6">Join the<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600"> Community</span></h1>
          </motion.div>
          <div className="grid grid-cols-3 gap-6 mb-16">{[{n:"Twitter",i:"🐦",h:"@AetherisProtocol"},{n:"Discord",i:"💬",h:"discord.gg/aetheris"},{n:"Telegram",i:"📱",h:"t.me/aetheris"},{n:"GitHub",i:"💻",h:"github.com/aetheris"},{n:"Medium",i:"📝",h:"medium.com/@aetheris"},{n:"YouTube",i:"📺",h:"youtube.com/@aetheris"}].map((s,i)=>(
            <motion.div key={i} whileHover={{y:-10}} className="glass-panel p-8 text-center"><div className="text-6xl mb-4">{s.i}</div><h3 className="text-2xl font-bold mb-2">{s.n}</h3><p className="text-gray-400 text-sm font-mono">{s.h}</p></motion.div>
          ))}</div>
          <div className="glass-panel p-12"><h2 className="text-3xl font-bold text-center mb-4">Stay Updated</h2><div className="max-w-md mx-auto flex gap-4"><input type="email" placeholder="your@email.com" className="flex-1 px-6 py-4 bg-white/5 border border-white/10 rounded-full text-white"/><button className="px-8 py-4 bg-cyan-600 text-white rounded-full font-black">Subscribe</button></div></div>
        </div>
      </main>
      <Footer />
    </div>
  );
}