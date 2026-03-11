// Aetheris\aetheris-protocol\scripts\allocateTokens.ts

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface DeploymentAddresses {
  token: string;
  vesting: string;
  staking: string;
  timelock: string;
  governance: string;
}

interface TokenAllocation {
  recipient: string;
  amount: string;
  purpose: string;
}

async function main() {
  console.log("Allocating Tokens According to Tokenomics...\n");

  // Read deployment addresses
  const deploymentPath = path.join(__dirname, "..", "deployments.json");
  
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ deployments.json not found!");
    console.error("   Please run deploy.ts first.");
    process.exit(1);
  }

  const addresses: DeploymentAddresses = JSON.parse(
    fs.readFileSync(deploymentPath, "utf8")
  );

  const token = await ethers.getContractAt("AetherisToken", addresses.token);
  const [deployer] = await ethers.getSigners();

  console.log("Using accounts:");
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Total Supply: 1,000,000,000 $AX\n`);

  // Token allocation according to tokenomics
  // Total: 1,000,000,000 $AX
  const allocations: TokenAllocation[] = [
    // PUBLIC SALE (30% = 300M) - Keep with deployer for now, will be distributed during IDO
    {
      recipient: deployer.address,
      amount: "300000000",
      purpose: "Public Sale (Seed + Private + IDO) - To be distributed"
    },

    // COMMUNITY INCENTIVES (25% = 250M)
    {
      recipient: addresses.staking, // For liquidity mining rewards
      amount: "100000000",
      purpose: "Liquidity Mining Rewards"
    },
    {
      recipient: addresses.staking, // For staking rewards
      amount: "80000000",
      purpose: "Staking Rewards"
    },
    {
      recipient: deployer.address, // For airdrops (manual distribution)
      amount: "40000000",
      purpose: "Airdrops - To be distributed manually"
    },
    {
      recipient: addresses.governance, // Community treasury
      amount: "30000000",
      purpose: "Community Treasury (Governance controlled)"
    },

    // TEAM & ADVISORS (20% = 200M)
    {
      recipient: addresses.vesting, // Will create vesting schedules separately
      amount: "200000000",
      purpose: "Team & Advisors (Vesting contracts)"
    },

    // DEVELOPMENT FUND (15% = 150M)
    {
      recipient: addresses.timelock, // Controlled by governance
      amount: "80000000",
      purpose: "Protocol Development"
    },
    {
      recipient: addresses.timelock,
      amount: "30000000",
      purpose: "Security Audits"
    },
    {
      recipient: addresses.timelock,
      amount: "25000000",
      purpose: "Marketing"
    },
    {
      recipient: addresses.timelock,
      amount: "15000000",
      purpose: "Partnerships"
    },

    // LIQUIDITY & MARKET MAKING (10% = 100M)
    {
      recipient: deployer.address, // For DEX liquidity
      amount: "70000000",
      purpose: "DEX Liquidity (Uniswap, Aerodrome)"
    },
    {
      recipient: deployer.address, // For CEX market making
      amount: "30000000",
      purpose: "CEX Market Making"
    },
  ];

  // Verify total allocation = 1B
  const totalAllocation = allocations.reduce(
    (sum, alloc) => sum + BigInt(alloc.amount),
    0n
  );
  
  const expectedTotal = 1000000000n;
  if (totalAllocation !== expectedTotal) {
    console.error(`❌ Total allocation mismatch!`);
    console.error(`   Expected: ${expectedTotal} $AX`);
    console.error(`   Actual: ${totalAllocation} $AX`);
    process.exit(1);
  }

  console.log("✓ Total allocation verified: 1,000,000,000 $AX\n");

  // Check deployer has full supply
  const balance = await token.balanceOf(deployer.address);
  const expectedBalance = ethers.parseEther("1000000000");
  
  if (balance < expectedBalance) {
    console.error(`❌ Deployer doesn't have full supply!`);
    console.error(`   Expected: ${ethers.formatEther(expectedBalance)} $AX`);
    console.error(`   Actual: ${ethers.formatEther(balance)} $AX`);
    process.exit(1);
  }

  console.log("Starting token allocation:\n");

  // Track total distributed
  let totalDistributed = 0n;

  for (const allocation of allocations) {
    // Skip if sending to deployer (already has tokens)
    if (allocation.recipient === deployer.address) {
      console.log(`⏭ Skipping: ${allocation.purpose}`);
      console.log(`   (${allocation.amount} $AX remains with deployer)\n`);
      continue;
    }

    try {
      console.log(`Transferring: ${allocation.purpose}`);
      console.log(`  Recipient: ${allocation.recipient}`);
      console.log(`  Amount: ${allocation.amount} $AX`);

      const amount = ethers.parseEther(allocation.amount);

      const tx = await token.transfer(allocation.recipient, amount);
      await tx.wait();

      totalDistributed += BigInt(allocation.amount);

      const recipientBalance = await token.balanceOf(allocation.recipient);
      console.log(`  ✓ Transferred (Balance: ${ethers.formatEther(recipientBalance)} $AX)\n`);

    } catch (error: any) {
      console.error(`  ✗ Transfer failed: ${error.message}\n`);
    }
  }

  console.log("=== ALLOCATION COMPLETE ===\n");

  // Print final balances
  console.log("Final Token Distribution:");
  
  const contracts = [
    { name: "Staking Contract", address: addresses.staking },
    { name: "Vesting Contract", address: addresses.vesting },
    { name: "Timelock (Treasury)", address: addresses.timelock },
    { name: "Governance", address: addresses.governance },
    { name: "Deployer", address: deployer.address },
  ];

  for (const contract of contracts) {
    const balance = await token.balanceOf(contract.address);
    console.log(`  ${contract.name}: ${ethers.formatEther(balance)} $AX`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total distributed: ${totalDistributed} $AX`);
  console.log(`Remaining with deployer: ${1000000000n - totalDistributed} $AX`);
  
  console.log("\nNext Steps:");
  console.log("1. ✓ Create vesting schedules (run createVestingSchedules.ts)");
  console.log("2. ✓ Provide liquidity on DEXs (Uniswap, Aerodrome)");
  console.log("3. ✓ Setup CEX market making agreements");
  console.log("4. ✓ Plan airdrop campaigns");
  console.log("5. ✓ Begin liquidity mining program");
  
  // Save allocation report
  const report = {
    timestamp: new Date().toISOString(),
    totalSupply: "1000000000",
    totalDistributed: totalDistributed.toString(),
    allocations: allocations.map(a => ({
      recipient: a.recipient,
      amount: a.amount,
      purpose: a.purpose
    })),
    finalBalances: await Promise.all(
      contracts.map(async c => ({
        name: c.name,
        address: c.address,
        balance: ethers.formatEther(await token.balanceOf(c.address))
      }))
    )
  };

  const reportPath = path.join(__dirname, "..", "allocation-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Allocation report saved to: ${reportPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });