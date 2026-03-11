// Aetheris\aetheris-protocol\test\helpers\setup.ts

import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ─── Mock ERC-20 (reusable for AX token + USDC) ───────────────────────────────
export async function deployMockERC20(name: string, symbol: string, decimals = 18) {
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy(name, symbol, decimals);
  await token.waitForDeployment();
  return token;
}

// ─── Mint helpers ─────────────────────────────────────────────────────────────
export async function mintTokens(
  token: any,
  to: string,
  amount: bigint
) {
  await token.mint(to, amount);
}

// ─── Common amounts ───────────────────────────────────────────────────────────
export const AMOUNTS = {
  // AX token (18 decimals)
  AX_1K:   ethers.parseUnits("1000",       18),
  AX_10K:  ethers.parseUnits("10000",      18),
  AX_100K: ethers.parseUnits("100000",     18),
  AX_1M:   ethers.parseUnits("1000000",    18),
  AX_2M:   ethers.parseUnits("2000000",    18),
  // USDC (6 decimals)
  USDC_10:   ethers.parseUnits("10",   6),
  USDC_100:  ethers.parseUnits("100",  6),
  USDC_500:  ethers.parseUnits("500",  6),
  USDC_1K:   ethers.parseUnits("1000", 6),
  USDC_10K:  ethers.parseUnits("10000",6),
};

// ─── Staking fixture ──────────────────────────────────────────────────────────
export async function deployStakingFixture() {
  const [owner, alice, bob, charlie, treasury] =
    await ethers.getSigners();

  const axToken  = await deployMockERC20("Aetheris Token", "AX",   18);
  const usdc     = await deployMockERC20("USD Coin",       "USDC",  6);

  const Staking  = await ethers.getContractFactory("AetherisStaking");
  const staking  = await Staking.deploy(
    await axToken.getAddress(),
    await usdc.getAddress()
  );
  await staking.waitForDeployment();

  // Fund users with AX
  for (const user of [alice, bob, charlie]) {
    await mintTokens(axToken, user.address, AMOUNTS.AX_2M);
    await axToken.connect(user).approve(
      await staking.getAddress(), ethers.MaxUint256
    );
  }

  // Fund staking contract with USDC for rewards
  await mintTokens(usdc, owner.address, AMOUNTS.USDC_10K);
  await usdc.approve(await staking.getAddress(), ethers.MaxUint256);

  return { staking, axToken, usdc, owner, alice, bob, charlie, treasury };
}

// ─── ProfitDistributor fixture ────────────────────────────────────────────────
export async function deployProfitDistributorFixture() {
  const [governance, guardian, agentAlpha, alice, bob, charlie] =
    await ethers.getSigners();

  const usdc = await deployMockERC20("USD Coin", "USDC", 6);

  const PD = await ethers.getContractFactory("ProfitDistributor");
  const distributor = await PD.deploy(
    await usdc.getAddress(),
    agentAlpha.address,
    guardian.address,
    governance.address
  );
  await distributor.waitForDeployment();

  const AGENT_ROLE = await distributor.AGENT_ROLE();

  // Fund users with USDC
  for (const user of [alice, bob, charlie]) {
    await mintTokens(usdc, user.address, AMOUNTS.USDC_10K);
    await usdc.connect(user).approve(
      await distributor.getAddress(), ethers.MaxUint256
    );
  }

  // Fund agentAlpha signer with USDC to simulate profit injection
  await mintTokens(usdc, agentAlpha.address, AMOUNTS.USDC_10K);
  await usdc.connect(agentAlpha).approve(
    await distributor.getAddress(), ethers.MaxUint256
  );

  return {
    distributor, usdc,
    governance, guardian, agentAlpha,
    alice, bob, charlie,
    AGENT_ROLE,
  };
}

// ─── AetherisAccount fixture ──────────────────────────────────────────────────
export async function deployAccountFixture() {
  const [owner, alice, guardian1, guardian2] = await ethers.getSigners();

  const EntryPoint = await ethers.getContractFactory("EntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();

  const Factory = await ethers.getContractFactory("AetherisAccountFactory");
  const factory = await Factory.deploy(await entryPoint.getAddress());
  await factory.waitForDeployment();

  // ✅ FIX: correct method name is getAccountAddress
  await factory.createAccount(owner.address, 0n);
  const accountAddress = await factory.getAccountAddress(owner.address, 0n);
  const account = await ethers.getContractAt("AetherisAccount", accountAddress);

  // Pre-deploy salt=1 for the "different salt" test
  await factory.createAccount(owner.address, 1n);
  const accountAddress2 = await factory.getAccountAddress(owner.address, 1n);

  return { account, accountAddress2, factory, entryPoint, owner, alice, guardian1, guardian2 };
}