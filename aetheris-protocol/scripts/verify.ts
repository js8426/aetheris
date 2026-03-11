// aetheris-protocol/scripts/verify.ts
// Run AFTER you add BASESCAN_API_KEY to your .env
// Run: npx hardhat run scripts/verify.ts --network baseSepolia

import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function verify(address: string, constructorArgs: any[], contractName?: string) {
  const label = contractName ?? address;
  process.stdout.write(`  Verifying ${label}...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(" ✓");
  } catch (err: any) {
    if (err.message.includes("Already Verified") || err.message.includes("already verified")) {
      console.log(" already verified ✓");
    } else {
      console.log(` ✗  ${err.message}`);
    }
  }
}

async function main() {
  const networkName = network.name;

  const deploymentsFile = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  if (!fs.existsSync(deploymentsFile)) {
    throw new Error(`No deployment found for ${networkName}. Run deploy.ts first.`);
  }

  const d = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const c = d.contracts;
  const e = d.external;

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         AETHERIS CONTRACT VERIFICATION           ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nNetwork: ${networkName}\n`);

  // Each contract verified with exact constructor args used during deployment
  await verify(c.AetherisToken,          [],                                        "AetherisToken");
  await verify(c.AetherisStaking,        [c.AetherisToken, e.usdc],                 "AetherisStaking");
  await verify(c.AetherisAccountFactory, [e.entryPoint],                            "AetherisAccountFactory");
  await verify(c.AetherisPaymaster,      [e.entryPoint, e.usdc, e.weth,
                                          c.AetherisStaking, e.dexRouter,
                                          (1000 * 1e6).toString()],                 "AetherisPaymaster");
  await verify(c.AgentAlpha,             [e.aavePool, d.deployer,
                                          d.deployer, d.deployer],                  "AgentAlpha");
  await verify(c.ProfitDistributor,      [e.usdc, c.AgentAlpha,
                                          d.deployer, d.deployer],                  "ProfitDistributor");

  console.log("\n━━━ Verification Complete ━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  View on Basescan: https://sepolia.basescan.org/address/${c.AetherisToken}`);
  console.log("");
}

main().catch((err) => {
  console.error("\n✗ Verification failed:", err.message);
  process.exit(1);
});