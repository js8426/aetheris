// Aetheris\aetheris-protocol\test\AetherisVesting.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { AetherisToken, AetherisVesting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AetherisVesting", function () {
  let token: AetherisToken;
  let vesting: AetherisVesting;
  let owner: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let addr2: SignerWithAddress;

  const VESTING_AMOUNT = ethers.parseEther("1000000");
  const CLIFF_DURATION = 365 * 24 * 60 * 60; // 1 year in seconds
  const VESTING_DURATION = 4 * 365 * 24 * 60 * 60; // 4 years in seconds

  beforeEach(async function () {
    [owner, beneficiary, addr2] = await ethers.getSigners();

    // Deploy token
    const AetherisToken = await ethers.getContractFactory("AetherisToken");
    token = await AetherisToken.deploy();
    await token.waitForDeployment();

    // Deploy vesting
    const AetherisVesting = await ethers.getContractFactory("AetherisVesting");
    vesting = await AetherisVesting.deploy(await token.getAddress());
    await vesting.waitForDeployment();

    // Approve vesting contract to spend owner's tokens
    await token.approve(await vesting.getAddress(), VESTING_AMOUNT);
  });

  describe("Deployment", function () {
    it("Should set the right token address", async function () {
      expect(await vesting.AX()).to.equal(await token.getAddress());
    });

    it("Should set the right owner", async function () {
      expect(await vesting.owner()).to.equal(owner.address);
    });

    it("Should revert with zero address", async function () {
      const AetherisVesting = await ethers.getContractFactory("AetherisVesting");
      await expect(
        AetherisVesting.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("AetherisVesting: zero address");
    });
  });

  describe("Create Vesting Schedule", function () {
    it("Should create a vesting schedule", async function () {
      const startTime = await time.latest();

      await expect(
        vesting.createVestingSchedule(
          beneficiary.address,
          VESTING_AMOUNT,
          startTime,
          CLIFF_DURATION,
          VESTING_DURATION,
          false
        )
      )
        .to.emit(vesting, "VestingScheduleCreated")
        .withArgs(
          beneficiary.address,
          VESTING_AMOUNT,
          startTime,
          CLIFF_DURATION,
          VESTING_DURATION,
          false
        );
    });

    it("Should transfer tokens to vesting contract", async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );

      expect(await token.balanceOf(await vesting.getAddress())).to.equal(
        VESTING_AMOUNT
      );
    });

    it("Should update totalVestingTokens", async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );

      expect(await vesting.totalVestingTokens()).to.equal(VESTING_AMOUNT);
    });

    it("Should store vesting schedule correctly", async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        true // revocable
      );

      const schedule = await vesting.getVestingSchedule(beneficiary.address);

      expect(schedule.totalAmount).to.equal(VESTING_AMOUNT);
      expect(schedule.released).to.equal(0);
      expect(schedule.startTime).to.equal(startTime);
      expect(schedule.cliffDuration).to.equal(CLIFF_DURATION);
      expect(schedule.duration).to.equal(VESTING_DURATION);
      expect(schedule.revocable).to.be.true;
      expect(schedule.revoked).to.be.false;
    });

    it("Should fail if schedule already exists", async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );

      await token.approve(await vesting.getAddress(), VESTING_AMOUNT);

      await expect(
        vesting.createVestingSchedule(
          beneficiary.address,
          VESTING_AMOUNT,
          startTime,
          CLIFF_DURATION,
          VESTING_DURATION,
          false
        )
      ).to.be.revertedWith("AetherisVesting: schedule exists");
    });

    it("Should fail with zero address", async function () {
      const startTime = await time.latest();

      await expect(
        vesting.createVestingSchedule(
          ethers.ZeroAddress,
          VESTING_AMOUNT,
          startTime,
          CLIFF_DURATION,
          VESTING_DURATION,
          false
        )
      ).to.be.revertedWith("AetherisVesting: zero address");
    });

    it("Should fail with zero amount", async function () {
      const startTime = await time.latest();

      await expect(
        vesting.createVestingSchedule(
          beneficiary.address,
          0,
          startTime,
          CLIFF_DURATION,
          VESTING_DURATION,
          false
        )
      ).to.be.revertedWith("AetherisVesting: zero amount");
    });

    it("Should fail if cliff exceeds duration", async function () {
      const startTime = await time.latest();

      await expect(
        vesting.createVestingSchedule(
          beneficiary.address,
          VESTING_AMOUNT,
          startTime,
          VESTING_DURATION + 1,
          VESTING_DURATION,
          false
        )
      ).to.be.revertedWith("AetherisVesting: cliff > duration");
    });

    it("Should only allow owner to create schedule", async function () {
      const startTime = await time.latest();

      await expect(
        vesting
          .connect(beneficiary)
          .createVestingSchedule(
            beneficiary.address,
            VESTING_AMOUNT,
            startTime,
            CLIFF_DURATION,
            VESTING_DURATION,
            false
          )
      ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
    });
  });

  describe("Release Tokens", function () {
    beforeEach(async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );
    });

    it("Should fail before cliff", async function () {
      await expect(vesting.release(beneficiary.address)).to.be.revertedWith(
        "AetherisVesting: no tokens to release"
      );
    });

    it("Should release tokens after cliff", async function () {
      // Fast forward past cliff
      await time.increase(CLIFF_DURATION + 1);

      await vesting.release(beneficiary.address);

      const balance = await token.balanceOf(beneficiary.address);
      expect(balance).to.be.gt(0);
    });

    it("Should release correct amount after half vesting period", async function () {
      // Fast forward to halfway through vesting
      await time.increase(VESTING_DURATION / 2);

      await vesting.release(beneficiary.address);

      const balance = await token.balanceOf(beneficiary.address);
      const expected = VESTING_AMOUNT / 2n;

      // Allow 1% tolerance for rounding
      expect(balance).to.be.closeTo(expected, expected / 100n);
    });

    it("Should release all tokens after vesting period", async function () {
      await time.increase(VESTING_DURATION + 1);

      await vesting.release(beneficiary.address);

      const balance = await token.balanceOf(beneficiary.address);
      
      // No burn on transfers anymore - should receive full amount
      expect(balance).to.equal(VESTING_AMOUNT);
    });

    it("Should emit TokensReleased event", async function () {
      await time.increase(CLIFF_DURATION + 1);

      // Simply check the event is emitted (don't validate exact amount due to timing precision)
      await expect(vesting.release(beneficiary.address))
        .to.emit(vesting, "TokensReleased")
        .withArgs(beneficiary.address, (amount: bigint) => amount > 0n);
    });

    it("Should update released amount", async function () {
      await time.increase(CLIFF_DURATION + 1);

      await vesting.release(beneficiary.address);

      const schedule = await vesting.getVestingSchedule(beneficiary.address);
      expect(schedule.released).to.be.gt(0);
    });

    it("Should allow multiple releases", async function () {
      // Release after 1 year
      await time.increase(CLIFF_DURATION + 1);
      await vesting.release(beneficiary.address);
      const firstRelease = await token.balanceOf(beneficiary.address);

      // Release after 2 years
      await time.increase(365 * 24 * 60 * 60);
      await vesting.release(beneficiary.address);
      const secondRelease = await token.balanceOf(beneficiary.address);

      expect(secondRelease).to.be.gt(firstRelease);
    });

    it("Should fail if no schedule exists", async function () {
      await expect(vesting.release(addr2.address)).to.be.revertedWith(
        "AetherisVesting: no schedule"
      );
    });

    it("Should allow anyone to call release", async function () {
      await time.increase(CLIFF_DURATION + 1);

      // addr2 calls release for beneficiary
      await expect(vesting.connect(addr2).release(beneficiary.address)).to.not
        .be.reverted;
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );
    });

    it("Should return correct releasable amount", async function () {
      expect(await vesting.releasableAmount(beneficiary.address)).to.equal(0);

      await time.increase(CLIFF_DURATION + 1);

      const releasable = await vesting.releasableAmount(beneficiary.address);
      expect(releasable).to.be.gt(0);
    });

    it("Should return correct vested amount", async function () {
      expect(await vesting.vestedAmount(beneficiary.address)).to.equal(0);

      await time.increase(VESTING_DURATION / 2);

      const vested = await vesting.vestedAmount(beneficiary.address);
      const expected = VESTING_AMOUNT / 2n;

      expect(vested).to.be.closeTo(expected, expected / 100n);
    });

    it("Should return 0 for non-existent schedule", async function () {
      expect(await vesting.releasableAmount(addr2.address)).to.equal(0);
      expect(await vesting.vestedAmount(addr2.address)).to.equal(0);
    });
  });

  describe("Revoke Schedule", function () {
    beforeEach(async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        true // revocable
      );
    });

    it("Should revoke revocable schedule", async function () {
      await time.increase(CLIFF_DURATION + 1);

      await expect(vesting.revoke(beneficiary.address))
        .to.emit(vesting, "VestingScheduleRevoked");
    });

    it("Should release vested tokens on revoke", async function () {
      await time.increase(VESTING_DURATION / 2);

      await vesting.revoke(beneficiary.address);

      const balance = await token.balanceOf(beneficiary.address);
      expect(balance).to.be.gt(0);
    });

    it("Should refund unvested tokens to owner", async function () {
      const ownerBalanceBefore = await token.balanceOf(owner.address);

      await time.increase(VESTING_DURATION / 2);
      await vesting.revoke(beneficiary.address);

      const ownerBalanceAfter = await token.balanceOf(owner.address);
      expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
    });

    it("Should mark schedule as revoked", async function () {
      await vesting.revoke(beneficiary.address);

      const schedule = await vesting.getVestingSchedule(beneficiary.address);
      expect(schedule.revoked).to.be.true;
    });

    it("Should fail to revoke non-revocable schedule", async function () {
      // Create non-revocable schedule
      await token.approve(await vesting.getAddress(), VESTING_AMOUNT);
      const startTime = await time.latest();
      
      await vesting.createVestingSchedule(
        addr2.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        false // not revocable
      );

      await expect(vesting.revoke(addr2.address)).to.be.revertedWith(
        "AetherisVesting: not revocable"
      );
    });

    it("Should fail to revoke already revoked schedule", async function () {
      await vesting.revoke(beneficiary.address);

      await expect(vesting.revoke(beneficiary.address)).to.be.revertedWith(
        "AetherisVesting: already revoked"
      );
    });

    it("Should fail if not owner", async function () {
      await expect(
        vesting.connect(beneficiary).revoke(beneficiary.address)
      ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
    });

    it("Should prevent release after revoke", async function () {
      await vesting.revoke(beneficiary.address);

      await expect(vesting.release(beneficiary.address)).to.be.revertedWith(
        "AetherisVesting: revoked"
      );
    });
  });

  describe("Emergency Withdraw", function () {
    it("Should allow owner to emergency withdraw non-vesting tokens", async function () {
      // Send some extra tokens to vesting contract
      const extraAmount = ethers.parseEther("1000");
      await token.transfer(await vesting.getAddress(), extraAmount);

      await vesting.emergencyWithdraw(await token.getAddress(), extraAmount);

      expect(await token.balanceOf(owner.address)).to.be.gt(0);
    });

    it("Should fail to withdraw vesting tokens", async function () {
      const startTime = await time.latest();

      await vesting.createVestingSchedule(
        beneficiary.address,
        VESTING_AMOUNT,
        startTime,
        CLIFF_DURATION,
        VESTING_DURATION,
        false
      );

      await expect(
        vesting.emergencyWithdraw(await token.getAddress(), VESTING_AMOUNT)
      ).to.be.revertedWith("AetherisVesting: insufficient non-vesting balance");
    });

    it("Should only allow owner", async function () {
      await expect(
        vesting
          .connect(beneficiary)
          .emergencyWithdraw(await token.getAddress(), 100)
      ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
    });
  });
});
