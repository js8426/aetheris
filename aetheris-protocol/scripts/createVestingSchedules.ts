// Aetheris\aetheris-protocol\scripts\createVestingSchedules.ts

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface VestingScheduleData {
  beneficiary: string;
  amount: string; // in $AX (will be converted to wei)
  cliff: number; // in months
  duration: number; // in months
  revocable: boolean;
}

interface DeploymentAddresses {
  token: string;
  vesting: string;
}

async function main() {
  console.log("Creating Vesting Schedules...\n");

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

  // Get contracts
  const token = await ethers.getContractAt("AetherisToken", addresses.token);
  const vesting = await ethers.getContractAt("AetherisVesting", addresses.vesting);

  const [deployer] = await ethers.getSigners();

  console.log("Using accounts:");
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Token: ${addresses.token}`);
  console.log(`  Vesting: ${addresses.vesting}\n`);

  // Define vesting schedules
  // In production, read from CSV file
  const schedules: VestingScheduleData[] = [
    // Team (15% = 150M $AX)
    // 12-month cliff + 36-month linear = 48 months total
    {
      beneficiary: "0x1234567890123456789012345678901234567890", // Replace with actual address
      amount: "45000000", // CEO: 45M $AX
      cliff: 12,
      duration: 48,
      revocable: false
    },
    {
      beneficiary: "0x2234567890123456789012345678901234567890", // Replace with actual address
      amount: "30000000", // CTO: 30M $AX
      cliff: 12,
      duration: 48,
      revocable: false
    },
    // Add more team members...

    // Advisors (5% = 50M $AX)
    // 6-month cliff + 18-month linear = 24 months total
    {
      beneficiary: "0x3234567890123456789012345678901234567890", // Replace with actual address
      amount: "10000000", // Advisor 1: 10M $AX
      cliff: 6,
      duration: 24,
      revocable: true
    },
    // Add more advisors...

    // Private investors (10% = 100M $AX)
    // 3-month cliff + 15-month linear = 18 months total
    {
      beneficiary: "0x4234567890123456789012345678901234567890", // Replace with actual address
      amount: "5000000", // Investor: 5M $AX
      cliff: 3,
      duration: 18,
      revocable: false
    },
    // Add more investors...
  ];

  // Calculate total amount needed
  const totalAmount = schedules.reduce(
    (sum, schedule) => sum + BigInt(schedule.amount),
    0n
  ) * ethers.parseEther("1");

  console.log(`Total tokens needed: ${ethers.formatEther(totalAmount)} $AX\n`);

  // Check deployer balance
  const balance = await token.balanceOf(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} $AX`);

  if (balance < totalAmount) {
    console.error(`❌ Insufficient balance! Need ${ethers.formatEther(totalAmount)} $AX`);
    process.exit(1);
  }

  // Approve vesting contract to spend tokens
  console.log("\nApproving vesting contract...");
  const approveTx = await token.approve(addresses.vesting, totalAmount);
  await approveTx.wait();
  console.log("✓ Approved\n");

  // Create vesting schedules
  console.log("Creating vesting schedules:\n");

  for (const schedule of schedules) {
    try {
      console.log(`Creating schedule for ${schedule.beneficiary}:`);
      console.log(`  Amount: ${schedule.amount} $AX`);
      console.log(`  Cliff: ${schedule.cliff} months`);
      console.log(`  Duration: ${schedule.duration} months`);
      console.log(`  Revocable: ${schedule.revocable}`);

      const amount = ethers.parseEther(schedule.amount);
      const startTime = Math.floor(Date.now() / 1000);
      const cliffDuration = schedule.cliff * 30 * 24 * 60 * 60; // months to seconds
      const totalDuration = schedule.duration * 30 * 24 * 60 * 60;

      const tx = await vesting.createVestingSchedule(
        schedule.beneficiary,
        startTime,
        cliffDuration,
        totalDuration,
        amount,
        schedule.revocable
      );

      await tx.wait();
      console.log("  ✓ Schedule created\n");

    } catch (error: any) {
      console.error(`  ✗ Failed to create schedule: ${error.message}\n`);
    }
  }

  console.log("✅ All vesting schedules created successfully!");

  // Print summary
  console.log("\n=== SUMMARY ===");
  console.log(`Total schedules created: ${schedules.length}`);
  console.log(`Total tokens allocated: ${ethers.formatEther(totalAmount)} $AX`);
  console.log("\nNext steps:");
  console.log("1. Verify schedules on-chain");
  console.log("2. Notify beneficiaries");
  console.log("3. Update documentation with schedule details");
}

// Helper function to read CSV (optional)
function readSchedulesFromCSV(filepath: string): VestingScheduleData[] {
  // Implementation for reading CSV file
  // Example CSV format:
  // beneficiary,amount,cliff,duration,revocable
  // 0x123...,45000000,12,48,false
  
  const schedules: VestingScheduleData[] = [];
  
  // Add CSV parsing logic here
  // You can use a library like 'csv-parse' or 'papaparse'
  
  return schedules;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });