// aetheris-protocol/scripts/deploy.ts
// Run: npx hardhat run scripts/deploy.ts --network baseSepolia

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Base Sepolia known addresses ─────────────────────────────────────────────
const EXTERNAL = {
  baseSepolia: {
    entryPoint:  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // ERC-4337 EntryPoint v0.7
    aavePool:    "0x07eA79F68B2B3df564D0A34F8e19791234D9d12D", // Aave V3 Base Sepolia
    usdc:        "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Circle USDC Base Sepolia
    weth:        "0x4200000000000000000000000000000000000006", // WETH Base Sepolia
    uniswapV2Router: "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602", // Uniswap V2 Base Sepolia
  },
  base: {
    entryPoint:  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    aavePool:    "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", // Aave V3 Base Mainnet
    usdc:        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC Base Mainnet
    weth:        "0x4200000000000000000000000000000000000006",
    uniswapV2Router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  },
};

// ─── Deployment parameters ─────────────────────────────────────────────────────
const PARAMS = {
  weeklyGasBudget: ethers.parseUnits("1000", 6), // $1,000 USDC/week paymaster budget
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name as "baseSepolia" | "base" | "hardhat";

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         AETHERIS PROTOCOL DEPLOYMENT             ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nNetwork   : ${networkName}`);
  console.log(`Deployer  : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance   : ${ethers.formatEther(balance)} ETH`);

  if (balance < ethers.parseEther("0.01")) {
    throw new Error("Insufficient ETH balance. Need at least 0.01 ETH for gas.");
  }

  // ── Resolve external addresses ─────────────────────────────────────────────
  let ext = EXTERNAL.baseSepolia;
  if (networkName === "base") ext = EXTERNAL.base;

  // On local hardhat network, deploy mock external contracts
  let entryPointAddr  = ext.entryPoint;
  let aavePoolAddr    = ext.aavePool;
  let usdcAddr        = ext.usdc;
  let wethAddr        = ext.weth;
  let dexRouterAddr   = ext.uniswapV2Router;

  if (networkName === "hardhat") {
    console.log("\n[Hardhat] Deploying mock external contracts...");

    const MockToken = await ethers.getContractFactory("MockERC20");
    const mockUsdc  = await MockToken.deploy("USD Coin", "USDC", 6);
    const mockWeth  = await MockToken.deploy("Wrapped ETH", "WETH", 18);
    await mockUsdc.waitForDeployment();
    await mockWeth.waitForDeployment();
    usdcAddr = await mockUsdc.getAddress();
    wethAddr = await mockWeth.getAddress();

    const MockAave = await ethers.getContractFactory("MockAavePool");
    const mockAave = await MockAave.deploy();
    await mockAave.waitForDeployment();
    aavePoolAddr = await mockAave.getAddress();

    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    const ep = await EntryPoint.deploy();
    await ep.waitForDeployment();
    entryPointAddr = await ep.getAddress();

    // Use deployer as dex router placeholder on hardhat
    dexRouterAddr = deployer.address;

    console.log(`  MockUSDC    : ${usdcAddr}`);
    console.log(`  MockWETH    : ${wethAddr}`);
    console.log(`  MockAave    : ${aavePoolAddr}`);
    console.log(`  EntryPoint  : ${entryPointAddr}`);
  }

  console.log("\n━━━ External Addresses ━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  EntryPoint  : ${entryPointAddr}`);
  console.log(`  Aave Pool   : ${aavePoolAddr}`);
  console.log(`  USDC        : ${usdcAddr}`);
  console.log(`  WETH        : ${wethAddr}`);
  console.log(`  DEX Router  : ${dexRouterAddr}`);

  // ══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT ORDER:
  //  1. AetherisToken  (AX)
  //  2. AetherisStaking (AX + USDC)
  //  3. AetherisAccountFactory (EntryPoint)
  //  4. AetherisPaymaster (EntryPoint + USDC + WETH + Staking + DEX + budget)
  //  5. AgentAlpha (Aave + executor + guardian + governance)
  //  6. ProfitDistributor (USDC + AgentAlpha + guardian + governance)
  //  7. Wire: AgentAlpha.setProfitDistributor(ProfitDistributor)
  // ══════════════════════════════════════════════════════════════════════════

  // ── 1. AetherisToken ──────────────────────────────────────────────────────
  console.log("\n━━━ Deploying Contracts ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.stdout.write("  [1/6] AetherisToken...");
  const AetherisToken = await ethers.getContractFactory("AetherisToken");
  const axToken = await AetherisToken.deploy();
  await axToken.waitForDeployment();
  const axAddr = await axToken.getAddress();
  console.log(` ✓  ${axAddr}`);

  // ── 2. AetherisStaking ────────────────────────────────────────────────────
  process.stdout.write("  [2/6] AetherisStaking...");
  const AetherisStaking = await ethers.getContractFactory("AetherisStaking");
  const staking = await AetherisStaking.deploy(axAddr, usdcAddr);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log(` ✓  ${stakingAddr}`);

  // ── 3. AetherisAccountFactory ─────────────────────────────────────────────
  process.stdout.write("  [3/6] AetherisAccountFactory...");
  const Factory = await ethers.getContractFactory("AetherisAccountFactory");
  const factory = await Factory.deploy(entryPointAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log(` ✓  ${factoryAddr}`);

  // ── 4. AetherisPaymaster ──────────────────────────────────────────────────
  process.stdout.write("  [4/6] AetherisPaymaster...");
  const Paymaster = await ethers.getContractFactory("AetherisPaymaster");
  const paymaster = await Paymaster.deploy(
    entryPointAddr,
    usdcAddr,
    wethAddr,
    stakingAddr,
    dexRouterAddr,
    PARAMS.weeklyGasBudget,
  );
  await paymaster.waitForDeployment();
  const paymasterAddr = await paymaster.getAddress();
  console.log(` ✓  ${paymasterAddr}`);

  // ── 5. AgentAlpha ─────────────────────────────────────────────────────────
  process.stdout.write("  [5/6] AgentAlpha...");
  const AgentAlpha = await ethers.getContractFactory("AgentAlpha");
  const agentAlpha = await AgentAlpha.deploy(
    aavePoolAddr,
    deployer.address,  // executor  — update post-deploy if using separate key
    deployer.address,  // guardian  — update post-deploy
    deployer.address,  // governance — update post-deploy
  );
  await agentAlpha.waitForDeployment();
  const agentAlphaAddr = await agentAlpha.getAddress();
  console.log(` ✓  ${agentAlphaAddr}`);

  // ── 6. ProfitDistributor ──────────────────────────────────────────────────
  process.stdout.write("  [6/6] ProfitDistributor...");
  const ProfitDistributor = await ethers.getContractFactory("ProfitDistributor");
  const profitDistributor = await ProfitDistributor.deploy(
    usdcAddr,
    agentAlphaAddr,
    deployer.address,  // guardian
    deployer.address,  // governance
  );
  await profitDistributor.waitForDeployment();
  const profitDistributorAddr = await profitDistributor.getAddress();
  console.log(` ✓  ${profitDistributorAddr}`);

  // ── 7. Wire: AgentAlpha → ProfitDistributor ───────────────────────────────
  console.log("\n━━━ Wiring Contracts ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  process.stdout.write("  AgentAlpha.setProfitDistributor...");
  await agentAlpha.setProfitDistributor(profitDistributorAddr);
  console.log(" ✓");

  // ── 8. Stake EntryPoint deposit for Paymaster (optional but recommended) ──
  // Paymaster needs ETH staked in EntryPoint to sponsor UserOps
  // Uncomment and fund if you want gasless txs to work immediately:
  //
  // process.stdout.write("  Funding Paymaster in EntryPoint...");
  // const IEntryPoint = await ethers.getContractAt("IEntryPoint", entryPointAddr);
  // await IEntryPoint.depositTo(paymasterAddr, { value: ethers.parseEther("0.01") });
  // console.log(" ✓");

  // ══════════════════════════════════════════════════════════════════════════
  // SAVE ADDRESSES
  // ══════════════════════════════════════════════════════════════════════════

  const deployment = {
    network: networkName,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      AetherisToken:        axAddr,
      AetherisStaking:      stakingAddr,
      AetherisAccountFactory: factoryAddr,
      AetherisPaymaster:    paymasterAddr,
      AgentAlpha:           agentAlphaAddr,
      ProfitDistributor:    profitDistributorAddr,
    },
    external: {
      entryPoint:  entryPointAddr,
      aavePool:    aavePoolAddr,
      usdc:        usdcAddr,
      weth:        wethAddr,
      dexRouter:   dexRouterAddr,
    },
  };

  // Write to deployments/ folder
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

  const outFile = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  // Also write a .env.addresses file for easy copy-paste into .env files
  const envContent = `
# Auto-generated by deploy.ts on ${new Date().toISOString()}
# Network: ${networkName}

# ── Aetheris Contracts ────────────────────────────────────
NEXT_PUBLIC_AX_TOKEN_ADDRESS=${axAddr}
NEXT_PUBLIC_STAKING_ADDRESS=${stakingAddr}
NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS=${factoryAddr}
NEXT_PUBLIC_PAYMASTER_ADDRESS=${paymasterAddr}
NEXT_PUBLIC_AGENT_ALPHA_ADDRESS=${agentAlphaAddr}
NEXT_PUBLIC_PROFIT_DISTRIBUTOR_ADDRESS=${profitDistributorAddr}

# ── For Backend API (.env in aetheris-backend/) ───────────
AX_TOKEN_ADDRESS=${axAddr}
STAKING_ADDRESS=${stakingAddr}
ACCOUNT_FACTORY_ADDRESS=${factoryAddr}
PAYMASTER_ADDRESS=${paymasterAddr}
AGENT_ALPHA_ADDRESS=${agentAlphaAddr}
PROFIT_DISTRIBUTOR_ADDRESS=${profitDistributorAddr}
`.trim();

  const envFile = path.join(deploymentsDir, `${networkName}.env`);
  fs.writeFileSync(envFile, envContent);

  // ── Print summary ──────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║              DEPLOYMENT COMPLETE                 ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("\n  Contract Addresses:");
  console.log(`    AetherisToken          : ${axAddr}`);
  console.log(`    AetherisStaking        : ${stakingAddr}`);
  console.log(`    AetherisAccountFactory : ${factoryAddr}`);
  console.log(`    AetherisPaymaster      : ${paymasterAddr}`);
  console.log(`    AgentAlpha             : ${agentAlphaAddr}`);
  console.log(`    ProfitDistributor      : ${profitDistributorAddr}`);
  console.log(`\n  Saved to:`);
  console.log(`    ${outFile}`);
  console.log(`    ${envFile}`);
  console.log("\n  Next steps:");
  console.log("    1. Copy deployments/" + networkName + ".env contents into:");
  console.log("         aetheris-frontend/.env.local");
  console.log("         aetheris-backend/.env");
  console.log("    2. Fund Paymaster with ETH via EntryPoint:");
  console.log(`         cast send ${entryPointAddr} "depositTo(address)" ${paymasterAddr} --value 0.01ether`);
  console.log("    3. Whitelist USDC + tokens in AgentAlpha:");
  console.log(`         npx hardhat run scripts/setup.ts --network ${networkName}`);
  if (networkName !== "hardhat") {
    console.log("    4. Verify contracts (once you have a Basescan API key):");
    console.log(`         npx hardhat run scripts/verify.ts --network ${networkName}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error("\n✗ Deployment failed:", err.message);
  process.exit(1);
});