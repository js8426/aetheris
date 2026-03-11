// Aetheris\aetheris-protocol\test\AetherisTimelock.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { AetherisTimelock, AetherisToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AetherisTimelock", function () {
  let timelock: AetherisTimelock;
  let token: AetherisToken;
  let admin: SignerWithAddress;
  let proposer: SignerWithAddress;
  let executor: SignerWithAddress;
  let user: SignerWithAddress;

  const MIN_DELAY = 172800; // 48 hours in seconds

  beforeEach(async function () {
    [admin, proposer, executor, user] = await ethers.getSigners();

    // Deploy test token
    const AetherisToken = await ethers.getContractFactory("AetherisToken");
    token = await AetherisToken.deploy();
    await token.waitForDeployment();

    // Deploy timelock
    const AetherisTimelock = await ethers.getContractFactory("AetherisTimelock");
    timelock = await AetherisTimelock.deploy(
      MIN_DELAY,
      [proposer.address],
      [executor.address],
      admin.address
    );
    await timelock.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set correct min delay", async function () {
      expect(await timelock.getMinDelay()).to.equal(MIN_DELAY);
    });

    it("Should grant proposer role", async function () {
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
      expect(await timelock.hasRole(PROPOSER_ROLE, proposer.address)).to.be.true;
    });

    it("Should grant executor role", async function () {
      const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
      expect(await timelock.hasRole(EXECUTOR_ROLE, executor.address)).to.be.true;
    });

    it("Should grant admin role", async function () {
      const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
      expect(await timelock.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should grant canceller role to proposers", async function () {
      const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
      expect(await timelock.hasRole(CANCELLER_ROLE, proposer.address)).to.be.true;
    });
  });

  describe("Operation Scheduling", function () {
    let target: string;
    let value: bigint;
    let data: string;
    let predecessor: string;
    let salt: string;
    let operationId: string;

    beforeEach(async function () {
      target = await token.getAddress();
      value = 0n;
      data = token.interface.encodeFunctionData("transfer", [user.address, 1000]);
      predecessor = ethers.ZeroHash;
      salt = ethers.id("salt1");

      operationId = await timelock.hashOperation(
        target,
        value,
        data,
        predecessor,
        salt
      );

      // Transfer tokens to timelock
      await token.transfer(await timelock.getAddress(), ethers.parseEther("10000"));
    });

    it("Should schedule an operation", async function () {
      await expect(
        timelock.connect(proposer).schedule(
          target,
          value,
          data,
          predecessor,
          salt,
          MIN_DELAY
        )
      ).to.emit(timelock, "CallScheduled");
    });

    it("Should fail if not proposer", async function () {
      await expect(
        timelock.connect(user).schedule(
          target,
          value,
          data,
          predecessor,
          salt,
          MIN_DELAY
        )
      ).to.be.reverted;
    });

    it("Should set correct timestamp", async function () {
      await timelock.connect(proposer).schedule(
        target,
        value,
        data,
        predecessor,
        salt,
        MIN_DELAY
      );

      const timestamp = await timelock.getTimestamp(operationId);
      const currentTime = await time.latest();
      
      expect(timestamp).to.equal(currentTime + MIN_DELAY);
    });

    it("Should mark operation as pending", async function () {
      await timelock.connect(proposer).schedule(
        target,
        value,
        data,
        predecessor,
        salt,
        MIN_DELAY
      );

      expect(await timelock.isOperationPending(operationId)).to.be.true;
      expect(await timelock.isOperationReady(operationId)).to.be.false;
      expect(await timelock.isOperationDone(operationId)).to.be.false;
    });
  });

  describe("Operation Execution", function () {
    let target: string;
    let value: bigint;
    let data: string;
    let predecessor: string;
    let salt: string;

    beforeEach(async function () {
      target = await token.getAddress();
      value = 0n;
      data = token.interface.encodeFunctionData("transfer", [user.address, ethers.parseEther("1000")]);
      predecessor = ethers.ZeroHash;
      salt = ethers.id("salt1");

      // Transfer tokens to timelock
      await token.transfer(await timelock.getAddress(), ethers.parseEther("10000"));

      // Schedule operation
      await timelock.connect(proposer).schedule(
        target,
        value,
        data,
        predecessor,
        salt,
        MIN_DELAY
      );
    });

    it("Should fail to execute before delay", async function () {
      await expect(
        timelock.connect(executor).execute(
          target,
          value,
          data,
          predecessor,
          salt
        )
      ).to.be.reverted;
    });

    it("Should execute after delay", async function () {
      await time.increase(MIN_DELAY + 1);

      await expect(
        timelock.connect(executor).execute(
          target,
          value,
          data,
          predecessor,
          salt
        )
      ).to.emit(timelock, "CallExecuted");
    });

    it("Should actually execute the operation", async function () {
      await time.increase(MIN_DELAY + 1);

      const balanceBefore = await token.balanceOf(user.address);

      await timelock.connect(executor).execute(
        target,
        value,
        data,
        predecessor,
        salt
      );

      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1000"));
    });

    it("Should mark operation as done", async function () {
      await time.increase(MIN_DELAY + 1);

      await timelock.connect(executor).execute(
        target,
        value,
        data,
        predecessor,
        salt
      );

      const operationId = await timelock.hashOperation(
        target,
        value,
        data,
        predecessor,
        salt
      );

      expect(await timelock.isOperationDone(operationId)).to.be.true;
      expect(await timelock.isOperationPending(operationId)).to.be.false;
    });

    it("Should fail to execute twice", async function () {
      await time.increase(MIN_DELAY + 1);

      await timelock.connect(executor).execute(
        target,
        value,
        data,
        predecessor,
        salt
      );

      await expect(
        timelock.connect(executor).execute(
          target,
          value,
          data,
          predecessor,
          salt
        )
      ).to.be.reverted;
    });

    it("Should fail if not executor", async function () {
      await time.increase(MIN_DELAY + 1);

      await expect(
        timelock.connect(user).execute(
          target,
          value,
          data,
          predecessor,
          salt
        )
      ).to.be.reverted;
    });
  });

  describe("Operation Cancellation", function () {
    let target: string;
    let value: bigint;
    let data: string;
    let predecessor: string;
    let salt: string;
    let operationId: string;

    beforeEach(async function () {
      target = await token.getAddress();
      value = 0n;
      data = token.interface.encodeFunctionData("transfer", [user.address, 1000]);
      predecessor = ethers.ZeroHash;
      salt = ethers.id("salt1");

      operationId = await timelock.hashOperation(
        target,
        value,
        data,
        predecessor,
        salt
      );

      await timelock.connect(proposer).schedule(
        target,
        value,
        data,
        predecessor,
        salt,
        MIN_DELAY
      );
    });

    it("Should cancel an operation", async function () {
      await expect(
        timelock.connect(proposer).cancel(operationId)
      ).to.emit(timelock, "Cancelled");
    });

    it("Should fail if not canceller", async function () {
      await expect(
        timelock.connect(user).cancel(operationId)
      ).to.be.reverted;
    });

    it("Should prevent execution after cancellation", async function () {
      await timelock.connect(proposer).cancel(operationId);

      await time.increase(MIN_DELAY + 1);

      await expect(
        timelock.connect(executor).execute(
          target,
          value,
          data,
          predecessor,
          salt
        )
      ).to.be.reverted;
    });
  });

  describe("Batch Operations", function () {
    it("Should schedule batch operations", async function () {
      const targets = [
        await token.getAddress(),
        await token.getAddress()
      ];
      const values = [0n, 0n];
      const datas = [
        token.interface.encodeFunctionData("transfer", [user.address, 1000]),
        token.interface.encodeFunctionData("transfer", [user.address, 2000])
      ];
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("batchSalt");

      await token.transfer(await timelock.getAddress(), ethers.parseEther("10000"));

      await expect(
        timelock.connect(proposer).scheduleBatch(
          targets,
          values,
          datas,
          predecessor,
          salt,
          MIN_DELAY
        )
      ).to.emit(timelock, "CallScheduled");
    });

    it("Should execute batch operations", async function () {
      const targets = [
        await token.getAddress(),
        await token.getAddress()
      ];
      const values = [0n, 0n];
      const datas = [
        token.interface.encodeFunctionData("transfer", [user.address, ethers.parseEther("1000")]),
        token.interface.encodeFunctionData("transfer", [user.address, ethers.parseEther("2000")])
      ];
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("batchSalt");

      await token.transfer(await timelock.getAddress(), ethers.parseEther("10000"));

      await timelock.connect(proposer).scheduleBatch(
        targets,
        values,
        datas,
        predecessor,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY + 1);

      const balanceBefore = await token.balanceOf(user.address);

      await timelock.connect(executor).executeBatch(
        targets,
        values,
        datas,
        predecessor,
        salt
      );

      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("3000"));
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant roles", async function () {
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

      await timelock.connect(admin).grantRole(PROPOSER_ROLE, user.address);

      expect(await timelock.hasRole(PROPOSER_ROLE, user.address)).to.be.true;
    });

    it("Should allow admin to revoke roles", async function () {
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

      await timelock.connect(admin).revokeRole(PROPOSER_ROLE, proposer.address);

      expect(await timelock.hasRole(PROPOSER_ROLE, proposer.address)).to.be.false;
    });

    it("Should prevent non-admin from granting roles", async function () {
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

      await expect(
        timelock.connect(user).grantRole(PROPOSER_ROLE, user.address)
      ).to.be.reverted;
    });
  });

  describe("Delay Management", function () {
    it("Should allow updating minimum delay", async function () {
      const newDelay = 86400; // 24 hours
      
      const target = await timelock.getAddress();
      const value = 0n;
      const data = timelock.interface.encodeFunctionData("updateDelay", [newDelay]);
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("updateDelaySalt");

      await timelock.connect(proposer).schedule(
        target,
        value,
        data,
        predecessor,
        salt,
        MIN_DELAY
      );

      await time.increase(MIN_DELAY + 1);

      await timelock.connect(executor).execute(
        target,
        value,
        data,
        predecessor,
        salt
      );

      expect(await timelock.getMinDelay()).to.equal(newDelay);
    });
  });
});