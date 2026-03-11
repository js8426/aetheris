// Aetheris\aetheris-protocol\scripts\deployAA.ts

import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  console.log("Deploying ERC-4337 Infrastructure...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // EntryPoint (already deployed on all chains)
  const entryPoint = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  console.log("EntryPoint:", entryPoint);

  // 1. Deploy Account Implementation
  console.log("\n1. Deploying AetherisAccount Implementation...");
  const Account = await ethers.getContractFactory("AetherisAccount");
  const accountImpl = await Account.deploy(entryPoint);
  await accountImpl.waitForDeployment();
  const accountAddr = await accountImpl.getAddress();
  console.log("✓ AetherisAccount:", accountAddr);

  // 2. Deploy Factory
  console.log("\n2. Deploying AetherisAccountFactory...");
  const Factory = await ethers.getContractFactory("AetherisAccountFactory");
  const factory = await Factory.deploy(entryPoint);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("✓ Factory:", factoryAddr);

  // 3. Deploy Paymaster
  console.log("\n3. Deploying AetherisPaymaster...");
  
  // Configuration (Base Sepolia testnet)
  const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
  const weth = "0x4200000000000000000000000000000000000006"; // Base WETH
  
  // Read Priority 1 deployments
  let staking = process.env.STAKING_ADDRESS;
  if (!staking) {
    try {
      const deployments = JSON.parse(fs.readFileSync("deployments.json", "utf8"));
      staking = deployments.staking;
    } catch {
      console.error("❌ Staking address not found. Please set STAKING_ADDRESS env var or run Priority 1 deployment first.");
      process.exit(1);
    }
  }
  
  const dexRouter = "0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb"; // Base Sepolia Uniswap V2
  const weeklyBudget = ethers.parseEther("1"); // 1 ETH/week

  const Paymaster = await ethers.getContractFactory("AetherisPaymaster");
  const paymaster = await Paymaster.deploy(
    entryPoint,
    usdc,
    weth,
    staking,
    dexRouter,
    weeklyBudget
  );
  await paymaster.waitForDeployment();
  const paymasterAddr = await paymaster.getAddress();
  console.log("✓ Paymaster:", paymasterAddr);

  // 4. Fund Paymaster
  console.log("\n4. Funding Paymaster...");
  const fundTx = await paymaster.refillGasTank({ value: ethers.parseEther("0.05") });
  await fundTx.wait();
  console.log("✓ Funded with 0.05 ETH");

  // Save addresses
  const deploymentData = {
    network: "baseSepolia",
    chainId: 84532,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      entryPoint,
      accountImplementation: accountAddr,
      factory: factoryAddr,
      paymaster: paymasterAddr,
    },
    config: {
      usdc,
      weth,
      staking,
      dexRouter,
      weeklyBudget: ethers.formatEther(weeklyBudget),
    },
  };

  fs.writeFileSync(
    "deployments-aa.json",
    JSON.stringify(deploymentData, null, 2)
  );

  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Account Implementation:", accountAddr);
  console.log("Factory:               ", factoryAddr);
  console.log("Paymaster:             ", paymasterAddr);
  console.log("=".repeat(60));

  console.log("\n✅ All ERC-4337 contracts deployed!");
  console.log("📄 Addresses saved to deployments-aa.json");
  
  console.log("\n📋 NEXT STEPS:");
  console.log("1. Verify contracts on BaseScan");
  console.log("2. Configure bundler with Paymaster address");
  console.log("3. Start bundler service: cd bundler && npm start");
  console.log("4. Test with a UserOperation");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });