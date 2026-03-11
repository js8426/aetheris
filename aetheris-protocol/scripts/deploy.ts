// aetheris-protocol/scripts/deploy.ts
// Run: npx hardhat run scripts/deploy.ts --network baseSepolia

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const EXTERNAL = {
  baseSepolia: {
    aavePool:        "0x07ea79f68b2b3df564d0a34f8e19791234d9d12d",
    usdc:            "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    weth:            "0x4200000000000000000000000000000000000006",
    uniswapV2Router: "0x1689e7b1f10000ae47ebfe339a4f69decd19f602",
  },
  base: {
    aavePool:        "0xa238dd80c259a72e81d7e4664a9801593f98d1c5",
    usdc:            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    weth:            "0x4200000000000000000000000000000000000006",
    uniswapV2Router: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  },
};

const WEEKLY_GAS_BUDGET = ethers.parseUnits("1000", 6);
const PROGRESS_FILE = path.join(__dirname, "..", "deployments", "progress.json");

function loadProgress(): Record<string, string> {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveProgress(progress: Record<string, string>) {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function deployOrReuse(
  name: string,
  index: string,
  progress: Record<string, string>,
  deployFn: () => Promise<string>
): Promise<string> {
  if (progress[name]) {
    console.log(`  ${index} ${name}... ✓ (resumed)  ${progress[name]}`);
    return progress[name];
  }
  process.stdout.write(`  ${index} ${name}...`);
  const address = await deployFn();
  progress[name] = address;
  saveProgress(progress);
  console.log(` ✓  ${address}`);
  return address;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name as "baseSepolia" | "base";
  const ext = EXTERNAL[networkName] ?? EXTERNAL.baseSepolia;

  // Deploy our own EntryPoint to guarantee interface compatibility
  const progress = loadProgress();
  if (!ext.entryPoint) {
    if (progress["EntryPoint"]) {
      ext.entryPoint = progress["EntryPoint"];
      console.log(`\n  EntryPoint... ✓ (resumed)  ${ext.entryPoint}`);
    } else {
      process.stdout.write("\n  Deploying EntryPoint...");
      const EP = await ethers.getContractFactory("EntryPoint");
      const ep = await EP.deploy();
      await ep.waitForDeployment();
      ext.entryPoint = await ep.getAddress();
      progress["EntryPoint"] = ext.entryPoint;
      saveProgress(progress);
      console.log(` ✓  ${ext.entryPoint}`);
    }
  }

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         AETHERIS PROTOCOL DEPLOYMENT             ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nNetwork   : ${networkName}`);
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Balance   : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("\n━━━ External Addresses ━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  EntryPoint  : ${ext.entryPoint}`);
  console.log(`  Aave Pool   : ${ext.aavePool}`);
  console.log(`  USDC        : ${ext.usdc}`);
  console.log(`  WETH        : ${ext.weth}`);
  console.log(`  DEX Router  : ${ext.uniswapV2Router}`);
  console.log("\n━━━ Deploying Contracts ━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (Object.keys(progress).length > 0) {
    console.log("  (Resuming from previous run...)\n");
  }

  const axAddr = await deployOrReuse("AetherisToken", "[1/6]", progress, async () => {
    const F = await ethers.getContractFactory("AetherisToken");
    const c = await F.deploy();
    await c.waitForDeployment();
    return c.getAddress();
  });

  const stakingAddr = await deployOrReuse("AetherisStaking", "[2/6]", progress, async () => {
    const F = await ethers.getContractFactory("AetherisStaking");
    const c = await F.deploy(axAddr, ext.usdc);
    await c.waitForDeployment();
    return c.getAddress();
  });

  const factoryAddr = await deployOrReuse("AetherisAccountFactory", "[3/6]", progress, async () => {
    const F = await ethers.getContractFactory("AetherisAccountFactory");
    const c = await F.deploy(ext.entryPoint);
    await c.waitForDeployment();
    return c.getAddress();
  });

  const paymasterAddr = await deployOrReuse("AetherisPaymaster", "[4/6]", progress, async () => {
    const F = await ethers.getContractFactory("AetherisPaymaster");
    const c = await F.deploy(
      ext.entryPoint, ext.usdc, ext.weth,
      stakingAddr, ext.uniswapV2Router, WEEKLY_GAS_BUDGET,
    );
    await c.waitForDeployment();
    return c.getAddress();
  });

  const agentAlphaAddr = await deployOrReuse("AgentAlpha", "[5/6]", progress, async () => {
    const F = await ethers.getContractFactory("AgentAlpha");
    const c = await F.deploy(
      ext.aavePool, deployer.address, deployer.address, deployer.address,
    );
    await c.waitForDeployment();
    return c.getAddress();
  });

  const profitDistributorAddr = await deployOrReuse("ProfitDistributor", "[6/6]", progress, async () => {
    const F = await ethers.getContractFactory("ProfitDistributor");
    const c = await F.deploy(
      ext.usdc, agentAlphaAddr, deployer.address, deployer.address,
    );
    await c.waitForDeployment();
    return c.getAddress();
  });

  console.log("\n━━━ Wiring Contracts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (!progress["wired"]) {
    process.stdout.write("  AgentAlpha.setProfitDistributor...");
    const agentAlpha = await ethers.getContractAt("AgentAlpha", agentAlphaAddr);
    const tx = await agentAlpha.setProfitDistributor(profitDistributorAddr);
    await tx.wait();
    progress["wired"] = "true";
    saveProgress(progress);
    console.log(" ✓");
  } else {
    console.log("  AgentAlpha.setProfitDistributor... ✓ (resumed)");
  }

  // Save final deployment files
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

  const deployment = {
    network: networkName,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      AetherisToken:          axAddr,
      AetherisStaking:        stakingAddr,
      AetherisAccountFactory: factoryAddr,
      AetherisPaymaster:      paymasterAddr,
      AgentAlpha:             agentAlphaAddr,
      ProfitDistributor:      profitDistributorAddr,
    },
    external: {
      entryPoint: ext.entryPoint,
      aavePool:   ext.aavePool,
      usdc:       ext.usdc,
      weth:       ext.weth,
      dexRouter:  ext.uniswapV2Router,
    },
  };

  fs.writeFileSync(
    path.join(deploymentsDir, `${networkName}.json`),
    JSON.stringify(deployment, null, 2)
  );

  const envContent = `# Auto-generated by deploy.ts — ${new Date().toISOString()}
# Network: ${networkName}

# ── Frontend (paste into aetheris-frontend/.env.local) ────
NEXT_PUBLIC_AX_TOKEN_ADDRESS=${axAddr}
NEXT_PUBLIC_STAKING_ADDRESS=${stakingAddr}
NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS=${factoryAddr}
NEXT_PUBLIC_PAYMASTER_ADDRESS=${paymasterAddr}
NEXT_PUBLIC_AGENT_ALPHA_ADDRESS=${agentAlphaAddr}
NEXT_PUBLIC_PROFIT_DISTRIBUTOR_ADDRESS=${profitDistributorAddr}

# ── Backend (paste into aetheris-backend/.env) ─────────────
AX_TOKEN_ADDRESS=${axAddr}
STAKING_ADDRESS=${stakingAddr}
ACCOUNT_FACTORY_ADDRESS=${factoryAddr}
PAYMASTER_ADDRESS=${paymasterAddr}
AGENT_ALPHA_ADDRESS=${agentAlphaAddr}
PROFIT_DISTRIBUTOR_ADDRESS=${profitDistributorAddr}`;

  fs.writeFileSync(path.join(deploymentsDir, `${networkName}.env`), envContent);

  // Clear progress file on full success
  if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║            DEPLOYMENT COMPLETE ✓                 ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\n  AetherisToken          : ${axAddr}`);
  console.log(`  AetherisStaking        : ${stakingAddr}`);
  console.log(`  AetherisAccountFactory : ${factoryAddr}`);
  console.log(`  AetherisPaymaster      : ${paymasterAddr}`);
  console.log(`  AgentAlpha             : ${agentAlphaAddr}`);
  console.log(`  ProfitDistributor      : ${profitDistributorAddr}`);
  console.log(`\n  Addresses saved to: deployments/${networkName}.env`);
  console.log("\n  Next step:");
  console.log(`  npx hardhat run scripts/setup.ts --network ${networkName}\n`);
}

main().catch((err) => {
  console.error("\n✗ Deployment failed:", err.message);
  console.error("  Run again — it will resume from where it stopped.");
  process.exit(1);
});