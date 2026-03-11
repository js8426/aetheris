// Aetheris\aetheris-protocol\test\unit\AetherisAccount.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployAccountFixture } from "../helpers/setup";

describe("AetherisAccount", () => {

  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("Deployment", () => {
    it("sets owner correctly after factory deployment", async () => {
      const { account, owner } = await loadFixture(deployAccountFixture);
      expect(await account.owner()).to.equal(owner.address);
    });

    it("points to the correct EntryPoint", async () => {
      const { account, entryPoint } = await loadFixture(deployAccountFixture);
      expect(await account.entryPoint()).to.equal(await entryPoint.getAddress());
    });

    it("factory returns same address for same owner + salt", async () => {
      const { factory, owner } = await loadFixture(deployAccountFixture);
      // ✅ FIXED: getAccountAddress not getAddress
      const addr1 = await factory.getAccountAddress(owner.address, 0n);
      const addr2 = await factory.getAccountAddress(owner.address, 0n);
      expect(addr1).to.equal(addr2);
    });

    it("factory returns different address for different salt", async () => {
      // ✅ FIXED: use pre-deployed second account from fixture
      const { account, accountAddress2 } = await loadFixture(deployAccountFixture);
      expect(await account.getAddress()).to.not.equal(accountAddress2);
    });

    it("createAccount is idempotent — calling twice returns same account", async () => {
      const { factory, owner, account } = await loadFixture(deployAccountFixture);
      // Call createAccount again with same params
      await factory.createAccount(owner.address, 0n);
      // Address must still be the same
      const addr = await factory.getAccountAddress(owner.address, 0n);
      expect(addr).to.equal(await account.getAddress());
      // And it must still be the owner's account
      const acct = await ethers.getContractAt("AetherisAccount", addr);
      expect(await acct.owner()).to.equal(owner.address);
    });
  });

  // ── Session Keys ────────────────────────────────────────────────────────────
  describe("Session Keys", () => {
    it("owner can add a session key", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);
      const latestBlock = await ethers.provider.getBlock("latest");
      const validUntil = latestBlock!.timestamp + 3600;

      await account.connect(owner).addSessionKey(alice.address, validUntil);

      const sessionKey = await account.sessionKeys(alice.address);
      expect(sessionKey.isActive).to.be.true;
      expect(sessionKey.validUntil).to.equal(validUntil);
    });

    it("emits SessionKeyAdded event", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);
      const latestBlock = await ethers.provider.getBlock("latest");
      const validUntil = latestBlock!.timestamp + 3600;

      await expect(account.connect(owner).addSessionKey(alice.address, validUntil))
        .to.emit(account, "SessionKeyAdded")
        .withArgs(alice.address, validUntil);
    });

    it("non-owner cannot add session key", async () => {
      const { account, alice } = await loadFixture(deployAccountFixture);
      const latestBlock = await ethers.provider.getBlock("latest");
      const validUntil = latestBlock!.timestamp + 3600;

      await expect(
        account.connect(alice).addSessionKey(alice.address, validUntil)
      ).to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("reverts when adding session key with past expiry", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);
      const latestBlock = await ethers.provider.getBlock("latest");
      const pastTime = latestBlock!.timestamp - 3600;

      await expect(
        account.connect(owner).addSessionKey(alice.address, pastTime)
      ).to.be.revertedWith("Invalid expiry");
    });

    it("reverts when adding zero address as session key", async () => {
      const { account, owner } = await loadFixture(deployAccountFixture);
      const latestBlock = await ethers.provider.getBlock("latest");
      const validUntil = latestBlock!.timestamp + 3600;

      await expect(
        account.connect(owner).addSessionKey(ethers.ZeroAddress, validUntil)
      ).to.be.revertedWith("Invalid session key");
    });

    it("owner can revoke a session key", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);
      const latestBlock = await ethers.provider.getBlock("latest");
      const validUntil = latestBlock!.timestamp + 3600;

      await account.connect(owner).addSessionKey(alice.address, validUntil);
      await account.connect(owner).revokeSessionKey(alice.address);

      const sessionKey = await account.sessionKeys(alice.address);
      expect(sessionKey.isActive).to.be.false;
    });

    it("emits SessionKeyRevoked event", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);
      const latestBlock = await ethers.provider.getBlock("latest");
      const validUntil = latestBlock!.timestamp + 3600;

      await account.connect(owner).addSessionKey(alice.address, validUntil);
      await expect(account.connect(owner).revokeSessionKey(alice.address))
        .to.emit(account, "SessionKeyRevoked")
        .withArgs(alice.address);
    });

    it("reverts revoking a non-existent session key", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);

      await expect(
        account.connect(owner).revokeSessionKey(alice.address)
      ).to.be.revertedWithCustomError(account, "SessionKeyNotFound");
    });
  });

  // ── Guardians ───────────────────────────────────────────────────────────────
  describe("Guardians", () => {
    it("owner can add a guardian", async () => {
      const { account, owner, guardian1 } = await loadFixture(deployAccountFixture);

      await account.connect(owner).addGuardian(guardian1.address);
      expect(await account.guardians(guardian1.address)).to.be.true;
    });

    it("emits GuardianAdded event", async () => {
      const { account, owner, guardian1 } = await loadFixture(deployAccountFixture);

      await expect(account.connect(owner).addGuardian(guardian1.address))
        .to.emit(account, "GuardianAdded")
        .withArgs(guardian1.address);
    });

    it("non-owner cannot add guardian", async () => {
      const { account, alice, guardian1 } = await loadFixture(deployAccountFixture);

      await expect(
        account.connect(alice).addGuardian(guardian1.address)
      ).to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("cannot add owner as guardian", async () => {
      const { account, owner } = await loadFixture(deployAccountFixture);

      await expect(
        account.connect(owner).addGuardian(owner.address)
      ).to.be.revertedWithCustomError(account, "InvalidGuardian");
    });

    it("cannot add same guardian twice", async () => {
      const { account, owner, guardian1 } = await loadFixture(deployAccountFixture);

      await account.connect(owner).addGuardian(guardian1.address);
      await expect(
        account.connect(owner).addGuardian(guardian1.address)
      ).to.be.revertedWithCustomError(account, "InvalidGuardian");
    });

    it("owner can remove a guardian", async () => {
      const { account, owner, guardian1 } = await loadFixture(deployAccountFixture);

      await account.connect(owner).addGuardian(guardian1.address);
      await account.connect(owner).removeGuardian(guardian1.address);

      expect(await account.guardians(guardian1.address)).to.be.false;
    });

    it("emits GuardianRemoved event", async () => {
      const { account, owner, guardian1 } = await loadFixture(deployAccountFixture);

      await account.connect(owner).addGuardian(guardian1.address);
      await expect(account.connect(owner).removeGuardian(guardian1.address))
        .to.emit(account, "GuardianRemoved")
        .withArgs(guardian1.address);
    });

    it("reverts removing non-existent guardian", async () => {
      const { account, owner, guardian1 } = await loadFixture(deployAccountFixture);

      await expect(
        account.connect(owner).removeGuardian(guardian1.address)
      ).to.be.revertedWithCustomError(account, "InvalidGuardian");
    });
  });

  // ── Execute ──────────────────────────────────────────────────────────────────
  describe("execute()", () => {
    it("owner can execute a call directly", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);

      // Fund the smart account with ETH (send to its address, not owner)
      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("1"),
      });

      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);

      await account.connect(owner).execute(
        alice.address,
        ethers.parseEther("0.1"),
        "0x"
      );

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(ethers.parseEther("0.1"));
    });

    it("emits Executed event", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);

      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("1"),
      });

      await expect(
        account.connect(owner).execute(alice.address, ethers.parseEther("0.1"), "0x")
      ).to.emit(account, "Executed");
    });

    it("non-owner cannot execute directly", async () => {
      const { account, alice } = await loadFixture(deployAccountFixture);

      await expect(
        account.connect(alice).execute(alice.address, 0n, "0x")
      ).to.be.revertedWithCustomError(account, "NotAuthorized");
    });
  });

  // ── executeBatch ─────────────────────────────────────────────────────────────
  describe("executeBatch()", () => {
    it("owner can batch execute multiple calls", async () => {
      const { account, owner, alice, guardian1 } =
        await loadFixture(deployAccountFixture);

      await owner.sendTransaction({
        to: await account.getAddress(),
        value: ethers.parseEther("2"),
      });

      const aliceBefore    = await ethers.provider.getBalance(alice.address);
      const guardianBefore = await ethers.provider.getBalance(guardian1.address);

      await account.connect(owner).executeBatch(
        [alice.address, guardian1.address],
        [ethers.parseEther("0.5"), ethers.parseEther("0.3")],
        ["0x", "0x"]
      );

      expect(await ethers.provider.getBalance(alice.address) - aliceBefore)
        .to.equal(ethers.parseEther("0.5"));
      expect(await ethers.provider.getBalance(guardian1.address) - guardianBefore)
        .to.equal(ethers.parseEther("0.3"));
    });

    it("reverts on array length mismatch", async () => {
      const { account, owner, alice } = await loadFixture(deployAccountFixture);

      await expect(
        account.connect(owner).executeBatch(
          [alice.address],
          [0n, 0n],
          ["0x"]
        )
      ).to.be.revertedWith("AetherisAccount: length mismatch");
    });
  });
});