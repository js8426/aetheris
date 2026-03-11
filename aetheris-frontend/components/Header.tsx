// Aetheris\aetheris-frontend\components\Header.tsx

// Aetheris\aetheris-frontend\components\Header.tsx
// UPDATED: subtitle changed from AUTONOMOUS PROTOCOL → AUTONOMOUS AGENTS

"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

// Pages that are "inside the app" — don't show Launch App button here
const APP_PAGES = ["/dashboard", "/stake", "/earn", "/account"];

export default function Header() {
  const [openDropdown, setOpenDropdown] = useState<'features' | 'more' | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const isAppPage = APP_PAGES.some((p) => router.pathname.startsWith(p));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openDropdown]);

  useEffect(() => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  }, [router.pathname]);

  const toggleDropdown = (dropdown: "features" | "more") => {
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  const handleLaunchApp = () => {
    if (isConnected) {
      router.push("/dashboard");
    } else {
      openConnectModal?.();
    }
  };

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-full border-2 border-cyan-400 overflow-hidden">
              <Image
                src="/aetherisLogo.jpg"
                alt="Aetheris"
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="font-black text-xl">AETHERIS</div>
              <div className="text-[10px] text-cyan-400 -mt-1">AUTONOMOUS AGENTS</div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            <Link href="/" className="hover:text-cyan-400 transition-colors font-bold">
              Home
            </Link>

            <Link href="/problem" className="hover:text-cyan-400 transition-colors font-bold">
              Problem
            </Link>

            <Link href="/agents" className="hover:text-cyan-400 transition-colors font-bold">
              Agents
            </Link>

            {/* Features Dropdown */}
            <div className="relative">
              <button
                onClick={() => toggleDropdown("features")}
                className="flex items-center gap-1 hover:text-cyan-400 transition-colors font-bold"
              >
                Features
                <motion.span
                  animate={{ rotate: openDropdown === "features" ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs"
                >
                  ▼
                </motion.span>
              </button>

              <AnimatePresence>
                {openDropdown === "features" && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-2 min-w-[200px] z-[9999]"
                  >
                    <div className="glass-panel p-4 space-y-2">
                      <Link
                        href="/gasless-transactions"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Gasless Transactions
                      </Link>
                      <Link
                        href="/proof-of-exit"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Proof of Exit
                      </Link>
                      <Link
                        href="/v-proofs"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        V-Proofs
                      </Link>
                      <Link
                        href="/security"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Security
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* More Dropdown */}
            <div className="relative">
              <button
                onClick={() => toggleDropdown("more")}
                className="flex items-center gap-1 hover:text-cyan-400 transition-colors font-bold"
              >
                More
                <motion.span
                  animate={{ rotate: openDropdown === "more" ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs"
                >
                  ▼
                </motion.span>
              </button>

              <AnimatePresence>
                {openDropdown === "more" && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-2 min-w-[200px] z-[9999]"
                  >
                    <div className="glass-panel p-4 space-y-2">
                      <Link
                        href="/how-it-works"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        How It Works
                      </Link>
                      <Link
                        href="/tokenomics"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        $AX Token
                      </Link>
                      <Link
                        href="/roadmap"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Roadmap
                      </Link>
                      <Link
                        href="/team"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Team
                      </Link>
                      <Link
                        href="/partners"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Partners
                      </Link>
                      <Link
                        href="/community"
                        className="block py-2 px-3 hover:bg-cyan-400/10 rounded transition-colors hover:text-cyan-400"
                        onClick={() => setOpenDropdown(null)}
                      >
                        Community
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link href="/whitepaper" className="hover:text-cyan-400 transition-colors font-bold">
              Whitepaper
            </Link>
          </nav>

          {/* Right side: Launch App + Connect Wallet */}
          <div className="hidden lg:flex items-center gap-3">
            {!isAppPage && (
              <motion.button
                onClick={handleLaunchApp}
                whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(6,182,212,0.4)" }}
                whileTap={{ scale: 0.95 }}
                className="px-5 py-2 rounded-full font-black text-sm text-white border-0"
                style={{
                  background: "linear-gradient(90deg, #06b6d4, #2563eb)",
                  boxShadow: "0 0 12px rgba(6,182,212,0.25)",
                }}
              >
                LAUNCH APP ⚡
              </motion.button>
            )}
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden flex flex-col gap-1.5 w-8 h-8 justify-center items-center"
          >
            <motion.span
              animate={{ rotate: mobileMenuOpen ? 45 : 0, y: mobileMenuOpen ? 8 : 0 }}
              className="w-6 h-0.5 bg-white block"
            />
            <motion.span
              animate={{ opacity: mobileMenuOpen ? 0 : 1 }}
              className="w-6 h-0.5 bg-white block"
            />
            <motion.span
              animate={{ rotate: mobileMenuOpen ? -45 : 0, y: mobileMenuOpen ? -8 : 0 }}
              className="w-6 h-0.5 bg-white block"
            />
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden overflow-hidden"
            >
              <nav className="flex flex-col gap-4 pt-6 pb-4">
                <Link href="/" className="py-2 hover:text-cyan-400 transition-colors font-bold" onClick={() => setMobileMenuOpen(false)}>Home</Link>
                <Link href="/problem" className="py-2 hover:text-cyan-400 transition-colors font-bold" onClick={() => setMobileMenuOpen(false)}>Problem</Link>
                <Link href="/agents" className="py-2 hover:text-cyan-400 transition-colors font-bold" onClick={() => setMobileMenuOpen(false)}>Agents</Link>

                <div className="border-t border-white/10 pt-2">
                  <div className="text-xs text-gray-500 mb-2 uppercase">Features</div>
                  <Link href="/gasless-transactions" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Gasless Transactions</Link>
                  <Link href="/proof-of-exit" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Proof of Exit</Link>
                  <Link href="/v-proofs" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>V-Proofs</Link>
                  <Link href="/security" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Security</Link>
                </div>

                <div className="border-t border-white/10 pt-2">
                  <div className="text-xs text-gray-500 mb-2 uppercase">More</div>
                  <Link href="/how-it-works" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>How It Works</Link>
                  <Link href="/tokenomics" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>$AX Token</Link>
                  <Link href="/roadmap" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Roadmap</Link>
                  <Link href="/team" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Team</Link>
                  <Link href="/partners" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Partners</Link>
                  <Link href="/community" className="block py-2 pl-4 hover:text-cyan-400 transition-colors" onClick={() => setMobileMenuOpen(false)}>Community</Link>
                </div>

                <Link href="/whitepaper" className="py-2 hover:text-cyan-400 transition-colors font-bold" onClick={() => setMobileMenuOpen(false)}>Whitepaper</Link>

                {!isAppPage && (
                  <motion.button
                    onClick={() => { setMobileMenuOpen(false); handleLaunchApp(); }}
                    whileTap={{ scale: 0.96 }}
                    className="px-6 py-3 rounded-full font-black text-white border-0 mt-1"
                    style={{ background: "linear-gradient(90deg, #06b6d4, #2563eb)" }}
                  >
                    LAUNCH APP ⚡
                  </motion.button>
                )}

                <div className="mt-2">
                  <ConnectButton chainStatus="none" showBalance={false} accountStatus="address" />
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}