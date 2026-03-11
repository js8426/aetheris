// Aetheris\aetheris-protocol\scripts\simulateProfit.ts

// Simulates a profitable arbitrage event on testnet.
// This lets you verify the full investor pipeline works:
//
//   Investor deposits USDC → Activate agent → Run this script →
//   Frontend shows claimable profit → Investor claims
//
// What it does:
//   1. Mints testnet USDC (Base Sepolia USDC has a public faucet)
//   2. Approves AgentAlpha to spend USDC on behalf of deployer
//   3. Calls AgentAlpha.simulateProfit(amount) which internally
//      calls ProfitDistributor.distributeProfit(amount)
//
// Prerequisites:
//   - At least one investor must have deposited USDC and activated
//   - Deployer wallet must have Base Sepolia ETH for gas
//
// Run:
//   npx hardhat run scripts/simulateProfit.ts --network baseSepolia
//
// Pass a custom amount (in USDC with 6 decimals):
//   PROFIT_USDC=50 npx hardhat run scripts/simulateProfit.ts --network baseSepolia

import { ethers, network } from "hardhat";

// ─── Base Sepolia USDC (Circle testnet) ──────────────────────────────────────
// Circle's testnet USDC on Base Sepolia. It has a public mint function
// callable by anyone — no faucet needed.
const USDC_ADDRESS     = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const AGENT_ALPHA_ADDR = "0x33c9bF62b3a4f5607B379f533f782040bd13A959";
const PROFIT_DIST_ADDR = "0xC38A776b958c83482914BdE299c9a6bC846CCb95";

// Minimal ABIs for what we need
const ERC20_MINT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
] as const;

// AgentAlpha — the deployer has EXECUTOR_ROLE.
// simulateProfit is a guardian-only function that bypasses the flash loan
// and directly distributes a given amount as profit. Use for testing only.
const AGENT_ALPHA_ABI = [
  "function simulateProfit(address token, uint256 amount) external",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function EXECUTOR_ROLE() view returns (bytes32)",
  "function GUARDIAN_ROLE() view returns (bytes32)",
] as const;

// ProfitDistributor — read-only checks
const PROFIT_DIST_ABI = [
  "function totalValueLocked() view returns (uint256)",
  "function totalProfitDistributed() view returns (uint256)",
  "function getUserInfo(address user) view returns (uint256 depositedAmount, uint256 claimableProfit, uint256 totalClaimed)",
  "function activeUserCount() view returns (uint256)",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(raw: bigint, dec = 6): string {
  const n = Number(raw) / 10 ** dec;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

async function tryMintUsdc(
  signer: any,
  usdc: any,
  amountRaw: bigint
): Promise<void> {
  try {
    // Circle's testnet USDC exposes mint() — try it first
    const tx = await usdc.mint(signer.address, amountRaw);
    await tx.wait();
    console.log(`  ✓ Minted ${fmt(amountRaw)} USDC via Circle faucet`);
  } catch {
    // Contract may not be mintable — user must fund manually
    const bal = await usdc.balanceOf(signer.address);
    if (bal < amountRaw) {
      throw new Error(
        `Could not mint testnet USDC and wallet balance ($${fmt(bal)}) is insufficient.\n` +
        `Get testnet USDC from:\n` +
        `  https://faucet.circle.com/\n` +
        `  or https://app.uniswap.org/ (swap testnet ETH → USDC on Base Sepolia)\n` +
        `Then re-run this script.`
      );
    }
    console.log(`  ✓ Using existing wallet USDC balance: $${fmt(bal)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  // Amount to simulate as profit (default $10 USDC)
  const profitUsdc  = parseFloat(process.env.PROFIT_USDC ?? "10");
  const profitRaw   = BigInt(Math.round(profitUsdc * 1_000_000)); // 6 decimals

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║      AETHERIS — SIMULATE PROFIT DISTRIBUTION     ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nNetwork    : ${networkName}`);
  console.log(`Deployer   : ${deployer.address}`);
  console.log(`Profit amt : $${profitUsdc} USDC`);

  const usdc       = new ethers.Contract(USDC_ADDRESS, ERC20_MINT_ABI, deployer);
  const agentAlpha = new ethers.Contract(AGENT_ALPHA_ADDR, AGENT_ALPHA_ABI, deployer);
  const profitDist = new ethers.Contract(PROFIT_DIST_ADDR, PROFIT_DIST_ABI, deployer);

  // ── Pre-flight checks ──────────────────────────────────────────────────────
  console.log("\n━━━ Pre-flight checks ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Check deployer has GUARDIAN_ROLE on AgentAlpha (required for simulateProfit)
  const guardianRole = await agentAlpha.GUARDIAN_ROLE();
  const hasGuardian  = await agentAlpha.hasRole(guardianRole, deployer.address);
  if (!hasGuardian) {
    throw new Error(
      `Deployer ${deployer.address} does not have GUARDIAN_ROLE on AgentAlpha.\n` +
      `Only the guardian can call simulateProfit().`
    );
  }
  console.log("  ✓ Deployer has GUARDIAN_ROLE on AgentAlpha");

  // Check there are active users (otherwise profit distribution is pointless)
  const tvl             = await profitDist.totalValueLocked();
  const activeUsers     = await profitDist.activeUserCount().catch(() => BigInt(0));
  const totalDistBefore = await profitDist.totalProfitDistributed();

  console.log(`  TVL            : $${fmt(tvl)}`);
  console.log(`  Active users   : ${activeUsers.toString()}`);
  console.log(`  Distributed so far: $${fmt(totalDistBefore)}`);

  if (tvl === BigInt(0)) {
    console.warn(
      "\n⚠  WARNING: TVL is $0.00 — no deposits yet.\n" +
      "   The simulation will still run but no one will receive profit.\n" +
      "   Have an investor deposit USDC and activate before running this script."
    );
  }

  // ── Mint / check USDC balance ──────────────────────────────────────────────
  console.log("\n━━━ Acquiring USDC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  await tryMintUsdc(deployer, usdc, profitRaw);

  const balAfter = await usdc.balanceOf(deployer.address);
  console.log(`  Wallet balance after mint: $${fmt(balAfter)}`);

  // ── Approve AgentAlpha to pull the profit amount ───────────────────────────
  console.log("\n━━━ Approving USDC spend ━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.stdout.write("  Approving AgentAlpha...");
  const approveTx = await usdc.approve(AGENT_ALPHA_ADDR, profitRaw);
  await approveTx.wait();
  console.log(" ✓");
  // Wait for RPC to settle before next tx
  await new Promise(r => setTimeout(r, 5000));

  // ── Call simulateProfit ────────────────────────────────────────────────────
  console.log("\n━━━ Distributing profit ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Calling AgentAlpha.simulateProfit($${profitUsdc})...`);

  try {
    const tx = await agentAlpha.simulateProfit(USDC_ADDRESS, profitRaw);
    const receipt = await tx.wait();
    console.log(`  ✓ Confirmed in block ${receipt.blockNumber}`);
    console.log(`  Tx: https://sepolia.basescan.org/tx/${receipt.hash}`);
  } catch (err: any) {
    // If simulateProfit doesn't exist on the contract, try direct distributeProfit
    console.log("  ⚠ simulateProfit() not found on AgentAlpha. Trying alternative...");
    console.log("");
    console.log("  ACTION NEEDED:");
    console.log("  Add this function to AgentAlpha.sol:");
    console.log("");
    console.log("  /// @dev Testnet only — guardian injects profit directly for UI testing");
    console.log("  function simulateProfit(uint256 amountUsdc)");
    console.log("      external onlyRole(GUARDIAN_ROLE) {");
    console.log("      IERC20(USDC_ADDRESS).transferFrom(msg.sender, address(profitDistributor), amountUsdc);");
    console.log("      IProfitDistributor(address(profitDistributor)).distributeProfit(amountUsdc);");
    console.log("  }");
    console.log("");
    console.log("  Then redeploy: npx hardhat run scripts/redeployCore.ts --network baseSepolia");
    throw err;
  }

  // ── Results ────────────────────────────────────────────────────────────────
  console.log("\n━━━ Results ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const totalDistAfter = await profitDist.totalProfitDistributed();
  const increase       = totalDistAfter - totalDistBefore;

  console.log(`  Total Distributed: $${fmt(totalDistBefore)} → $${fmt(totalDistAfter)}`);
  console.log(`  Increase:          +$${fmt(increase)}`);

  // Check a few users if we can
  console.log("\n  Investor balances after distribution:");
  // (No easy way to enumerate users — they'd need to call getUserInfo themselves)
  console.log("  (Investors can check their claimable balance on the Earn page)");

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         SIMULATION COMPLETE ✓                    ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("\nNext steps:");
  console.log("  1. Open the Earn page — 'Claimable' should show a non-zero value");
  console.log("  2. Click 'Claim Profits' to withdraw the USDC to your wallet");
  console.log("  3. Run this script again to simulate another profit distribution");
  console.log("  4. When ready for live trading, start the Python agent:");
  console.log("     cd aetheris-agent && python agent.py --network baseSepolia");
}

main().catch((err) => {
  console.error("\n✗ Simulation failed:", err.message);
  process.exit(1);
});