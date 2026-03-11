// Aetheris\aetheris-frontend\components\Footer.tsx

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h4 className="font-bold mb-4 text-cyan-400">Product</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/agents" className="hover:text-white">The 5 Agents</Link></li>
              <li><Link href="/problem" className="hover:text-white">The Problem</Link></li>
              <li><Link href="/how-it-works" className="hover:text-white">How It Works</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4 text-cyan-400">Features</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/gasless-transactions" className="hover:text-white">Gasless Transactions</Link></li>
              <li><Link href="/security" className="hover:text-white">Proof of Exit</Link></li>
              <li><Link href="/v-proofs" className="hover:text-white">V-Proofs</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4 text-cyan-400">Resources</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/whitepaper" className="hover:text-white">Whitepaper</Link></li>
              <li><Link href="/roadmap" className="hover:text-white">Roadmap</Link></li>
              <li><Link href="/tokenomics" className="hover:text-white">$AX Token</Link></li>
              <li><a href="#" className="hover:text-white">Docs</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold mb-4 text-cyan-400">Community</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/community" className="hover:text-white">Join Community</Link></li>
              <li><Link href="/team" className="hover:text-white">Team</Link></li>
              <li><Link href="/partners" className="hover:text-white">Partners</Link></li>
              <li><a href="#" className="hover:text-white">GitHub</a></li>
            </ul>
          </div>
        </div>

        <div className="flex justify-center gap-6 mb-8">
          <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors">Twitter</a>
          <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors">Discord</a>
          <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors">Telegram</a>
          <a href="#" className="text-gray-400 hover:text-cyan-400 transition-colors">GitHub</a>
        </div>

        <div className="text-center text-sm text-gray-500">
          © 2026 Aetheris Protocol. Built on Base L2.
        </div>
      </div>
    </footer>
  );
}

// import Link from "next/link";

// export default function Footer() {
//   return (
//     <footer className="border-t border-white/10 py-12 mt-auto">
//       <div className="max-w-7xl mx-auto px-6">
//         <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
//           <div>
//             <h4 className="font-bold mb-4 text-cyan-400">Product</h4>
//             <ul className="space-y-2 text-sm text-gray-400">
//               <li><Link href="/agents" className="hover:text-white">Agents</Link></li>
//               <li><Link href="/agent-gas" className="hover:text-white">Agent Gas</Link></li>
//               <li><Link href="/v-proofs" className="hover:text-white">V-Proofs</Link></li>
//             </ul>
//           </div>

//           <div>
//             <h4 className="font-bold mb-4 text-cyan-400">Resources</h4>
//             <ul className="space-y-2 text-sm text-gray-400">
//               <li><Link href="/whitepaper" className="hover:text-white">Whitepaper</Link></li>
//               <li><Link href="/roadmap" className="hover:text-white">Roadmap</Link></li>
//               <li><a href="#" className="hover:text-white">Docs</a></li>
//             </ul>
//           </div>

//           <div>
//             <h4 className="font-bold mb-4 text-cyan-400">Developers</h4>
//             <ul className="space-y-2 text-sm text-gray-400">
//               <li><a href="#" className="hover:text-white">GitHub</a></li>
//               <li><a href="#" className="hover:text-white">API</a></li>
//               <li><a href="#" className="hover:text-white">SDK</a></li>
//             </ul>
//           </div>

//           <div>
//             <h4 className="font-bold mb-4 text-cyan-400">Legal</h4>
//             <ul className="space-y-2 text-sm text-gray-400">
//               <li><a href="#" className="hover:text-white">Terms</a></li>
//               <li><a href="#" className="hover:text-white">Privacy</a></li>
//             </ul>
//           </div>
//         </div>

//         <div className="flex justify-center gap-6 mb-8">
//           <a href="#" className="text-gray-400 hover:text-cyan-400">Twitter</a>
//           <a href="#" className="text-gray-400 hover:text-cyan-400">Discord</a>
//           <a href="#" className="text-gray-400 hover:text-cyan-400">Telegram</a>
//           <a href="#" className="text-gray-400 hover:text-cyan-400">GitHub</a>
//         </div>

//         <div className="text-center text-sm text-gray-500">
//           © 2026 Aetheris Protocol. Built on Base L2.
//         </div>
//       </div>
//     </footer>
//   );
// }