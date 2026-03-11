// Aetheris\aetheris-protocol\test\AetherisPaymaster.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { AetherisPaymaster, AetherisStaking, AetherisToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * AetherisPaymaster Test Suite
 *
 * NOTE: On a local Hardhat network the canonical EntryPoint address has no
 * code, so we deploy a real EntryPoint locally in every beforeEach using the
 * artifact compiled from contracts/test/EntryPointWrapper.sol.
 *
 * NOTE: _validatePaymasterUserOp and _postOp are internal and called by the
 * EntryPoint only. We test the logic they depend on via public view functions
 * and admin setters. Full UserOperation flows require a forked Base environment.
 */

describe("AetherisPaymaster", function () {
  let paymaster: AetherisPaymaster;
  let staking: AetherisStaking;
  let usdc: AetherisToken;
  let ax: AetherisToken;
  let entryPointAddress: string;
  let mockRouterAddress: string;
  let weth: string;

  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let attacker: SignerWithAddress;

  const WEEKLY_BUDGET = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, user, attacker] = await ethers.getSigners();

    // Deploy a real EntryPoint locally — paymaster constructor calls
    // BasePaymaster(entryPoint) which validates the address has code.
    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    const entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();
    entryPointAddress = await entryPoint.getAddress();

    // Deploy $AX token
    const AetherisToken = await ethers.getContractFactory("AetherisToken");
    ax = await AetherisToken.deploy();
    await ax.waitForDeployment();

    // Deploy mock USDC (reuse AetherisToken as a generic ERC20)
    usdc = await AetherisToken.deploy();
    await usdc.waitForDeployment();

    // Deploy staking
    const Staking = await ethers.getContractFactory("AetherisStaking");
    staking = await Staking.deploy(
      await ax.getAddress(),
      await usdc.getAddress()
    );
    await staking.waitForDeployment();

    // Deploy mock DEX router
    const MockRouter = await ethers.getContractFactory("MockUniswapRouter");
    const mockRouter = await MockRouter.deploy();
    await mockRouter.waitForDeployment();
    mockRouterAddress = await mockRouter.getAddress();

    // Any non-zero address works for WETH in constructor validation
    weth = ethers.Wallet.createRandom().address;

    // Deploy paymaster
    const Paymaster = await ethers.getContractFactory("AetherisPaymaster");
    paymaster = await Paymaster.deploy(
      entryPointAddress,
      await usdc.getAddress(),
      weth,
      await staking.getAddress(),
      mockRouterAddress,
      WEEKLY_BUDGET
    );
    await paymaster.waitForDeployment();

    // Give user some USDC
    await usdc.transfer(user.address, ethers.parseEther("10000"));
  });

  /*//////////////////////////////////////////////////////////////
                          DEPLOYMENT
  //////////////////////////////////////////////////////////////*/

  describe("Deployment", function () {
    it("Should set correct USDC address", async function () {
      expect(await paymaster.USDC()).to.equal(await usdc.getAddress());
    });

    it("Should set correct WETH address", async function () {
      expect(await paymaster.WETH()).to.equal(weth);
    });

    it("Should set correct staking address", async function () {
      expect(await paymaster.staking()).to.equal(await staking.getAddress());
    });

    it("Should set correct weekly gas budget", async function () {
      expect(await paymaster.weeklyGasBudget()).to.equal(WEEKLY_BUDGET);
    });

    it("Should start with circuit breaker inactive", async function () {
      expect(await paymaster.circuitBreakerActive()).to.be.false;
    });

    it("Should start with default price markup of 110%", async function () {
      expect(await paymaster.priceMarkup()).to.equal(11000n);
    });

    it("Should start with default rate limit of 50 tx/hr", async function () {
      expect(await paymaster.rateLimit()).to.equal(50n);
    });

    it("Should revert if USDC address is zero", async function () {
      const Paymaster = await ethers.getContractFactory("AetherisPaymaster");
      await expect(
        Paymaster.deploy(
          entryPointAddress,
          ethers.ZeroAddress,
          weth,
          await staking.getAddress(),
          mockRouterAddress,
          WEEKLY_BUDGET
        )
      ).to.be.revertedWithCustomError(
        { interface: (await ethers.getContractFactory("AetherisPaymaster")).interface } as any,
        "InvalidConfiguration"
      );
    });

    it("Should revert if DEX router address is zero", async function () {
      const Paymaster = await ethers.getContractFactory("AetherisPaymaster");
      await expect(
        Paymaster.deploy(
          entryPointAddress,
          await usdc.getAddress(),
          weth,
          await staking.getAddress(),
          ethers.ZeroAddress, // bad router
          WEEKLY_BUDGET
        )
      ).to.be.revertedWithCustomError(
        { interface: (await ethers.getContractFactory("AetherisPaymaster")).interface } as any,
        "InvalidConfiguration"
      );
    });
  });

  /*//////////////////////////////////////////////////////////////
                    USDC COST ESTIMATION
  //////////////////////////////////////////////////////////////*/

  describe("USDC Cost Estimation", function () {
    it("Should return a positive USDC cost for any gas amount", async function () {
      const [cost] = await paymaster.getUSDCCostEstimate(user.address, 100_000, ethers.parseUnits("1", "gwei"));
      expect(cost).to.be.gt(0);
    });

    it("Should return 0% discount for Base tier (no stake)", async function () {
      const [, discount] = await paymaster.getUSDCCostEstimate(user.address, 100_000, ethers.parseUnits("1", "gwei"));
      expect(discount).to.equal(0n);
    });

    it("Should return 10% discount for Bronze tier staker", async function () {
      const stakeAmount = ethers.parseEther("1000");
      await ax.transfer(user.address, stakeAmount);
      await ax.connect(user).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user).stake(stakeAmount);

      const [, discount] = await paymaster.getUSDCCostEstimate(user.address, 100_000, ethers.parseUnits("1", "gwei"));
      expect(discount).to.equal(1000n);
    });

    it("Should return 25% discount for Silver tier staker", async function () {
      const stakeAmount = ethers.parseEther("10000");
      await ax.transfer(user.address, stakeAmount);
      await ax.connect(user).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user).stake(stakeAmount);

      const [, discount] = await paymaster.getUSDCCostEstimate(user.address, 100_000, ethers.parseUnits("1", "gwei"));
      expect(discount).to.equal(2500n);
    });

    it("Should return 50% discount for Gold tier staker", async function () {
      const stakeAmount = ethers.parseEther("100000");
      await ax.transfer(user.address, stakeAmount);
      await ax.connect(user).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user).stake(stakeAmount);

      const [, discount] = await paymaster.getUSDCCostEstimate(user.address, 100_000, ethers.parseUnits("1", "gwei"));
      expect(discount).to.equal(5000n);
    });

    it("Should return 100% discount and zero cost for Platinum tier staker", async function () {
      const stakeAmount = ethers.parseEther("1000000");
      await ax.transfer(user.address, stakeAmount);
      await ax.connect(user).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user).stake(stakeAmount);

      const [cost, discount] = await paymaster.getUSDCCostEstimate(user.address, 100_000, ethers.parseUnits("1", "gwei"));
      expect(discount).to.equal(10000n);
      expect(cost).to.equal(0n);
    });

    it("Should scale cost proportionally with gas amount", async function () {
      const [cost1] = await paymaster.getUSDCCostEstimate(user.address, 100_000, ethers.parseUnits("1", "gwei"));
      const [cost2] = await paymaster.getUSDCCostEstimate(user.address, 200_000, ethers.parseUnits("1", "gwei"));
      expect(cost2).to.equal(cost1 * 2n);
    });

    it("Should return consistent values for the same inputs", async function () {
      const [cost1, discount1] = await paymaster.getUSDCCostEstimate(user.address, 50_000, ethers.parseUnits("1", "gwei"));
      const [cost2, discount2] = await paymaster.getUSDCCostEstimate(user.address, 50_000, ethers.parseUnits("1", "gwei"));
      expect(cost1).to.equal(cost2);
      expect(discount1).to.equal(discount2);
    });
  });

  /*//////////////////////////////////////////////////////////////
                    WEEKLY GAS BUDGET
  //////////////////////////////////////////////////////////////*/

  describe("Weekly Gas Budget", function () {
    it("Should return the full budget at the start of a week", async function () {
      const remaining = await paymaster.getRemainingGasBudget();
      expect(remaining).to.equal(WEEKLY_BUDGET);
    });

    it("Should allow owner to update weekly budget", async function () {
      const newBudget = ethers.parseEther("2");
      await expect(paymaster.setWeeklyGasBudget(newBudget))
        .to.emit(paymaster, "GasBudgetUpdated")
        .withArgs(newBudget);

      expect(await paymaster.weeklyGasBudget()).to.equal(newBudget);
    });

    it("Should reject setWeeklyGasBudget from non-owner", async function () {
      await expect(
        paymaster.connect(attacker).setWeeklyGasBudget(ethers.parseEther("5"))
      ).to.be.reverted;
    });
  });

  /*//////////////////////////////////////////////////////////////
                    RATE LIMITING
  //////////////////////////////////////////////////////////////*/

  describe("Rate Limiting", function () {
    it("Should return 0 transactions for a fresh user", async function () {
      expect(await paymaster.getUserTransactionCount(user.address)).to.equal(0n);
    });

    it("Should allow owner to update rate limit", async function () {
      await expect(paymaster.setRateLimit(100))
        .to.emit(paymaster, "RateLimitUpdated")
        .withArgs(100);

      expect(await paymaster.rateLimit()).to.equal(100n);
    });

    it("Should reject setRateLimit from non-owner", async function () {
      await expect(
        paymaster.connect(attacker).setRateLimit(100)
      ).to.be.reverted;
    });
  });

  /*//////////////////////////////////////////////////////////////
                    CIRCUIT BREAKER
  //////////////////////////////////////////////////////////////*/

  describe("Circuit Breaker", function () {
    it("Should allow owner to activate circuit breaker", async function () {
      await expect(paymaster.setCircuitBreaker(true))
        .to.emit(paymaster, "CircuitBreakerTriggered")
        .withArgs("Manual activation");

      expect(await paymaster.circuitBreakerActive()).to.be.true;
    });

    it("Should allow owner to deactivate circuit breaker", async function () {
      await paymaster.setCircuitBreaker(true);
      await paymaster.setCircuitBreaker(false);
      expect(await paymaster.circuitBreakerActive()).to.be.false;
    });

    it("Should reject setCircuitBreaker from non-owner", async function () {
      await expect(
        paymaster.connect(attacker).setCircuitBreaker(true)
      ).to.be.reverted;
    });
  });

  /*//////////////////////////////////////////////////////////////
                      ADMIN SETTERS
  //////////////////////////////////////////////////////////////*/

  describe("Admin Configuration", function () {
    it("Should allow owner to set price markup within valid range", async function () {
      await paymaster.setPriceMarkup(12000);
      expect(await paymaster.priceMarkup()).to.equal(12000n);
    });

    it("Should reject markup below 100%", async function () {
      await expect(paymaster.setPriceMarkup(9999)).to.be.revertedWith("Invalid markup");
    });

    it("Should reject markup above 150%", async function () {
      await expect(paymaster.setPriceMarkup(15001)).to.be.revertedWith("Invalid markup");
    });

    it("Should allow owner to update minimum trade size", async function () {
      const newMin = 20 * 1e6;
      await paymaster.setMinTradeSize(newMin);
      expect(await paymaster.minTradeSize()).to.equal(BigInt(newMin));
    });

    it("Should reject setMinTradeSize from non-owner", async function () {
      await expect(
        paymaster.connect(attacker).setMinTradeSize(5 * 1e6)
      ).to.be.reverted;
    });
  });

  /*//////////////////////////////////////////////////////////////
                    EMERGENCY WITHDRAWAL
  //////////////////////////////////////////////////////////////*/

  describe("Emergency Withdrawal", function () {
    it("Should allow owner to emergency withdraw ETH", async function () {
      await owner.sendTransaction({
        to: await paymaster.getAddress(),
        value: ethers.parseEther("0.5"),
      });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await paymaster.emergencyWithdraw(ethers.ZeroAddress, ethers.parseEther("0.5"));
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter - balanceBefore + gasUsed).to.be.closeTo(
        ethers.parseEther("0.5"),
        ethers.parseEther("0.001")
      );
    });

    it("Should allow owner to emergency withdraw ERC20 tokens", async function () {
      const amount = ethers.parseEther("500");
      await usdc.transfer(await paymaster.getAddress(), amount);

      const balanceBefore = await usdc.balanceOf(owner.address);
      await paymaster.emergencyWithdraw(await usdc.getAddress(), amount);
      const balanceAfter = await usdc.balanceOf(owner.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should emit EmergencyWithdraw event", async function () {
      const amount = ethers.parseEther("100");
      await usdc.transfer(await paymaster.getAddress(), amount);

      await expect(paymaster.emergencyWithdraw(await usdc.getAddress(), amount))
        .to.emit(paymaster, "EmergencyWithdraw")
        .withArgs(await usdc.getAddress(), amount);
    });

    it("Should reject emergencyWithdraw from non-owner", async function () {
      await expect(
        paymaster.connect(attacker).emergencyWithdraw(await usdc.getAddress(), 1)
      ).to.be.reverted;
    });
  });
});
