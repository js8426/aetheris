// Aetheris\aetheris-protocol\test\unit\ProfitDistributor.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployProfitDistributorFixture, AMOUNTS } from "../helpers/setup";

describe("ProfitDistributor", () => {

  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("sets deposit token correctly", async () => {
      const { distributor, usdc } = await loadFixture(deployProfitDistributorFixture);
      expect(await distributor.depositToken()).to.equal(await usdc.getAddress());
    });

    it("grants AGENT_ROLE to agentAlpha", async () => {
      const { distributor, agentAlpha, AGENT_ROLE } =
        await loadFixture(deployProfitDistributorFixture);
      expect(await distributor.hasRole(AGENT_ROLE, agentAlpha.address)).to.be.true;
    });

    it("initializes totalDeposited as zero", async () => {
      const { distributor } = await loadFixture(deployProfitDistributorFixture);
      expect(await distributor.totalDeposited()).to.equal(0n);
    });
  });

  // ── Deposits ────────────────────────────────────────────────────────────────
  describe("deposit()", () => {
    it("accepts valid USDC deposit", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);

      expect(await distributor.depositBalance(alice.address)).to.equal(AMOUNTS.USDC_100);
      expect(await distributor.totalDeposited()).to.equal(AMOUNTS.USDC_100);
    });

    it("emits Deposited event", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await expect(distributor.connect(alice).deposit(AMOUNTS.USDC_100))
        .to.emit(distributor, "Deposited")
        .withArgs(alice.address, AMOUNTS.USDC_100, AMOUNTS.USDC_100);
    });

    it("reverts below minimum deposit ($10)", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);
      const belowMin = ethers.parseUnits("9", 6);

      await expect(distributor.connect(alice).deposit(belowMin))
        .to.be.revertedWithCustomError(distributor, "ZeroAmount");
    });

    it("tracks multiple users' deposits independently", async () => {
      const { distributor, alice, bob } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);
      await distributor.connect(bob).deposit(AMOUNTS.USDC_500);

      expect(await distributor.depositBalance(alice.address)).to.equal(AMOUNTS.USDC_100);
      expect(await distributor.depositBalance(bob.address)).to.equal(AMOUNTS.USDC_500);
      expect(await distributor.totalDeposited()).to.equal(AMOUNTS.USDC_100 + AMOUNTS.USDC_500);
    });

    it("tracks depositor count correctly", async () => {
      const { distributor, alice, bob } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);
      await distributor.connect(bob).deposit(AMOUNTS.USDC_100);

      expect(await distributor.depositorCount()).to.equal(2n);
    });

    it("counts same user once even with multiple deposits", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);
      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);

      expect(await distributor.depositorCount()).to.equal(1n);
    });
  });

  // ── Withdrawals ─────────────────────────────────────────────────────────────
  describe("withdraw()", () => {
    it("returns USDC to user on full withdrawal", async () => {
      const { distributor, usdc, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);
      const balanceBefore = await usdc.balanceOf(alice.address);

      await distributor.connect(alice).withdraw(AMOUNTS.USDC_100);

      const balanceAfter = await usdc.balanceOf(alice.address);
      expect(balanceAfter - balanceBefore).to.equal(AMOUNTS.USDC_100);
    });

    it("allows partial withdrawal", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_500);
      await distributor.connect(alice).withdraw(AMOUNTS.USDC_100);

      expect(await distributor.depositBalance(alice.address))
        .to.equal(AMOUNTS.USDC_500 - AMOUNTS.USDC_100);
    });

    it("reverts when withdrawing more than deposited", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);

      await expect(distributor.connect(alice).withdraw(AMOUNTS.USDC_500))
        .to.be.revertedWithCustomError(distributor, "InsufficientDeposit");
    });

    it("reverts on zero withdrawal", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);
      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);

      await expect(distributor.connect(alice).withdraw(0n))
        .to.be.revertedWithCustomError(distributor, "ZeroAmount");
    });

    it("emits Withdrawn event", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);

      await expect(distributor.connect(alice).withdraw(AMOUNTS.USDC_100))
        .to.emit(distributor, "Withdrawn")
        .withArgs(alice.address, AMOUNTS.USDC_100, 0n);
    });
  });

  // ── Profit Distribution ─────────────────────────────────────────────────────
  describe("recordProfit() + claimProfit()", () => {
    it("only AGENT_ROLE can record profit", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await expect(
        distributor.connect(alice).recordProfit(
          await distributor.depositToken(), AMOUNTS.USDC_100
        )
      ).to.be.reverted;
    });

    it("records profit and increases accProfitPerShare", async () => {
      const { distributor, usdc, agentAlpha, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);

      const shareBefore = await distributor.accProfitPerShare();

      // Simulate Agent Alpha depositing profit into the contract
      await usdc.connect(agentAlpha).transfer(
        await distributor.getAddress(), AMOUNTS.USDC_100
      );
      await distributor.connect(agentAlpha).recordProfit(
        await usdc.getAddress(), AMOUNTS.USDC_100
      );

      const shareAfter = await distributor.accProfitPerShare();
      expect(shareAfter).to.be.gt(shareBefore);
    });

    it("pendingProfit returns correct amount for single depositor", async () => {
      const { distributor, usdc, agentAlpha, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);

      // Agent Alpha sends profit
      await usdc.connect(agentAlpha).transfer(
        await distributor.getAddress(), AMOUNTS.USDC_100
      );
      await distributor.connect(agentAlpha).recordProfit(
        await usdc.getAddress(), AMOUNTS.USDC_100
      );

      // Alice is only depositor → gets 100% of profit
      const pending = await distributor.pendingProfit(alice.address);
      expect(pending).to.equal(AMOUNTS.USDC_100);
    });

    it("splits profit proportionally between depositors", async () => {
      const { distributor, usdc, agentAlpha, alice, bob } =
        await loadFixture(deployProfitDistributorFixture);

      // Alice deposits 1K, Bob deposits 3K → 25/75 split
      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
      await distributor.connect(bob).deposit(AMOUNTS.USDC_1K * 3n);

      await usdc.connect(agentAlpha).transfer(
        await distributor.getAddress(), AMOUNTS.USDC_100
      );
      await distributor.connect(agentAlpha).recordProfit(
        await usdc.getAddress(), AMOUNTS.USDC_100
      );

      const alicePending = await distributor.pendingProfit(alice.address);
      const bobPending   = await distributor.pendingProfit(bob.address);

      expect(alicePending).to.be.closeTo(
        ethers.parseUnits("25", 6), ethers.parseUnits("0.001", 6)
      );
      expect(bobPending).to.be.closeTo(
        ethers.parseUnits("75", 6), ethers.parseUnits("0.001", 6)
      );
    });

    it("claimProfit transfers USDC and emits event", async () => {
      const { distributor, usdc, agentAlpha, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
      await usdc.connect(agentAlpha).transfer(
        await distributor.getAddress(), AMOUNTS.USDC_100
      );
      await distributor.connect(agentAlpha).recordProfit(
        await usdc.getAddress(), AMOUNTS.USDC_100
      );

      const balanceBefore = await usdc.balanceOf(alice.address);

      await expect(distributor.connect(alice).claimProfit())
        .to.emit(distributor, "ProfitClaimed")
        .withArgs(alice.address, AMOUNTS.USDC_100);

      const balanceAfter = await usdc.balanceOf(alice.address);
      expect(balanceAfter - balanceBefore).to.equal(AMOUNTS.USDC_100);
    });

    it("claimProfit reverts when no profit pending", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_100);

      await expect(distributor.connect(alice).claimProfit())
        .to.be.revertedWithCustomError(distributor, "NoProfitToClaim");
    });

    it("tracks lifetimeClaimed correctly", async () => {
      const { distributor, usdc, agentAlpha, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
      await usdc.connect(agentAlpha).transfer(
        await distributor.getAddress(), AMOUNTS.USDC_100
      );
      await distributor.connect(agentAlpha).recordProfit(
        await usdc.getAddress(), AMOUNTS.USDC_100
      );
      await distributor.connect(alice).claimProfit();

      expect(await distributor.lifetimeClaimed(alice.address))
        .to.equal(AMOUNTS.USDC_100);
    });
  });

  // ── Auto-Compound ────────────────────────────────────────────────────────────
  describe("Auto-compound", () => {
    it("compounds profit back into deposit instead of transferring", async () => {
      const { distributor, usdc, agentAlpha, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
      await distributor.connect(alice).setAutoCompound(true);

      await usdc.connect(agentAlpha).transfer(
        await distributor.getAddress(), AMOUNTS.USDC_100
      );
      await distributor.connect(agentAlpha).recordProfit(
        await usdc.getAddress(), AMOUNTS.USDC_100
      );

      await distributor.connect(alice).compound();

      // Deposit should increase by the profit amount
      expect(await distributor.depositBalance(alice.address))
        .to.equal(AMOUNTS.USDC_1K + AMOUNTS.USDC_100);
    });
  });

  // ── Pool Share ───────────────────────────────────────────────────────────────
  describe("userPoolShare()", () => {
    it("returns 100% for sole depositor (1e18)", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
      expect(await distributor.userPoolShare(alice.address)).to.equal(ethers.WeiPerEther);
    });

    it("returns 25% for 1K depositor in 4K pool (0.25e18)", async () => {
      const { distributor, alice, bob } = await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(alice).deposit(AMOUNTS.USDC_1K);
      await distributor.connect(bob).deposit(AMOUNTS.USDC_1K * 3n);

      const share = await distributor.userPoolShare(alice.address);
      expect(share).to.be.closeTo(
        ethers.WeiPerEther / 4n,
        ethers.parseUnits("0.001", 18)
      );
    });
  });

  // ── Pause / Unpause ──────────────────────────────────────────────────────────
  describe("Pause / Unpause", () => {
    it("guardian can pause deposits", async () => {
      const { distributor, guardian, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(guardian).pause();

      await expect(distributor.connect(alice).deposit(AMOUNTS.USDC_100))
        .to.be.revertedWithCustomError(distributor, "EnforcedPause");
    });

    it("guardian can unpause", async () => {
      const { distributor, guardian, alice } =
        await loadFixture(deployProfitDistributorFixture);

      await distributor.connect(guardian).pause();
      await distributor.connect(guardian).unpause();

      await expect(distributor.connect(alice).deposit(AMOUNTS.USDC_100))
        .to.not.be.reverted;
    });

    it("non-guardian cannot pause", async () => {
      const { distributor, alice } = await loadFixture(deployProfitDistributorFixture);

      await expect(distributor.connect(alice).pause()).to.be.reverted;
    });
  });
});