// Aetheris\aetheris-protocol\test\AetherisAccount.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AetherisAccount", function () {
  let factory: any;
  let account: any;
  let entryPointAddress: string;

  let owner: SignerWithAddress;
  let newOwner: SignerWithAddress;
  let guardian1: SignerWithAddress;
  let guardian2: SignerWithAddress;
  let sessionKeySigner: SignerWithAddress;
  let attacker: SignerWithAddress;
  let recipient: SignerWithAddress;

  beforeEach(async function () {
    [owner, newOwner, guardian1, guardian2, sessionKeySigner, attacker, recipient] =
      await ethers.getSigners();

    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    const entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();
    entryPointAddress = await entryPoint.getAddress();

    const Factory = await ethers.getContractFactory("AetherisAccountFactory");
    factory = await Factory.deploy(entryPointAddress);
    await factory.waitForDeployment();

    const salt = 0;
    await (await factory.createAccount(owner.address, salt)).wait();

    // NOTE: use getAccountAddress (not getAddress) to avoid ethers.js v6 collision
    const accountAddress = await factory.getAccountAddress(owner.address, salt);
    account = await ethers.getContractAt("AetherisAccount", accountAddress);

    await owner.sendTransaction({
      to: accountAddress,
      value: ethers.parseEther("1"),
    });
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await account.owner()).to.equal(owner.address);
    });

    it("Should return the correct EntryPoint address", async function () {
      expect(await account.entryPoint()).to.equal(entryPointAddress);
    });

    it("Factory should predict the same address as the deployed account", async function () {
      const predicted = await factory.getAccountAddress(owner.address, 0);
      expect(predicted).to.equal(await account.getAddress());
    });

    it("Factory should return different addresses for different salts", async function () {
      const addr0 = await factory.getAccountAddress(owner.address, 0);
      const addr1 = await factory.getAccountAddress(owner.address, 1);
      expect(addr0).to.not.equal(addr1);
    });

    it("Should not emit AccountCreated on second createAccount for same owner + salt", async function () {
      const tx = await factory.createAccount(owner.address, 0);
      const receipt = await tx.wait();
      const factoryIface = (await ethers.getContractFactory("AetherisAccountFactory")).interface;
      const events = receipt?.logs
        .map((log: any) => { try { return factoryIface.parseLog(log); } catch { return null; } })
        .filter((e: any) => e?.name === "AccountCreated");
      expect(events?.length).to.equal(0);
    });

    it("Implementation should have initializers disabled", async function () {
      const implAddress = await factory.accountImplementation();
      const impl = await ethers.getContractAt("AetherisAccount", implAddress);
      await expect(impl.initialize(owner.address)).to.be.revertedWithCustomError(impl, "InvalidInitialization");
    });
  });

  describe("Ownership", function () {
    it("Should allow owner to transfer ownership", async function () {
      await expect(account.connect(owner).transferOwnership(newOwner.address))
        .to.emit(account, "OwnershipTransferred")
        .withArgs(owner.address, newOwner.address);
      expect(await account.owner()).to.equal(newOwner.address);
    });

    it("Should reject transferOwnership from non-owner", async function () {
      await expect(account.connect(attacker).transferOwnership(attacker.address))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("Should reject transferOwnership to zero address", async function () {
      await expect(account.connect(owner).transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(account, "InvalidOwner");
    });
  });

  describe("Execute", function () {
    it("Should allow owner to send ETH via execute()", async function () {
      const before = await ethers.provider.getBalance(recipient.address);
      await account.connect(owner).execute(recipient.address, ethers.parseEther("0.1"), "0x");
      const after = await ethers.provider.getBalance(recipient.address);
      expect(after - before).to.equal(ethers.parseEther("0.1"));
    });

    it("Should emit Executed event", async function () {
      await expect(account.connect(owner).execute(recipient.address, ethers.parseEther("0.1"), "0x"))
        .to.emit(account, "Executed");
    });

    it("Should reject execute from non-owner", async function () {
      await expect(account.connect(attacker).execute(recipient.address, 0n, "0x"))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("Should propagate revert from a failing target call", async function () {
      const Token = await ethers.getContractFactory("AetherisToken");
      const token = await Token.deploy();
      await token.waitForDeployment();
      const badCalldata = token.interface.encodeFunctionData("transfer", [
        recipient.address,
        ethers.parseEther("999999999999"),
      ]);
      await expect(account.connect(owner).execute(await token.getAddress(), 0, badCalldata))
        .to.be.reverted;
    });
  });

  describe("Execute Batch", function () {
    it("Should execute a batch of ETH sends", async function () {
      const before1 = await ethers.provider.getBalance(recipient.address);
      const before2 = await ethers.provider.getBalance(guardian1.address);
      await account.connect(owner).executeBatch(
        [recipient.address, guardian1.address],
        [ethers.parseEther("0.1"), ethers.parseEther("0.2")],
        ["0x", "0x"]
      );
      expect((await ethers.provider.getBalance(recipient.address)) - before1).to.equal(ethers.parseEther("0.1"));
      expect((await ethers.provider.getBalance(guardian1.address)) - before2).to.equal(ethers.parseEther("0.2"));
    });

    it("Should revert if array lengths mismatch", async function () {
      await expect(account.connect(owner).executeBatch([recipient.address], [0n, 0n], ["0x"]))
        .to.be.revertedWith("AetherisAccount: length mismatch");
    });

    it("Should reject batch from non-owner", async function () {
      await expect(account.connect(attacker).executeBatch([recipient.address], [0n], ["0x"]))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });
  });

  describe("Session Keys", function () {
    let validUntil: number;

    beforeEach(async function () {
      const block = await ethers.provider.getBlock("latest");
      validUntil = block!.timestamp + 3600;
    });

    it("Should add a session key", async function () {
      await expect(account.connect(owner).addSessionKey(sessionKeySigner.address, validUntil))
        .to.emit(account, "SessionKeyAdded")
        .withArgs(sessionKeySigner.address, validUntil);
      const key = await account.sessionKeys(sessionKeySigner.address);
      expect(key.isActive).to.be.true;
    });

    it("Should reject addSessionKey from non-owner", async function () {
      await expect(account.connect(attacker).addSessionKey(sessionKeySigner.address, validUntil))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("Should reject a past expiry", async function () {
      await expect(account.connect(owner).addSessionKey(sessionKeySigner.address, Math.floor(Date.now() / 1000) - 1000))
        .to.be.revertedWith("Invalid expiry");
    });

    it("Should reject zero address session key", async function () {
      await expect(account.connect(owner).addSessionKey(ethers.ZeroAddress, validUntil))
        .to.be.revertedWith("Invalid session key");
    });

    it("Should revoke a session key", async function () {
      await account.connect(owner).addSessionKey(sessionKeySigner.address, validUntil);
      await expect(account.connect(owner).revokeSessionKey(sessionKeySigner.address))
        .to.emit(account, "SessionKeyRevoked")
        .withArgs(sessionKeySigner.address);
      expect((await account.sessionKeys(sessionKeySigner.address)).isActive).to.be.false;
    });

    it("Should revert revokeSessionKey for unknown key", async function () {
      await expect(account.connect(owner).revokeSessionKey(sessionKeySigner.address))
        .to.be.revertedWithCustomError(account, "SessionKeyNotFound");
    });

    it("Should reject revokeSessionKey from non-owner", async function () {
      await account.connect(owner).addSessionKey(sessionKeySigner.address, validUntil);
      await expect(account.connect(attacker).revokeSessionKey(sessionKeySigner.address))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });
  });

  describe("Guardian Management", function () {
    it("Should add a guardian", async function () {
      await expect(account.connect(owner).addGuardian(guardian1.address))
        .to.emit(account, "GuardianAdded")
        .withArgs(guardian1.address);
      expect(await account.guardians(guardian1.address)).to.be.true;
    });

    it("Should reject zero address as guardian", async function () {
      await expect(account.connect(owner).addGuardian(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(account, "InvalidGuardian");
    });

    it("Should reject owner as guardian", async function () {
      await expect(account.connect(owner).addGuardian(owner.address))
        .to.be.revertedWithCustomError(account, "InvalidGuardian");
    });

    it("Should reject duplicate guardian", async function () {
      await account.connect(owner).addGuardian(guardian1.address);
      await expect(account.connect(owner).addGuardian(guardian1.address))
        .to.be.revertedWithCustomError(account, "InvalidGuardian");
    });

    it("Should reject addGuardian from non-owner", async function () {
      await expect(account.connect(attacker).addGuardian(guardian1.address))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("Should remove a guardian", async function () {
      await account.connect(owner).addGuardian(guardian1.address);
      await expect(account.connect(owner).removeGuardian(guardian1.address))
        .to.emit(account, "GuardianRemoved")
        .withArgs(guardian1.address);
      expect(await account.guardians(guardian1.address)).to.be.false;
    });

    it("Should reject removing non-existent guardian", async function () {
      await expect(account.connect(owner).removeGuardian(guardian1.address))
        .to.be.revertedWithCustomError(account, "InvalidGuardian");
    });
  });

  describe("Recovery Flow", function () {
    beforeEach(async function () {
      await account.connect(owner).addGuardian(guardian1.address);
      await account.connect(owner).addGuardian(guardian2.address);
    });

    it("Should initiate recovery on first guardian approval", async function () {
      await expect(account.connect(guardian1).approveRecovery(newOwner.address))
        .to.emit(account, "RecoveryInitiated");
    });

    it("Should count two guardian approvals", async function () {
      await account.connect(guardian1).approveRecovery(newOwner.address);
      await account.connect(guardian2).approveRecovery(newOwner.address);
      expect((await account.pendingRecovery()).guardiansApproved).to.equal(2n);
    });

    it("Should not count the same guardian twice", async function () {
      await account.connect(guardian1).approveRecovery(newOwner.address);
      await account.connect(guardian1).approveRecovery(newOwner.address);
      expect((await account.pendingRecovery()).guardiansApproved).to.equal(1n);
    });

    it("Should reject approveRecovery from non-guardian", async function () {
      await expect(account.connect(attacker).approveRecovery(newOwner.address))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("Should execute recovery after timelock + 2 approvals", async function () {
      await account.connect(guardian1).approveRecovery(newOwner.address);
      await account.connect(guardian2).approveRecovery(newOwner.address);
      await ethers.provider.send("evm_increaseTime", [48 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(account.executeRecovery()).to.emit(account, "RecoveryExecuted").withArgs(newOwner.address);
      expect(await account.owner()).to.equal(newOwner.address);
    });

    it("Should reject executeRecovery before timelock expires", async function () {
      await account.connect(guardian1).approveRecovery(newOwner.address);
      await account.connect(guardian2).approveRecovery(newOwner.address);
      await expect(account.executeRecovery()).to.be.revertedWithCustomError(account, "RecoveryNotReady");
    });

    it("Should reject executeRecovery with only 1 approval", async function () {
      await account.connect(guardian1).approveRecovery(newOwner.address);
      await ethers.provider.send("evm_increaseTime", [48 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(account.executeRecovery()).to.be.revertedWithCustomError(account, "InsufficientGuardians");
    });

    it("Should reject executeRecovery with nothing pending", async function () {
      await expect(account.executeRecovery()).to.be.revertedWithCustomError(account, "NoRecoveryPending");
    });

    it("Should allow owner to cancel recovery", async function () {
      await account.connect(guardian1).approveRecovery(newOwner.address);
      await expect(account.connect(owner).cancelRecovery()).to.emit(account, "RecoveryCancelled");
      expect((await account.pendingRecovery()).executeAfter).to.equal(0n);
    });

    it("Should reject cancelRecovery from non-owner", async function () {
      await account.connect(guardian1).approveRecovery(newOwner.address);
      await expect(account.connect(attacker).cancelRecovery())
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });

    it("Should reject cancelRecovery with nothing pending", async function () {
      await expect(account.connect(owner).cancelRecovery())
        .to.be.revertedWithCustomError(account, "NoRecoveryPending");
    });
  });

  describe("Deposit & Withdrawal", function () {
    it("Should accept ETH via receive()", async function () {
      const before = await ethers.provider.getBalance(await account.getAddress());
      await owner.sendTransaction({ to: await account.getAddress(), value: ethers.parseEther("0.5") });
      const after = await ethers.provider.getBalance(await account.getAddress());
      expect(after - before).to.equal(ethers.parseEther("0.5"));
    });

    it("Should allow owner to withdraw ERC20 tokens", async function () {
      const Token = await ethers.getContractFactory("AetherisToken");
      const token = await Token.deploy();
      await token.waitForDeployment();
      const amount = ethers.parseEther("1000");
      await token.transfer(await account.getAddress(), amount);
      const before = await token.balanceOf(recipient.address);
      await account.connect(owner).withdrawToken(await token.getAddress(), recipient.address, amount);
      expect(await token.balanceOf(recipient.address) - before).to.equal(amount);
    });

    it("Should reject withdrawToken from non-owner", async function () {
      const Token = await ethers.getContractFactory("AetherisToken");
      const token = await Token.deploy();
      await token.waitForDeployment();
      await expect(account.connect(attacker).withdrawToken(await token.getAddress(), attacker.address, 1))
        .to.be.revertedWithCustomError(account, "NotAuthorized");
    });
  });

  describe("Factory — Counterfactual Address", function () {
    it("Should predict address before deployment", async function () {
      const predicted = await factory.getAccountAddress(guardian1.address, 42);
      await factory.createAccount(guardian1.address, 42);
      expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");
    });

    it("Should emit AccountCreated on first deploy", async function () {
      await expect(factory.createAccount(guardian1.address, 99)).to.emit(factory, "AccountCreated");
    });

    it("Should produce different addresses for different owners at same salt", async function () {
      expect(await factory.getAccountAddress(guardian1.address, 0))
        .to.not.equal(await factory.getAccountAddress(guardian2.address, 0));
    });
  });
});