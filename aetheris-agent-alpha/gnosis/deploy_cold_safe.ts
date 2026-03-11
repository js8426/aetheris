// Aetheris\aetheris-agent-alpha\gnosis\deploy_cold_safe.ts

// Aetheris\aetheris-agent-alpha\gnosis\gnosis_safe_setup.md — READ THIS FIRST
// Aetheris\aetheris-agent-alpha\gnosis\deploy_cold_safe.ts — run after reading

/**
 * GNOSIS SAFE SETUP — 5-OF-7 COLD SAFE
 *
 * WHAT IS A GNOSIS SAFE:
 *   A Gnosis Safe is a smart contract wallet that requires multiple people
 *   to approve any transaction before it executes. Instead of one private
 *   key controlling a wallet, you have N signers where M of them must agree.
 *   Aetheris uses a 5-of-7 configuration: 7 signers exist, and any 5 must
 *   agree before a transaction executes.
 *
 * THE 7 SIGNERS:
 *   Signer 1: Team member 1       (Aetheris core team)
 *   Signer 2: Team member 2       (Aetheris core team)
 *   Signer 3: Team member 3       (Aetheris core team)
 *   Signer 4: Community member 1  (elected by $AX governance vote)
 *   Signer 5: Community member 2  (elected by $AX governance vote)
 *   Signer 6: Auditor 1           (e.g., Certik representative)
 *   Signer 7: Auditor 2           (e.g., OpenZeppelin representative)
 *
 * WHY 5-OF-7:
 *   - Team alone (3 members) cannot move funds — prevents insider rug-pull
 *   - Any 2 signers can be unavailable and funds are still accessible
 *   - Attackers must compromise 5 separate wallets across 3 organizations
 *
 * HOW TO SET UP (step by step):
 *
 *   Step 1: Each of the 7 signers creates a hardware wallet (Ledger/Trezor)
 *           Do NOT use a software wallet for Cold Safe signers.
 *
 *   Step 2: Go to https://app.safe.global
 *           Connect your wallet. Click "Create new Safe".
 *           Network: Base Mainnet
 *           Owners: Enter all 7 signer addresses
 *           Threshold: 5
 *           Click "Create". Pay the deployment gas.
 *
 *   Step 3: Copy the Safe address that is generated.
 *           This is your COLD_SAFE address.
 *           Put it in your .env file: COLD_SAFE_ADDRESS=0x...
 *
 *   Step 4: Deploy ColdSafeClaim.sol with this address as the coldSafe parameter.
 *
 *   Step 5: On the Safe UI, call ColdSafeClaim.grantRole(COLD_SAFE_ROLE, safeAddress)
 *           This requires 5-of-7 signatures.
 *
 * HOW TO EXECUTE TRANSACTIONS ON THE SAFE:
 *
 *   When Proof of Exit fires and funds arrive in the Safe:
 *
 *   Step 1: One signer goes to app.safe.global, opens the Safe.
 *   Step 2: Click "New Transaction" → "Contract Interaction".
 *   Step 3: Enter the ColdSafeClaim address.
 *   Step 4: Select "createClaimEvent" function.
 *   Step 5: Fill in the Merkle root, token addresses, amounts, snapshot block.
 *   Step 6: Click "Create Transaction". The transaction is now pending.
 *   Step 7: Share the transaction link with the other 6 signers.
 *   Step 8: Each signer reviews and signs. After 5 signatures, anyone can execute.
 *
 * HOW TO GENERATE THE MERKLE ROOT (off-chain, before calling createClaimEvent):
 *
 *   Run the script below: npx ts-node gnosis/generate_merkle_root.ts
 *   Input: a CSV file with columns: address, token, amount
 *   Output: the Merkle root and a proofs JSON file for the frontend
 */

// ─────────────────────────────────────────────────────────────────────────────
// deploy_cold_safe.ts
// Deploys ColdSafeClaim pointing to your Gnosis Safe address.
// Run AFTER setting up the Safe at app.safe.global.
//
// Usage:
//   npx hardhat run gnosis/deploy_cold_safe.ts --network base-sepolia
// ─────────────────────────────────────────────────────────────────────────────

import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const COLD_SAFE_ADDRESS = process.env.COLD_SAFE_ADDRESS;
  const GOVERNANCE_ADDRESS = process.env.GOVERNANCE_ADDRESS; // AetherisTimelock address

  if (!COLD_SAFE_ADDRESS || !GOVERNANCE_ADDRESS) {
    throw new Error(
      "Set COLD_SAFE_ADDRESS and GOVERNANCE_ADDRESS in your .env file before deploying."
    );
  }

  console.log("Deploying ColdSafeClaim...");
  console.log("  Cold Safe (5-of-7 Gnosis):", COLD_SAFE_ADDRESS);
  console.log("  Governance (Timelock):    ", GOVERNANCE_ADDRESS);

  const [deployer] = await ethers.getSigners();
  console.log("  Deployer:                 ", deployer.address);

  const ColdSafeClaim = await ethers.getContractFactory("ColdSafeClaim");
  const contract = await ColdSafeClaim.deploy(COLD_SAFE_ADDRESS, GOVERNANCE_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ ColdSafeClaim deployed at:", address);

  // Save address to deployments file
  const deployments: Record<string, string> = fs.existsSync("deployments.json")
    ? JSON.parse(fs.readFileSync("deployments.json", "utf8"))
    : {};

  deployments["ColdSafeClaim"] = address;
  fs.writeFileSync("deployments.json", JSON.stringify(deployments, null, 2));
  console.log("✅ Address saved to deployments.json");

  console.log("\nNext steps:");
  console.log("1. Copy the ColdSafeClaim address above into your .env:");
  console.log("   COLD_SAFE_CLAIM_ADDRESS=" + address);
  console.log("2. On app.safe.global, call grantRole(COLD_SAFE_ROLE, safeAddress)");
  console.log("   to give the Safe permission to create claim events.");
  console.log("3. Update the frontend with the ColdSafeClaim address.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});