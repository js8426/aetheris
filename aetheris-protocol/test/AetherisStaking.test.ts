// Aetheris\aetheris-protocol\test\AetherisStaking.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { AetherisToken, AetherisStaking } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AetherisStaking", function () {
  let token: AetherisToken;
  let usdc: AetherisToken; // Using AetherisToken as mock USDC
  let staking: AetherisStaking;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const STAKE_AMOUNT = ethers.parseEther("10000");
  const REWARD_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy AX token
    const AetherisToken = await ethers.getContractFactory("AetherisToken");
    token = await AetherisToken.deploy();
    await token.waitForDeployment();

    // Deploy mock USDC (using AetherisToken contract)
    usdc = await AetherisToken.deploy();
    await usdc.waitForDeployment();

    // Deploy staking
    const AetherisStaking = await ethers.getContractFactory("AetherisStaking");
    staking = await AetherisStaking.deploy(
      await token.getAddress(),
      await usdc.getAddress()
    );
    await staking.waitForDeployment();

    // Transfer tokens to users
    await token.transfer(user1.address, ethers.parseEther("100000"));
    await token.transfer(user2.address, ethers.parseEther("100000"));

    // Transfer USDC to owner for rewards
    await usdc.transfer(owner.address, ethers.parseEther("100000"));
  });

  describe("Deployment", function () {
    it("Should set correct token addresses", async function () {
      expect(await staking.AX()).to.equal(await token.getAddress());
      expect(await staking.USDC()).to.equal(await usdc.getAddress());
    });

    it("Should set correct tier thresholds", async function () {
      expect(await staking.BRONZE_TIER()).to.equal(ethers.parseEther("1000"));
      expect(await staking.SILVER_TIER()).to.equal(ethers.parseEther("10000"));
      expect(await staking.GOLD_TIER()).to.equal(ethers.parseEther("100000"));
      expect(await staking.PLATINUM_TIER()).to.equal(ethers.parseEther("1000000"));
    });
  });

  describe("Staking", function () {
    it("Should stake tokens", async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);

      await expect(staking.connect(user1).stake(STAKE_AMOUNT))
        .to.emit(staking, "Staked")
        .withArgs(user1.address, STAKE_AMOUNT);

      expect(await staking.stakedBalance(user1.address)).to.equal(STAKE_AMOUNT);
      expect(await staking.totalStaked()).to.equal(STAKE_AMOUNT);
    });

    it("Should transfer tokens to staking contract", async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      expect(await token.balanceOf(await staking.getAddress())).to.equal(
        STAKE_AMOUNT
      );
    });

    it("Should fail when staking 0", async function () {
      await expect(staking.connect(user1).stake(0)).to.be.revertedWith(
        "AetherisStaking: cannot stake 0"
      );
    });

    it("Should fail without approval", async function () {
      await expect(
        staking.connect(user1).stake(STAKE_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("Should allow multiple stakes", async function () {
      const amount1 = ethers.parseEther("5000");
      const amount2 = ethers.parseEther("5000");

      await token.connect(user1).approve(await staking.getAddress(), amount1 + amount2);

      await staking.connect(user1).stake(amount1);
      await staking.connect(user1).stake(amount2);

      expect(await staking.stakedBalance(user1.address)).to.equal(
        amount1 + amount2
      );
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);
    });

    it("Should unstake tokens", async function () {
      const unstakeAmount = ethers.parseEther("5000");

      await expect(staking.connect(user1).unstake(unstakeAmount))
        .to.emit(staking, "Unstaked")
        .withArgs(user1.address, unstakeAmount);

      expect(await staking.stakedBalance(user1.address)).to.equal(
        STAKE_AMOUNT - unstakeAmount
      );
    });

    it("Should transfer tokens back to user", async function () {
      const balanceBefore = await token.balanceOf(user1.address);
      const unstakeAmount = ethers.parseEther("5000");

      await staking.connect(user1).unstake(unstakeAmount);

      const balanceAfter = await token.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(unstakeAmount);
    });

    it("Should fail when unstaking more than staked", async function () {
      await expect(
        staking.connect(user1).unstake(STAKE_AMOUNT + 1n)
      ).to.be.revertedWith("AetherisStaking: insufficient stake");
    });

    it("Should fail when unstaking 0", async function () {
      await expect(staking.connect(user1).unstake(0)).to.be.revertedWith(
        "AetherisStaking: cannot unstake 0"
      );
    });

    it("Should allow full unstake", async function () {
      await staking.connect(user1).unstake(STAKE_AMOUNT);

      expect(await staking.stakedBalance(user1.address)).to.equal(0);
      expect(await staking.totalStaked()).to.equal(0);
    });
  });

  describe("Tier System", function () {
    it("Should return Base tier for no stake", async function () {
      expect(await staking.getTier(user1.address)).to.equal("Base");
    });

    it("Should return Bronze tier", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);

      expect(await staking.getTier(user1.address)).to.equal("Bronze");
    });

    it("Should return Silver tier", async function () {
      const amount = ethers.parseEther("10000");
      await token.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);

      expect(await staking.getTier(user1.address)).to.equal("Silver");
    });

    it("Should return Gold tier", async function () {
      const amount = ethers.parseEther("100000");
      await token.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);

      expect(await staking.getTier(user1.address)).to.equal("Gold");
    });

    it("Should return Platinum tier", async function () {
      const amount = ethers.parseEther("1000000");
      
      // Owner transfers to user2 (owner has all tokens)
      await token.transfer(user2.address, amount);
      await token.connect(user2).approve(await staking.getAddress(), amount);
      await staking.connect(user2).stake(amount);

      expect(await staking.getTier(user2.address)).to.equal("Platinum");
    });
  });

  describe("Fee Discounts", function () {
    it("Should return 0% discount for Base tier", async function () {
      expect(await staking.getDiscount(user1.address)).to.equal(0);
    });

    it("Should return 10% discount for Bronze tier", async function () {
      const amount = ethers.parseEther("1000");
      await token.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);

      expect(await staking.getDiscount(user1.address)).to.equal(1000); // 10% in basis points
    });

    it("Should return 25% discount for Silver tier", async function () {
      const amount = ethers.parseEther("10000");
      await token.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);

      expect(await staking.getDiscount(user1.address)).to.equal(2500); // 25%
    });

    it("Should return 50% discount for Gold tier", async function () {
      const amount = ethers.parseEther("100000");
      await token.connect(user1).approve(await staking.getAddress(), amount);
      await staking.connect(user1).stake(amount);

      expect(await staking.getDiscount(user1.address)).to.equal(5000); // 50%
    });

    it("Should return 100% discount for Platinum tier", async function () {
      const amount = ethers.parseEther("1000000");
      
      // Owner transfers to user2 (owner has all tokens)
      await token.transfer(user2.address, amount);
      await token.connect(user2).approve(await staking.getAddress(), amount);
      await staking.connect(user2).stake(amount);

      expect(await staking.getDiscount(user2.address)).to.equal(10000);
    });
  });

  describe("Reward Distribution", function () {
    beforeEach(async function () {
      // User1 stakes
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // User2 stakes
      await token.connect(user2).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user2).stake(STAKE_AMOUNT);
    });

    it("Should distribute rewards", async function () {
      await usdc.approve(await staking.getAddress(), REWARD_AMOUNT);

      await expect(staking.distributeRewards(REWARD_AMOUNT))
        .to.emit(staking, "RewardsDistributed")
        .withArgs(REWARD_AMOUNT);
    });

    it("Should transfer USDC to staking contract", async function () {
      await usdc.approve(await staking.getAddress(), REWARD_AMOUNT);
      await staking.distributeRewards(REWARD_AMOUNT);

      expect(await usdc.balanceOf(await staking.getAddress())).to.be.gt(0);
    });

    it("Should fail when distributing 0", async function () {
      await expect(staking.distributeRewards(0)).to.be.revertedWith(
        "AetherisStaking: zero amount"
      );
    });
  });

  describe("Reward Claiming", function () {
    beforeEach(async function () {
      // User1 stakes
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // Distribute rewards
      await usdc.approve(await staking.getAddress(), REWARD_AMOUNT);
      await staking.distributeRewards(REWARD_AMOUNT);
    });

    it("Should show pending rewards", async function () {
      const pending = await staking.pendingRewards(user1.address);
      expect(pending).to.be.gt(0);
    });

    it("Should claim rewards", async function () {
      await expect(staking.connect(user1).claimRewards())
        .to.emit(staking, "RewardsClaimed");
    });

    it("Should transfer USDC to user", async function () {
      const balanceBefore = await usdc.balanceOf(user1.address);
      await staking.connect(user1).claimRewards();
      const balanceAfter = await usdc.balanceOf(user1.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should reset pending rewards after claim", async function () {
      await staking.connect(user1).claimRewards();

      const pending = await staking.pendingRewards(user1.address);
      expect(pending).to.equal(0);
    });

    it("Should fail when no stake", async function () {
      await expect(staking.connect(owner).claimRewards()).to.be.revertedWith(
        "AetherisStaking: no stake"
      );
    });

    it("Should fail when no rewards", async function () {
      await staking.connect(user1).claimRewards(); // Claim once

      await expect(staking.connect(user1).claimRewards()).to.be.revertedWith(
        "AetherisStaking: no rewards"
      );
    });
  });

  describe("Reward Accounting", function () {
    it("Should distribute rewards proportionally", async function () {
      // User1 stakes 10k
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // User2 stakes 10k
      await token.connect(user2).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user2).stake(STAKE_AMOUNT);

      // Distribute 1000 USDC
      await usdc.approve(await staking.getAddress(), REWARD_AMOUNT);
      await staking.distributeRewards(REWARD_AMOUNT);

      // Each user should get ~500 USDC (50%)
      const pending1 = await staking.pendingRewards(user1.address);
      const pending2 = await staking.pendingRewards(user2.address);

      const expected = REWARD_AMOUNT / 2n;

      expect(pending1).to.be.closeTo(expected, expected / 100n);
      expect(pending2).to.be.closeTo(expected, expected / 100n);
    });

    it("Should auto-claim rewards on stake", async function () {
      // User1 stakes
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // Distribute rewards
      await usdc.approve(await staking.getAddress(), REWARD_AMOUNT);
      await staking.distributeRewards(REWARD_AMOUNT);

      // User1 stakes more (should auto-claim)
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await expect(staking.connect(user1).stake(STAKE_AMOUNT))
        .to.emit(staking, "RewardsClaimed");
    });

    it("Should auto-claim rewards on unstake", async function () {
      // User1 stakes
      await token.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT);

      // Distribute rewards
      await usdc.approve(await staking.getAddress(), REWARD_AMOUNT);
      await staking.distributeRewards(REWARD_AMOUNT);

      // User1 unstakes (should auto-claim)
      await expect(staking.connect(user1).unstake(ethers.parseEther("1000")))
        .to.emit(staking, "RewardsClaimed");
    });
  });

  describe("Emergency Withdraw", function () {
    it("Should allow owner to emergency withdraw other tokens", async function () {
      // Deploy a different token
      const OtherToken = await ethers.getContractFactory("AetherisToken");
      const otherToken = await OtherToken.deploy();
      await otherToken.waitForDeployment();

      // Send to staking contract
      const amount = ethers.parseEther("1000");
      await otherToken.transfer(await staking.getAddress(), amount);

      // Emergency withdraw
      await staking.emergencyWithdraw(await otherToken.getAddress(), amount);

      expect(await otherToken.balanceOf(owner.address)).to.be.gt(0);
    });

    it("Should prevent withdrawal of AX tokens", async function () {
      await expect(
        staking.emergencyWithdraw(await token.getAddress(), 100)
      ).to.be.revertedWith("AetherisStaking: cannot withdraw AX or USDC");
    });

    it("Should prevent withdrawal of USDC tokens", async function () {
      await expect(
        staking.emergencyWithdraw(await usdc.getAddress(), 100)
      ).to.be.revertedWith("AetherisStaking: cannot withdraw AX or USDC");
    });

    it("Should only allow owner", async function () {
      await expect(
        staking.connect(user1).emergencyWithdraw(await token.getAddress(), 100)
      ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
    });
  });
});
