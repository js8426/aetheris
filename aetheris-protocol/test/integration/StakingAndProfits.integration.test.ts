// Aetheris\aetheris-protocol\test\integration\StakingAndProfits.integration.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployMockERC20, AMOUNTS } from "../helpers/setup";

/**
 * Integration tests — simulate a full user journey end-to-end:
 * Deploy → Stake → Deposit → Earn Profits → Claim → Withdraw
 */
describe("Integration: Full User Journey", () => {

  async function deployFullProtocol() {
    const [governance, guardian, agentAlphaExecutor, alice, bob, charlie] =
      await ethers.getSigners();

    const axToken = await deployMockERC20("Aetheris Token", "AX",   18);
    const usdc    = await deployMockERC20("USD Coin",       "USDC",  6);

    // Deploy Staking
    const Staking = await ethers.getContractFactory("AetherisStaking");
    const staking = await Staking.deploy(
      await axToken.getAddress(),
      await usdc.getAddress()
    );

    // Deploy ProfitDistributor
    const PD = await ethers.getContractFactory("ProfitDistributor");
    const distributor = await PD.deploy(
      await usdc.getAddress(),
      agentAlphaExecutor.address,
      guardian.address,
      governance.address
    );

    // Fund all users
    for (const user of [alice, bob, charlie]) {
      await axToken.mint(user.address, AMOUNTS.AX_2M);
      await usdc.mint(user.address,    AMOUNTS.USDC_10K);

      await axToken.connect(user).approve(await staking.getAddress(),     ethers.MaxUint256);
      await usdc.connect(user).approve(  await distributor.getAddress(),  ethers.MaxUint256);
    }

    // Fund agentAlpha executor with USDC (simulates arbitrage profits)
    await usdc.mint(agentAlphaExecutor.address, AMOUNTS.USDC_10K);
    await usdc.connect(agentAlphaExecutor).approve(
      await distributor.getAddress(), ethers.MaxUint256
    );

    return {
      staking, distributor, axToken, usdc,
      governance, guardian, agentAlphaExecutor,
      alice, bob, charlie,
    };
  }

  // ── Scenario 1: Single user full lifecycle ──────────────────────────────────
  it("Scenario 1 — Single user: stake → deposit → earn → claim → withdraw", async () => {
    const { staking, distributor, usdc, agentAlphaExecutor, alice } =
      await loadFixture(deployFullProtocol);

    // 1. Alice stakes AX to reach Silver tier (25% discount)
    await staking.connect(alice).stake(AMOUNTS.AX_10K);
    expect(await staking.getTier(alice.address)).to.equal("Silver");
    expect(await staking.getDiscount(alice.address)).to.equal(2500);

    // 2. Alice deposits USDC into profit distributor
    await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
    expect(await distributor.depositBalance(alice.address)).to.equal(AMOUNTS.USDC_1K);

    // 3. Agent Alpha records arbitrage profit
    await usdc.connect(agentAlphaExecutor).transfer(
      await distributor.getAddress(), AMOUNTS.USDC_100
    );
    await distributor.connect(agentAlphaExecutor).recordProfit(
      await usdc.getAddress(), AMOUNTS.USDC_100
    );

    // 4. Alice has claimable profit
    const pending = await distributor.pendingProfit(alice.address);
    expect(pending).to.equal(AMOUNTS.USDC_100);

    // 5. Alice claims profit
    const balanceBefore = await usdc.balanceOf(alice.address);
    await distributor.connect(alice).claimProfit();
    const balanceAfter = await usdc.balanceOf(alice.address);
    expect(balanceAfter - balanceBefore).to.equal(AMOUNTS.USDC_100);

    // 6. Alice withdraws full deposit
    await distributor.connect(alice).withdraw(AMOUNTS.USDC_1K);
    expect(await distributor.depositBalance(alice.address)).to.equal(0n);
    expect(await distributor.totalDeposited()).to.equal(0n);
  });

  // ── Scenario 2: Multiple users, proportional profit distribution ────────────
  it("Scenario 2 — Multi-user proportional profit split", async () => {
    const { distributor, usdc, agentAlphaExecutor, alice, bob, charlie } =
      await loadFixture(deployFullProtocol);

    // Alice: $1K (10%), Bob: $4K (40%), Charlie: $5K (50%)
    await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
    await distributor.connect(bob).deposit(AMOUNTS.USDC_1K * 4n);
    await distributor.connect(charlie).deposit(AMOUNTS.USDC_1K * 5n);

    expect(await distributor.totalDeposited()).to.equal(AMOUNTS.USDC_1K * 10n);

    // Agent Alpha distributes $1K profit
    await usdc.connect(agentAlphaExecutor).transfer(
      await distributor.getAddress(), AMOUNTS.USDC_1K
    );
    await distributor.connect(agentAlphaExecutor).recordProfit(
      await usdc.getAddress(), AMOUNTS.USDC_1K
    );

    // Verify proportional split
    const alicePending   = await distributor.pendingProfit(alice.address);
    const bobPending     = await distributor.pendingProfit(bob.address);
    const charliePending = await distributor.pendingProfit(charlie.address);

    expect(alicePending).to.be.closeTo(
      ethers.parseUnits("100", 6), ethers.parseUnits("0.01", 6)
    );
    expect(bobPending).to.be.closeTo(
      ethers.parseUnits("400", 6), ethers.parseUnits("0.01", 6)
    );
    expect(charliePending).to.be.closeTo(
      ethers.parseUnits("500", 6), ethers.parseUnits("0.01", 6)
    );

    // All three claim
    for (const user of [alice, bob, charlie]) {
      await distributor.connect(user).claimProfit();
    }

    // After all claims, no more pending profit
    expect(await distributor.pendingProfit(alice.address)).to.equal(0n);
    expect(await distributor.pendingProfit(bob.address)).to.equal(0n);
    expect(await distributor.pendingProfit(charlie.address)).to.equal(0n);
  });

  // ── Scenario 3: Stake tier affects discounts, new depositor after profit ─────
  it("Scenario 3 — New depositor does NOT receive historical profit", async () => {
    const { distributor, usdc, agentAlphaExecutor, alice, bob } =
      await loadFixture(deployFullProtocol);

    // Alice deposits first
    await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);

    // Profit is distributed before Bob deposits
    await usdc.connect(agentAlphaExecutor).transfer(
      await distributor.getAddress(), AMOUNTS.USDC_100
    );
    await distributor.connect(agentAlphaExecutor).recordProfit(
      await usdc.getAddress(), AMOUNTS.USDC_100
    );

    // Bob deposits AFTER profit recording
    await distributor.connect(bob).deposit(AMOUNTS.USDC_1K);

    // Bob should have ZERO pending profit (only future profits)
    expect(await distributor.pendingProfit(bob.address)).to.equal(0n);
    // Alice should still have her full share
    expect(await distributor.pendingProfit(alice.address)).to.equal(AMOUNTS.USDC_100);
  });

  // ── Scenario 4: Multiple profit rounds ──────────────────────────────────────
  it("Scenario 4 — Multiple profit rounds accumulate correctly", async () => {
    const { distributor, usdc, agentAlphaExecutor, alice } =
      await loadFixture(deployFullProtocol);

    await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);

    // 3 rounds of profit: $50, $30, $20 = $100 total
    for (const amount of [
      ethers.parseUnits("50", 6),
      ethers.parseUnits("30", 6),
      ethers.parseUnits("20", 6),
    ]) {
      await usdc.connect(agentAlphaExecutor).transfer(
        await distributor.getAddress(), amount
      );
      await distributor.connect(agentAlphaExecutor).recordProfit(
        await usdc.getAddress(), amount
      );
    }

    // Total pending should equal sum of all rounds
    const pending = await distributor.pendingProfit(alice.address);
    expect(pending).to.be.closeTo(
      ethers.parseUnits("100", 6), ethers.parseUnits("0.001", 6)
    );
  });

  // ── Scenario 5: Pause protection ────────────────────────────────────────────
  it("Scenario 5 — Guardian can pause in emergency, users can still withdraw", async () => {
    const { distributor, guardian, alice } = await loadFixture(deployFullProtocol);

    await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);

    // Emergency pause
    await distributor.connect(guardian).pause();

    // New deposits blocked
    await expect(distributor.connect(alice).deposit(AMOUNTS.USDC_100))
      .to.be.revertedWithCustomError(distributor, "EnforcedPause");

    // But withdrawals still work (users can always exit)
    await expect(distributor.connect(alice).withdraw(AMOUNTS.USDC_1K))
      .to.not.be.reverted;
  });

  // ── Scenario 6: Staking reward flow ─────────────────────────────────────────
  it("Scenario 6 — Staking rewards distributed and claimed correctly", async () => {
    const { staking, usdc, alice, bob } = await loadFixture(deployFullProtocol);

    // Alice and Bob stake AX
    await staking.connect(alice).stake(AMOUNTS.AX_1K);     // 25% share
    await staking.connect(bob).stake(AMOUNTS.AX_1K * 3n);  // 75% share

    // ✅ FIX: alice has USDC from deployFullProtocol fixture — use her to distribute rewards
    await usdc.connect(alice).approve(await staking.getAddress(), AMOUNTS.USDC_100);
    await staking.connect(alice).distributeRewards(AMOUNTS.USDC_100);

    const alicePending = await staking.pendingRewards(alice.address);
    const bobPending   = await staking.pendingRewards(bob.address);

    // Bob staked 3x Alice → gets ~3x rewards
    expect(bobPending).to.be.gt(alicePending);
    expect(alicePending).to.be.closeTo(
      ethers.parseUnits("25", 6), ethers.parseUnits("0.01", 6)
    );
    expect(bobPending).to.be.closeTo(
      ethers.parseUnits("75", 6), ethers.parseUnits("0.01", 6)
    );
  });
});