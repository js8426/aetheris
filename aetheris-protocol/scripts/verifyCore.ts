// Aetheris\aetheris-protocol\scripts\verifyCore.ts

// aetheris-protocol/scripts/verifyCore.ts
//
// Verifies ONLY the newly redeployed AgentAlpha and ProfitDistributor.
// Reads addresses and constructor args directly from deployments/<network>.json
// so there is no risk of passing wrong args manually.
//
// Prerequisites:
//   - BASESCAN_API_KEY set in your .env
//   - redeployCore.ts has already run successfully
//   - Wait ~30 seconds after deployment before running this
//     (Basescan needs time to index the bytecode)
//
// Run:
//   npx hardhat run scripts/verifyCore.ts --network baseSepolia

import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function verify(
  label: string,
  address: string,
  constructorArgs: unknown[]
): Promise<void> {
  process.stdout.write(`  Verifying ${label} (${address})...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(" ✓");
  } catch (err: any) {
    if (
      err.message.toLowerCase().includes("already verified") ||
      err.message.toLowerCase().includes("already been verified")
    ) {
      console.log(" already verified ✓");
    } else {
      // Print the error but do not throw — let the script continue
      // so the second contract still gets a verification attempt.
      console.log(` ✗\n    ${err.message}`);
    }
  }
}

async function main() {
  const networkName = network.name;

  const deploymentsFile = path.join(
    __dirname, "..", "deployments", `${networkName}.json`
  );

  if (!fs.existsSync(deploymentsFile)) {
    throw new Error(
      `No deployment file found at ${deploymentsFile}.\n` +
      `Run redeployCore.ts first.`
    );
  }

  const d = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const c = d.contracts;
  const e = d.external;

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     AETHERIS — VERIFY AgentAlpha +               ║");
  console.log("║               ProfitDistributor                  ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nNetwork: ${networkName}\n`);

  // AgentAlpha constructor:
  //   (address aavePool, address executor, address guardian, address governance)
  //
  // All three role addresses were set to deployer.address in redeployCore.ts,
  // matching the original deploy.ts behaviour.
  await verify("AgentAlpha", c.AgentAlpha, [
    e.aavePool,
    d.deployer,
    d.deployer,
    d.deployer,
  ]);

  // ProfitDistributor constructor:
  //   (address _depositToken, address agentAlpha, address guardian, address governance)
  await verify("ProfitDistributor", c.ProfitDistributor, [
    e.usdc,
    c.AgentAlpha,  // the NEW AgentAlpha address
    d.deployer,
    d.deployer,
  ]);

  const scanBase =
    networkName === "base"
      ? "https://basescan.org"
      : "https://sepolia.basescan.org";

  console.log("\n━━━ Verification complete ━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  AgentAlpha        : ${scanBase}/address/${c.AgentAlpha}#code`);
  console.log(`  ProfitDistributor : ${scanBase}/address/${c.ProfitDistributor}#code`);
  console.log("");
}

main().catch((err) => {
  console.error("\n✗ Verification failed:", err.message);
  process.exit(1);
});