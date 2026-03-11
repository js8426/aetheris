// Aetheris\aetheris-protocol\scripts\wirePhase2.ts

// SPDX-License-Identifier: MIT
// Aetheris\aetheris-protocol\scripts\wirePhase2.ts
//
// Phase 2 deployment wiring script.
// Connects AetherisVault ↔ AgentBeta ↔ AetherisStaking after all contracts
// are deployed and the audit is cleared.
//
// Run order:
//   1. npx hardhat run scripts/wirePhase2.ts --network base
//
// Prerequisites:
//   - All contracts deployed (addresses filled in ADDRESSES below)
//   - Deployer wallet holds DEFAULT_ADMIN_ROLE on vault and agentBeta
//   - Governance timelock has VAULT_MANAGER_ROLE and DEFAULT_ADMIN_ROLE
//   - .env has PRIVATE_KEY set to deployer wallet

import { ethers } from "hardhat";

// ─────────────────────────────────────────────────────────────────────────────
// FILL THESE IN after deployment
// ─────────────────────────────────────────────────────────────────────────────
const ADDRESSES = {
  vault:       "0x_VAULT_ADDRESS",
  agentBeta:   "0x_AGENT_BETA_ADDRESS",
  staking:     "0x_STAKING_ADDRESS",
  governance:  "0x_GOVERNANCE_TIMELOCK_ADDRESS",
  feeRecipient:"0x_TREASURY_MULTISIG_ADDRESS",
  usdc:        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet USDC
};

// Initial capital allocation to AgentBeta on Phase 2 launch ($50,000 USDC)
// Raise this gradually as Beta demonstrates live mainnet profitability.
const INITIAL_BETA_ALLOCATION_USDC = 50_000n * 1_000_000n; // 50k × 1e6

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // ── Load contract instances ───────────────────────────────────────────────

  const vault = await ethers.getContractAt("AetherisVault",   ADDRESSES.vault);
  const beta  = await ethers.getContractAt("AgentBeta",       ADDRESSES.agentBeta);
  const stake = await ethers.getContractAt("AetherisStaking", ADDRESSES.staking);
  const usdc  = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    ADDRESSES.usdc
  );

  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  PHASE 2 WIRING — Aetheris Protocol");
  console.log("═══════════════════════════════════════════════════════\n");

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCK 1 — Wire AgentBeta ↔ AetherisVault
  // ─────────────────────────────────────────────────────────────────────────
  console.log("BLOCK 1: Wiring AgentBeta ↔ AetherisVault");

  // 1a. Tell AgentBeta where the vault is.
  //     This grants VAULT_ROLE to the vault address inside AgentBeta.
  //     After this call, only the vault can call allocateCapital() and
  //     recallCapital() on AgentBeta.
  console.log("  [1/6] AgentBeta.setVault(vault)...");
  let tx = await beta.setVault(ADDRESSES.vault);
  await tx.wait();
  console.log("  ✅  AgentBeta.vault =", ADDRESSES.vault);

  // 1b. Tell AgentBeta where to send user-share profits.
  //     Setting profitDistributor = vault means that when AgentBeta calls
  //     IProfitDistributor(profitDistributor).recordProfit(), USDC lands
  //     in the vault and increments its totalAssets → share price rises.
  console.log("  [2/6] AgentBeta.setProfitDistributor(vault)...");
  tx = await beta.setProfitDistributor(ADDRESSES.vault);
  await tx.wait();
  console.log("  ✅  AgentBeta.profitDistributor =", ADDRESSES.vault);

  // 1c. Register AgentBeta in the vault's agent registry.
  //     After this, the vault knows about Beta, includes its deployedBalance()
  //     in totalAssets(), and can allocateToAgent(beta, amount).
  //     AgentAlpha is intentionally NOT registered — it uses flash loans only.
  console.log("  [3/6] AetherisVault.registerAgent(agentBeta, 'AgentBeta')...");
  tx = await vault.registerAgent(ADDRESSES.agentBeta, "AgentBeta");
  await tx.wait();
  console.log("  ✅  AgentBeta registered in vault");

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCK 2 — Wire AetherisStaking → AetherisVault
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nBLOCK 2: Wiring AetherisStaking → AetherisVault");

  // 2a. Tell the vault where the staking contract is.
  //     The vault will now call staking.getUserFeeDiscountBps(user) on every
  //     withdrawal to calculate the AX staker fee discount.
  console.log("  [4/6] AetherisVault.setStakingContract(staking)...");
  tx = await vault.setStakingContract(ADDRESSES.staking);
  await tx.wait();
  console.log("  ✅  AetherisVault.stakingContract =", ADDRESSES.staking);

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCK 3 — Enable deposits and open vault to the public
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nBLOCK 3: Enabling public deposits (Phase 2 gate)");

  // 3a. Flip the Phase 2 deposit gate.
  //     This is the single line that opens the vault to the public.
  //     Only call this after:
  //       ✅ Audit complete, no unresolved high/critical findings
  //       ✅ AgentAlpha: 30+ days mainnet profitability validated
  //       ✅ AgentBeta:  30+ days mainnet profitability validated
  //       ✅ All wiring above confirmed via getStats() and getAgents()
  console.log("  [5/6] AetherisVault.setDepositsEnabled(true)...");
  tx = await vault.setDepositsEnabled(true);
  await tx.wait();
  console.log("  ✅  Deposits ENABLED — vault is now live");

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCK 4 — First capital allocation to AgentBeta
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\nBLOCK 4: First capital allocation to AgentBeta");

  // 4a. Check vault has enough idle USDC before allocating.
  //     In production this will be from depositors. For testnet/staging,
  //     ensure the vault holds USDC before running this step.
  const idleUsdc = await usdc.balanceOf(ADDRESSES.vault);
  console.log(
    `  Vault idle USDC: $${Number(idleUsdc) / 1e6}`
  );

  if (idleUsdc >= INITIAL_BETA_ALLOCATION_USDC) {
    // 4b. Allocate initial capital to AgentBeta.
    //     The vault will:
    //       1. Check idle buffer compliance (20% must remain idle after allocation)
    //       2. safeIncreaseAllowance(agentBeta, amount)
    //       3. Call agentBeta.allocateCapital(amount)
    //       4. AgentBeta pulls USDC via safeTransferFrom
    console.log(
      `  [6/6] AetherisVault.allocateToAgent(agentBeta, $${Number(INITIAL_BETA_ALLOCATION_USDC)/1e6}k)...`
    );
    tx = await vault.allocateToAgent(
      ADDRESSES.agentBeta,
      INITIAL_BETA_ALLOCATION_USDC
    );
    await tx.wait();
    console.log(
      `  ✅  $${Number(INITIAL_BETA_ALLOCATION_USDC)/1e6}k USDC allocated to AgentBeta`
    );
  } else {
    console.log(
      "  ⚠️  Insufficient idle USDC for initial allocation — skipping step 6."
    );
    console.log(
      "      Fund the vault first, then call vault.allocateToAgent(agentBeta, amount)."
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICATION — Confirm final state
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  VERIFICATION");
  console.log("═══════════════════════════════════════════════════════");

  const stats = await vault.getStats();
  console.log("\n  AetherisVault.getStats():");
  console.log(`    totalAssets:        $${Number(stats._totalAssets)         / 1e6}`);
  console.log(`    idleAssets:         $${Number(stats._idleAssets)          / 1e6}`);
  console.log(`    deployedAssets:     $${Number(stats._deployedAssets)      / 1e6}`);
  console.log(`    totalShares:        ${Number(stats._totalShares)          / 1e6} avUSDC`);
  console.log(`    sharePrice:         $${Number(stats._sharePrice)          / 1e6}`);
  console.log(`    depositsEnabled:    ${stats._depositsEnabled}`);
  console.log(`    depositCap:         $${Number(stats._depositCap)          / 1e6}`);
  console.log(`    agentCount:         ${stats._agentCount}`);

  const vaultAddr   = await beta.vault();
  const profitDist  = await beta.profitDistributor();
  const stakingAddr = await vault.stakingContract();

  console.log("\n  Cross-contract wiring:");
  console.log(`    agentBeta.vault:               ${vaultAddr}`);
  console.log(`    agentBeta.profitDistributor:   ${profitDist}`);
  console.log(`    vault.stakingContract:         ${stakingAddr}`);

  const vaultCorrect   = vaultAddr.toLowerCase()  === ADDRESSES.vault.toLowerCase();
  const profitCorrect  = profitDist.toLowerCase()  === ADDRESSES.vault.toLowerCase();
  const stakingCorrect = stakingAddr.toLowerCase() === ADDRESSES.staking.toLowerCase();

  console.log("\n  Wiring checks:");
  console.log(`    agentBeta.vault = vault:             ${vaultCorrect   ? "✅" : "❌ MISMATCH"}`);
  console.log(`    agentBeta.profitDist = vault:        ${profitCorrect  ? "✅" : "❌ MISMATCH"}`);
  console.log(`    vault.stakingContract = staking:     ${stakingCorrect ? "✅" : "❌ MISMATCH"}`);

  if (vaultCorrect && profitCorrect && stakingCorrect) {
    console.log("\n  ✅  All wiring verified. Phase 2 is live.\n");
  } else {
    console.log("\n  ❌  One or more wiring checks failed. Review logs above.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});