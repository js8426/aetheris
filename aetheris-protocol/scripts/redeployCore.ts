// Aetheris\aetheris-protocol\scripts\redeployCore.ts

// Redeploys ONLY AgentAlpha and ProfitDistributor.
// All other contracts (Token, Staking, Factory, Paymaster) are left untouched.
//
// Run:
//   npx hardhat run scripts/redeployCore.ts --network baseSepolia

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEX_WHITELIST: Record<string, { name: string; address: string; dexType: number }[]> = {
  baseSepolia: [
    { name: "Uniswap V3", address: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", dexType: 0 },
    { name: "Aerodrome",  address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", dexType: 1 },
  ],
  base: [
    { name: "Uniswap V3", address: "0x2626664c2603336E57B271c5C0b26F421741e481", dexType: 0 },
    { name: "Aerodrome",  address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", dexType: 1 },
  ],
};

const TOKEN_WHITELIST: Record<string, { name: string; address: string }[]> = {
  baseSepolia: [
    { name: "USDC",  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    { name: "WETH",  address: "0x4200000000000000000000000000000000000006" },
    { name: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },
  ],
  base: [
    { name: "USDC",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    { name: "WETH",  address: "0x4200000000000000000000000000000000000006" },
    { name: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },
  ],
};

// ─── Nonce manager ────────────────────────────────────────────────────────────
// We manage nonces explicitly to guarantee sequential transactions never
// collide, regardless of RPC mempool reporting latency.
let _nonce: number | null = null;

async function nextNonce(signer: any): Promise<number> {
  if (_nonce === null) {
    // Fetch confirmed nonce on first call — never use "pending" here because
    // a stuck pending tx from a previous failed run would produce an incorrect
    // starting value.
    _nonce = await signer.provider.getTransactionCount(signer.address, "latest");
  }
  const n = _nonce;
  _nonce += 1;
  return n;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     AETHERIS — REDEPLOY AgentAlpha +             ║");
  console.log("║               ProfitDistributor                  ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nNetwork  : ${networkName}`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  const deploymentsDir  = path.join(__dirname, "..", "deployments");
  const deploymentsFile = path.join(deploymentsDir, `${networkName}.json`);

  if (!fs.existsSync(deploymentsFile)) {
    throw new Error(`No existing deployment found at ${deploymentsFile}. Run deploy.ts first.`);
  }

  const existing = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const ext = existing.external;
  const old = existing.contracts;

  console.log("\n━━━ Existing (unchanged) contracts ━━━━━━━━━━━━━━━━━");
  console.log(`  AetherisToken          : ${old.AetherisToken}`);
  console.log(`  AetherisStaking        : ${old.AetherisStaking}`);
  console.log(`  AetherisAccountFactory : ${old.AetherisAccountFactory}`);
  console.log(`  AetherisPaymaster      : ${old.AetherisPaymaster}`);
  console.log(`\n  Aave Pool (external)   : ${ext.aavePool}`);
  console.log(`  USDC (external)        : ${ext.usdc}`);

  if (existing.deployer.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(
      `Deployer mismatch.\n` +
      `  Original : ${existing.deployer}\n` +
      `  Current  : ${deployer.address}\n` +
      `Ensure PRIVATE_KEY in .env matches the original deployment.`
    );
  }

  // ── 1. Deploy AgentAlpha ──────────────────────────────────────────────────
  console.log("\n━━━ Deploying new contracts ━━━━━━━━━━━━━━━━━━━━━━━");
  process.stdout.write("  [1/2] AgentAlpha...");

  const AgentAlpha = await ethers.getContractFactory("AgentAlpha");
  const agentAlpha = await AgentAlpha.deploy(
    ext.aavePool,
    deployer.address,
    deployer.address,
    deployer.address,
    { nonce: await nextNonce(deployer) }
  );
  await agentAlpha.waitForDeployment();
  const newAgentAlphaAddr = await agentAlpha.getAddress();
  console.log(` ✓  ${newAgentAlphaAddr}`);

  // ── 2. Deploy ProfitDistributor ───────────────────────────────────────────
  process.stdout.write("  [2/2] ProfitDistributor...");

  const ProfitDistributor = await ethers.getContractFactory("ProfitDistributor");
  const profitDistributor = await ProfitDistributor.deploy(
    ext.usdc,
    newAgentAlphaAddr,
    deployer.address,
    deployer.address,
    { nonce: await nextNonce(deployer) }
  );
  await profitDistributor.waitForDeployment();
  const newProfitDistributorAddr = await profitDistributor.getAddress();
  console.log(` ✓  ${newProfitDistributorAddr}`);

  // ── 3. Wire ───────────────────────────────────────────────────────────────
  console.log("\n━━━ Wiring contracts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.stdout.write("  AgentAlpha.setProfitDistributor...");
  await (await agentAlpha.setProfitDistributor(
    newProfitDistributorAddr,
    { nonce: await nextNonce(deployer) }
  )).wait();
  console.log(" ✓");

  // ── 4. Whitelist tokens ───────────────────────────────────────────────────
  console.log("\n━━━ Whitelisting tokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const token of (TOKEN_WHITELIST[networkName] ?? TOKEN_WHITELIST.baseSepolia)) {
    process.stdout.write(`  ${token.name} (${token.address})...`);
    try {
      await (await agentAlpha.whitelistToken(
        token.address, true,
        { nonce: await nextNonce(deployer) }
      )).wait();
      console.log(" ✓");
    } catch (err: any) { console.log(` ✗  ${err.message}`); }
  }

  // ── 5. Whitelist DEXes ────────────────────────────────────────────────────
  console.log("\n━━━ Whitelisting DEXes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const dex of (DEX_WHITELIST[networkName] ?? DEX_WHITELIST.baseSepolia)) {
    process.stdout.write(`  ${dex.name} (${dex.address})...`);
    try {
      await (await agentAlpha.whitelistDex(
        dex.address, dex.dexType, true,
        { nonce: await nextNonce(deployer) }
      )).wait();
      console.log(" ✓");
    } catch (err: any) { console.log(` ✗  ${err.message}`); }
  }

  // ── 6. Save deployment JSON ───────────────────────────────────────────────
  console.log("\n━━━ Saving updated deployment files ━━━━━━━━━━━━━━━");

  fs.writeFileSync(deploymentsFile, JSON.stringify({
    ...existing,
    deployedAt:   new Date().toISOString(),
    redeployedAt: new Date().toISOString(),
    previousContracts: {
      AgentAlpha:        old.AgentAlpha,
      ProfitDistributor: old.ProfitDistributor,
    },
    contracts: {
      ...old,
      AgentAlpha:        newAgentAlphaAddr,
      ProfitDistributor: newProfitDistributorAddr,
    },
  }, null, 2));
  console.log(`  deployments/${networkName}.json ✓`);

  // ── 7. Save env file ──────────────────────────────────────────────────────
  fs.writeFileSync(
    path.join(deploymentsDir, `${networkName}.env`),
`# Auto-generated by redeployCore.ts — ${new Date().toISOString()}
# Network: ${networkName}
# AgentAlpha and ProfitDistributor redeployed. All other addresses unchanged.

# ── Frontend (paste into aetheris-frontend/.env.local) ────
NEXT_PUBLIC_AX_TOKEN_ADDRESS=${old.AetherisToken}
NEXT_PUBLIC_STAKING_ADDRESS=${old.AetherisStaking}
NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS=${old.AetherisAccountFactory}
NEXT_PUBLIC_PAYMASTER_ADDRESS=${old.AetherisPaymaster}
NEXT_PUBLIC_AGENT_ALPHA_ADDRESS=${newAgentAlphaAddr}
NEXT_PUBLIC_PROFIT_DISTRIBUTOR_ADDRESS=${newProfitDistributorAddr}

# ── Backend (paste into aetheris-backend/.env) ─────────────
AX_TOKEN_ADDRESS=${old.AetherisToken}
STAKING_ADDRESS=${old.AetherisStaking}
ACCOUNT_FACTORY_ADDRESS=${old.AetherisAccountFactory}
PAYMASTER_ADDRESS=${old.AetherisPaymaster}
AGENT_ALPHA_ADDRESS=${newAgentAlphaAddr}
PROFIT_DISTRIBUTOR_ADDRESS=${newProfitDistributorAddr}`
  );
  console.log(`  deployments/${networkName}.env ✓`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         REDEPLOY COMPLETE ✓                      ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\n  OLD AgentAlpha        : ${old.AgentAlpha}`);
  console.log(`  NEW AgentAlpha        : ${newAgentAlphaAddr}`);
  console.log(`\n  OLD ProfitDistributor : ${old.ProfitDistributor}`);
  console.log(`  NEW ProfitDistributor : ${newProfitDistributorAddr}`);
  console.log(`
━━━ MANUAL STEPS REQUIRED AFTER THIS SCRIPT ━━━━━━━━

  STEP 1 — Update aetheris-frontend/.env.local
    NEXT_PUBLIC_AGENT_ALPHA_ADDRESS=${newAgentAlphaAddr}
    NEXT_PUBLIC_PROFIT_DISTRIBUTOR_ADDRESS=${newProfitDistributorAddr}

  STEP 2 — Update aetheris-backend/.env
    AGENT_ALPHA_ADDRESS=${newAgentAlphaAddr}
    PROFIT_DISTRIBUTOR_ADDRESS=${newProfitDistributorAddr}

  STEP 3 — Verify on Basescan (wait ~30s first)
    npx hardhat run scripts/verifyCore.ts --network ${networkName}

  STEP 4 — Restart services
    cd aetheris-backend  && npm run dev
    cd aetheris-frontend && npm run dev
`);
}

main().catch((err) => {
  console.error("\n✗ Redeploy failed:", err.message);
  process.exit(1);
});