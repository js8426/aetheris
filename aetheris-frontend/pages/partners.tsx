// Aetheris\aetheris-frontend\pages\partners.tsx

"use client";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function PartnersPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mb-16">
            <h1 className="text-6xl font-black mb-6">Partners<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600"> & Integrations</span></h1>
          </motion.div>
          <h2 className="text-3xl font-bold mb-8">Blockchain Partners</h2>
          <div className="grid grid-cols-4 gap-6 mb-16">{[{n:"Base",i:"⛓️"},{n:"Uniswap",i:"🦄"},{n:"Aerodrome",i:"✈️"},{n:"Chainlink",i:"🔗"}].map((p,i)=>(
            <motion.div key={i} whileHover={{y:-10}} className="glass-panel p-8 text-center"><div className="text-6xl mb-4">{p.i}</div><h3 className="text-xl font-bold">{p.n}</h3></motion.div>
          ))}</div>
          <h2 className="text-3xl font-bold mb-8">Technology Partners</h2>
          <div className="grid grid-cols-4 gap-6">{[{n:"DeepSeek",i:"🧠"},{n:"Gemini",i:"💎"},{n:"Claude",i:"🤖"},{n:"Noir",i:"🔐"}].map((p,i)=>(
            <motion.div key={i} whileHover={{y:-10}} className="glass-panel p-8 text-center"><div className="text-6xl mb-4">{p.i}</div><h3 className="text-xl font-bold">{p.n}</h3></motion.div>
          ))}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}