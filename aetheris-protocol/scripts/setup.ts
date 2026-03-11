// aetheris-protocol/scripts/setup.ts
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEX_WHITELIST: Record<string, { name: string; address: string; dexType: number }[]> = {
  baseSepolia: [
    { name: "Uniswap V3",  address: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", dexType: 0 },
    { name: "Aerodrome",   address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", dexType: 1 },
  ],
  base: [
    { name: "Uniswap V3",  address: "0x2626664c2603336E57B271c5C0b26F421741e481", dexType: 0 },
    { name: "Aerodrome",   address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", dexType: 1 },
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

async function getGasPrice(): Promise<bigint> {
  const feeData = await ethers.provider.getFeeData();
  const base = feeData.gasPrice ?? ethers.parseUnits("1", "gwei");
  return (base * 130n) / 100n; // +30% buffer
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  const deploymentsFile = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  if (!fs.existsSync(deploymentsFile)) {
    throw new Error(`No deployment found for ${networkName}. Run deploy.ts first.`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const { AgentAlpha: agentAlphaAddr, AetherisPaymaster: paymasterAddr } = deployment.contracts;
  const entryPointAddr = deployment.contracts.EntryPoint ?? deployment.external?.entryPoint;

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         AETHERIS POST-DEPLOY SETUP               ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nNetwork    : ${networkName}`);
  console.log(`Deployer   : ${deployer.address}`);
  console.log(`AgentAlpha : ${agentAlphaAddr}`);

  const agentAlpha = await ethers.getContractAt("AgentAlpha", agentAlphaAddr);

  // ── Whitelist tokens ───────────────────────────────────────────────────
  console.log("\n━━━ Whitelisting Tokens ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const tokens = TOKEN_WHITELIST[networkName] ?? TOKEN_WHITELIST.baseSepolia;

  for (const token of tokens) {
    process.stdout.write(`  ${token.name} (${token.address})...`);
    try {
      const already = await agentAlpha.whitelistedTokens(token.address);
      if (already) { console.log(" already whitelisted ✓"); continue; }
      const gp = await getGasPrice();
      const tx = await agentAlpha.whitelistToken(token.address, true, { gasPrice: gp });
      await tx.wait();
      console.log(" ✓");
    } catch (err: any) {
      console.log(` ✗  ${err.message}`);
    }
  }

  // ── Whitelist DEXes ────────────────────────────────────────────────────
  console.log("\n━━━ Whitelisting DEXes ━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const dexes = DEX_WHITELIST[networkName] ?? DEX_WHITELIST.baseSepolia;

  for (const dex of dexes) {
    process.stdout.write(`  ${dex.name} (${dex.address})...`);
    try {
      const already = await agentAlpha.whitelistedDexes(dex.address);
      if (already) { console.log(" already whitelisted ✓"); continue; }
      const gp = await getGasPrice();
      const tx = await agentAlpha.whitelistDex(dex.address, dex.dexType, true, { gasPrice: gp });
      await tx.wait();
      console.log(" ✓");
    } catch (err: any) {
      console.log(` ✗  ${err.message}`);
    }
  }

  // ── Fund Paymaster in EntryPoint ───────────────────────────────────────
  console.log("\n━━━ Paymaster EntryPoint Deposit ━━━━━━━━━━━━━━━━━━");
  const entryPoint = await ethers.getContractAt(
    ["function depositTo(address account) payable",
     "function balanceOf(address account) view returns (uint256)"],
    entryPointAddr
  );

  const currentDeposit = await entryPoint.balanceOf(paymasterAddr);
  console.log(`  Current deposit : ${ethers.formatEther(currentDeposit)} ETH`);

  if (currentDeposit < ethers.parseEther("0.005")) {
    process.stdout.write(`  Depositing 0.01 ETH...`);
    try {
      const gp = await getGasPrice();
      const tx = await entryPoint.depositTo(paymasterAddr, {
        value: ethers.parseEther("0.01"),
        gasPrice: gp,
      });
      await tx.wait();
      console.log(" ✓");
    } catch (err: any) {
      console.log(` ✗  ${err.message}`);
    }
  } else {
    console.log("  Deposit sufficient ✓");
  }

  console.log("\n━━━ Setup Complete ✓ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log("  Next step: copy deployments/baseSepolia.env into");
  console.log("    aetheris-frontend/.env.local");
  console.log("    aetheris-backend/.env\n");
}

main().catch((err) => {
  console.error("\n✗ Setup failed:", err.message);
  process.exit(1);
});