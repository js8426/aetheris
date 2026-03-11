// Aetheris\aetheris-protocol\scripts\clearNonce.ts

import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  const confirmedNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
  
  console.log(`Confirmed nonce: ${confirmedNonce}`);
  console.log(`Pending nonce:   ${pendingNonce}`);

  if (pendingNonce === confirmedNonce) {
    console.log("No stuck transactions. You're clear to deploy.");
    return;
  }

  console.log(`Clearing ${pendingNonce - confirmedNonce} stuck transaction(s)...`);

  for (let nonce = confirmedNonce; nonce < pendingNonce; nonce++) {
    console.log(`  Cancelling nonce ${nonce}...`);
    const tx = await deployer.sendTransaction({
      to: deployer.address,
      value: 0n,
      nonce: nonce,
      gasPrice: ethers.parseUnits("10", "gwei"), // high enough to replace
    });
    await tx.wait();
    console.log(`  ✓ Nonce ${nonce} cleared`);
  }

  console.log("\nAll stuck transactions cleared. Run deploy:testnet now.");
}

main().catch(console.error);