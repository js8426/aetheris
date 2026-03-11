// Aetheris\aetheris-protocol\test\unit\AetherisStaking.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployStakingFixture, AMOUNTS } from "../helpers/setup";

describe("AetherisStaking", () => {

  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("sets AX and USDC token addresses correctly", async () => {
      const { staking, axToken, usdc } = await loadFixture(deployStakingFixture);
      expect(await staking.AX()).to.equal(await axToken.getAddress());
      expect(await staking.USDC()).to.equal(await usdc.getAddress());
    });

    it("initializes with zero totalStaked", async () => {
      const { staking } = await loadFixture(deployStakingFixture);
      expect(await staking.totalStaked()).to.equal(0n);
    });

    it("sets owner correctly", async () => {
      const { staking, owner } = await loadFixture(deployStakingFixture);
      expect(await staking.owner()).to.equal(owner.address);
    });
  });

  // ── Staking ─────────────────────────────────────────────────────────────────
  describe("stake()", () => {
    it("allows user to stake AX tokens", async () => {
      const { staking, axToken, alice } = await loadFixture(deployStakingFixture);
      
      await staking.connect(alice).stake(AMOUNTS.AX_1K);

      const info = await staking.userInfo(alice.address);
      expect(info.amount).to.equal(AMOUNTS.AX_1K);
      expect(await staking.totalStaked()).to.equal(AMOUNTS.AX_1K);
    });

    it("transfers AX from user to contract", async () => {
      const { staking, axToken, alice } = await loadFixture(deployStakingFixture);
      
      const balanceBefore = await axToken.balanceOf(alice.address);
      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      const balanceAfter = await axToken.balanceOf(alice.address);

      expect(balanceBefore - balanceAfter).to.equal(AMOUNTS.AX_1K);
      expect(await axToken.balanceOf(await staking.getAddress())).to.equal(AMOUNTS.AX_1K);
    });

    it("emits Staked event with correct args", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);

      await expect(staking.connect(alice).stake(AMOUNTS.AX_1K))
        .to.emit(staking, "Staked")
        .withArgs(alice.address, AMOUNTS.AX_1K);
    });

    it("reverts when staking zero tokens", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await expect(staking.connect(alice).stake(0n))
        .to.be.revertedWith("AetherisStaking: cannot stake 0");
    });

    it("accumulates multiple stake calls correctly", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);

      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      await staking.connect(alice).stake(AMOUNTS.AX_1K);

      const info = await staking.userInfo(alice.address);
      expect(info.amount).to.equal(AMOUNTS.AX_1K * 2n);
    });
  });

  // ── Tier System ─────────────────────────────────────────────────────────────
  describe("Tier system", () => {
    it("returns Base tier for 0 staked", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      expect(await staking.getTier(alice.address)).to.equal("Base");
    });

    it("returns Bronze tier at 1,000 AX", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      expect(await staking.getTier(alice.address)).to.equal("Bronze");
    });

    it("returns Silver tier at 10,000 AX", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_10K);
      expect(await staking.getTier(alice.address)).to.equal("Silver");
    });

    it("returns Gold tier at 100,000 AX", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_100K);
      expect(await staking.getTier(alice.address)).to.equal("Gold");
    });

    it("returns Platinum tier at 1,000,000 AX", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_1M);
      expect(await staking.getTier(alice.address)).to.equal("Platinum");
    });

    it("returns correct discounts per tier", async () => {
      const { staking, alice, bob, charlie, owner } =
        await loadFixture(deployStakingFixture);

      expect(await staking.getDiscount(alice.address)).to.equal(0);    // Base

      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      expect(await staking.getDiscount(alice.address)).to.equal(1000); // 10%

      await staking.connect(bob).stake(AMOUNTS.AX_10K);
      expect(await staking.getDiscount(bob.address)).to.equal(2500);   // 25%

      await staking.connect(charlie).stake(AMOUNTS.AX_1M);
      expect(await staking.getDiscount(charlie.address)).to.equal(10000); // 100%
    });

    it("downgrades tier after unstaking below threshold", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);

      await staking.connect(alice).stake(AMOUNTS.AX_10K); // Silver
      expect(await staking.getTier(alice.address)).to.equal("Silver");

      // Unstake down to just below Silver threshold
      const unstakeAmount = AMOUNTS.AX_10K - AMOUNTS.AX_1K + 1n;
      await staking.connect(alice).unstake(unstakeAmount);
      expect(await staking.getTier(alice.address)).to.equal("Base");
    });
  });

  // ── Unstaking ───────────────────────────────────────────────────────────────
  describe("unstake()", () => {
    it("returns AX tokens to user", async () => {
      const { staking, axToken, alice } = await loadFixture(deployStakingFixture);

      await staking.connect(alice).stake(AMOUNTS.AX_10K);
      const balanceBefore = await axToken.balanceOf(alice.address);

      await staking.connect(alice).unstake(AMOUNTS.AX_1K);

      const balanceAfter = await axToken.balanceOf(alice.address);
      expect(balanceAfter - balanceBefore).to.equal(AMOUNTS.AX_1K);
    });

    it("updates totalStaked correctly", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);

      await staking.connect(alice).stake(AMOUNTS.AX_10K);
      await staking.connect(alice).unstake(AMOUNTS.AX_1K);

      expect(await staking.totalStaked()).to.equal(AMOUNTS.AX_10K - AMOUNTS.AX_1K);
    });

    it("emits Unstaked event", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_1K);

      await expect(staking.connect(alice).unstake(AMOUNTS.AX_1K))
        .to.emit(staking, "Unstaked")
        .withArgs(alice.address, AMOUNTS.AX_1K);
    });

    it("reverts when unstaking more than staked balance", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_1K);

      await expect(staking.connect(alice).unstake(AMOUNTS.AX_10K))
        .to.be.revertedWith("AetherisStaking: insufficient stake");
    });

    it("reverts when unstaking zero", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_1K);

      await expect(staking.connect(alice).unstake(0n))
        .to.be.revertedWith("AetherisStaking: cannot unstake 0");
    });
  });

  // ── Rewards ─────────────────────────────────────────────────────────────────
  describe("Rewards", () => {
    it("distributeRewards increases reward pool", async () => {
      const { staking, usdc, owner, alice } = await loadFixture(deployStakingFixture);

      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      await staking.distributeRewards(AMOUNTS.USDC_100);

      expect(await usdc.balanceOf(await staking.getAddress())).to.equal(AMOUNTS.USDC_100);
    });

    it("pendingRewards returns correct amount after distribution", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);

      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      await staking.distributeRewards(AMOUNTS.USDC_100);

      // Alice is the only staker — she should get all rewards
      const pending = await staking.pendingRewards(alice.address);
      expect(pending).to.equal(AMOUNTS.USDC_100);
    });

    it("splits rewards proportionally between stakers", async () => {
      const { staking, alice, bob } = await loadFixture(deployStakingFixture);

      // Alice stakes 1K, Bob stakes 3K → 25/75 split
      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      await staking.connect(bob).stake(AMOUNTS.AX_1K * 3n);

      await staking.distributeRewards(AMOUNTS.USDC_100);

      const alicePending = await staking.pendingRewards(alice.address);
      const bobPending   = await staking.pendingRewards(bob.address);

      // Alice should get ~25 USDC, Bob ~75 USDC (within 1 wei rounding)
      expect(alicePending).to.be.closeTo(
        ethers.parseUnits("25", 6), ethers.parseUnits("0.001", 6)
      );
      expect(bobPending).to.be.closeTo(
        ethers.parseUnits("75", 6), ethers.parseUnits("0.001", 6)
      );
    });

    it("claimRewards transfers USDC to user", async () => {
      const { staking, usdc, alice } = await loadFixture(deployStakingFixture);

      await staking.connect(alice).stake(AMOUNTS.AX_1K);
      await staking.distributeRewards(AMOUNTS.USDC_100);

      const balanceBefore = await usdc.balanceOf(alice.address);
      await staking.connect(alice).claimRewards();
      const balanceAfter = await usdc.balanceOf(alice.address);

      expect(balanceAfter - balanceBefore).to.equal(AMOUNTS.USDC_100);
    });

    it("claimRewards reverts when no stake", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await expect(staking.connect(alice).claimRewards())
        .to.be.revertedWith("AetherisStaking: no stake");
    });

    it("claimRewards reverts when no pending rewards", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_1K);

      await expect(staking.connect(alice).claimRewards())
        .to.be.revertedWith("AetherisStaking: no rewards");
    });

    it("stakedBalance returns correct value", async () => {
      const { staking, alice } = await loadFixture(deployStakingFixture);
      await staking.connect(alice).stake(AMOUNTS.AX_10K);
      expect(await staking.stakedBalance(alice.address)).to.equal(AMOUNTS.AX_10K);
    });
  });
});