// Aetheris\aetheris-protocol\test\AA.Integration.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AetherisAccount,
  AetherisAccountFactory,
  AetherisStaking,
  AetherisToken,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Priority 2 Integration Tests — Account Abstraction
 *
 * NOTE: On a local Hardhat network the canonical EntryPoint address has no
 * code, so we deploy a real EntryPoint locally in every beforeEach using the
 * artifact compiled from contracts/test/EntryPointWrapper.sol.
 */

describe("AA Integration Tests — Account Abstraction", function () {
  let factory: AetherisAccountFactory;
  let account: AetherisAccount;
  let staking: AetherisStaking;
  let ax: AetherisToken;
  let usdc: AetherisToken;
  let entryPointAddress: string;

  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let guardian1: SignerWithAddress;
  let guardian2: SignerWithAddress;
  let recipient: SignerWithAddress;

  beforeEach(async function () {
    [owner, user1, user2, guardian1, guardian2, recipient] =
      await ethers.getSigners();

    // Deploy a real EntryPoint locally — required for factory + paymaster constructors
    const EntryPoint = await ethers.getContractFactory("EntryPoint");
    const entryPoint = await EntryPoint.deploy();
    await entryPoint.waitForDeployment();
    entryPointAddress = await entryPoint.getAddress();

    // Tokens
    const AetherisToken = await ethers.getContractFactory("AetherisToken");
    ax = await AetherisToken.deploy();
    await ax.waitForDeployment();

    usdc = await AetherisToken.deploy();
    await usdc.waitForDeployment();

    // Staking
    const Staking = await ethers.getContractFactory("AetherisStaking");
    staking = await Staking.deploy(
      await ax.getAddress(),
      await usdc.getAddress()
    );
    await staking.waitForDeployment();

    // Factory + smart account for user1
    const Factory = await ethers.getContractFactory("AetherisAccountFactory");
    factory = await Factory.deploy(entryPointAddress);
    await factory.waitForDeployment();

    await factory.createAccount(user1.address, 0);
    const accountAddress = await factory.getAccountAddress(user1.address, 0);
    account = await ethers.getContractAt("AetherisAccount", accountAddress);

    // Fund the smart account
    await owner.sendTransaction({
      to: accountAddress,
      value: ethers.parseEther("2"),
    });

    // Give user1 some tokens
    await ax.transfer(user1.address, ethers.parseEther("200000"));
    await usdc.transfer(user1.address, ethers.parseEther("10000"));
  });

  /*//////////////////////////////////////////////////////////////
      JOURNEY 1: Smart Account + Staking Tier Discount
  //////////////////////////////////////////////////////////////*/

  describe("Journey 1: Smart Account + Staking Tier Discount", function () {
    it("Should correctly reflect staking tier for a staking EOA", async function () {
      const stakeAmount = ethers.parseEther("10000"); // Silver
      await ax.connect(user1).approve(await staking.getAddress(), stakeAmount);
      await staking.connect(user1).stake(stakeAmount);

      expect(await staking.getTier(user1.address)).to.equal("Silver");
      expect(await staking.getDiscount(user1.address)).to.equal(2500n);

      console.log("✓ User1 EOA is Silver tier with 25% discount");
    });

    it("Smart account can stake AX via execute() and reach Gold tier", async function () {
      const stakeAmount = ethers.parseEther("100000");
      await ax.transfer(await account.getAddress(), stakeAmount);

      const approveCalldata = ax.interface.encodeFunctionData("approve", [
        await staking.getAddress(),
        stakeAmount,
      ]);
      const stakeCalldata = staking.interface.encodeFunctionData("stake", [
        stakeAmount,
      ]);

      await account.connect(user1).execute(await ax.getAddress(), 0, approveCalldata);
      await account.connect(user1).execute(await staking.getAddress(), 0, stakeCalldata);

      const staked = await staking.stakedBalance(await account.getAddress());
      expect(staked).to.equal(stakeAmount);
      expect(await staking.getTier(await account.getAddress())).to.equal("Gold");

      console.log("✓ Smart account staked AX to Gold tier via execute()");
    });
  });

  /*//////////////////////////////////////////////////////////////
      JOURNEY 2: Batch ERC20 Transfers
  //////////////////////////////////////////////////////////////*/

  describe("Journey 2: Batch ERC20 Transfers via Smart Account", function () {
    it("Should execute multiple token transfers in a single batch", async function () {
      const totalAmount = ethers.parseEther("3000");
      await usdc.transfer(await account.getAddress(), totalAmount);

      const amount1 = ethers.parseEther("1000");
      const amount2 = ethers.parseEther("2000");

      const calldata1 = usdc.interface.encodeFunctionData("transfer", [recipient.address, amount1]);
      const calldata2 = usdc.interface.encodeFunctionData("transfer", [user2.address, amount2]);

      const bal1Before = await usdc.balanceOf(recipient.address);
      const bal2Before = await usdc.balanceOf(user2.address);

      await account.connect(user1).executeBatch(
        [await usdc.getAddress(), await usdc.getAddress()],
        [0n, 0n],
        [calldata1, calldata2]
      );

      expect(await usdc.balanceOf(recipient.address) - bal1Before).to.equal(amount1);
      expect(await usdc.balanceOf(user2.address) - bal2Before).to.equal(amount2);

      console.log("✓ Batch transfer of 1000 + 2000 USDC executed in one tx");
    });

    it("Should revert the entire batch if any call fails", async function () {
      await usdc.transfer(await account.getAddress(), ethers.parseEther("500"));

      const tooMuch = usdc.interface.encodeFunctionData("transfer", [
        recipient.address,
        ethers.parseEther("2000"), // more than balance
      ]);

      await expect(
        account.connect(user1).executeBatch(
          [await usdc.getAddress()],
          [0n],
          [tooMuch]
        )
      ).to.be.reverted;
    });
  });

  /*//////////////////////////////////////////////////////////////
      JOURNEY 3: Social Recovery → New Owner Operates Account
  //////////////////////////////////////////////////////////////*/

  describe("Journey 3: Social Recovery then New Owner Operates Account", function () {
    it("Should complete full recovery and allow new owner to execute", async function () {
      await account.connect(user1).addGuardian(guardian1.address);
      await account.connect(user1).addGuardian(guardian2.address);

      await account.connect(guardian1).approveRecovery(user2.address);
      await account.connect(guardian2).approveRecovery(user2.address);

      await ethers.provider.send("evm_increaseTime", [48 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);

      await account.executeRecovery();
      expect(await account.owner()).to.equal(user2.address);

      console.log("✓ Ownership transferred to user2 via social recovery");

      const balBefore = await ethers.provider.getBalance(recipient.address);
      await account.connect(user2).execute(recipient.address, ethers.parseEther("0.5"), "0x");
      const balAfter = await ethers.provider.getBalance(recipient.address);

      expect(balAfter - balBefore).to.equal(ethers.parseEther("0.5"));

      console.log("✓ New owner (user2) successfully executed a call");
    });

    it("Old owner cannot execute after recovery", async function () {
      await account.connect(user1).addGuardian(guardian1.address);
      await account.connect(user1).addGuardian(guardian2.address);
      await account.connect(guardian1).approveRecovery(user2.address);
      await account.connect(guardian2).approveRecovery(user2.address);

      await ethers.provider.send("evm_increaseTime", [48 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      await account.executeRecovery();

      await expect(
        account.connect(user1).execute(recipient.address, ethers.parseEther("0.1"), "0x")
      ).to.be.revertedWithCustomError(account, "NotAuthorized");

      console.log("✓ Old owner correctly rejected after recovery");
    });
  });

  /*//////////////////////////////////////////////////////////////
      JOURNEY 4: Session Key Lifecycle
  //////////////////////////////////////////////////////////////*/

  describe("Journey 4: Session Key Lifecycle", function () {
    it("Should add a session key and confirm it is stored correctly", async function () {
      const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
      const [, , , , , , dapp] = await ethers.getSigners();

      await account.connect(user1).addSessionKey(dapp.address, expiry);

      const key = await account.sessionKeys(dapp.address);
      expect(key.isActive).to.be.true;
      expect(key.validUntil).to.equal(BigInt(expiry));

      console.log("✓ Session key added with correct expiry");
    });

    it("Should revoke a session key", async function () {
      const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
      const [, , , , , , dapp] = await ethers.getSigners();

      await account.connect(user1).addSessionKey(dapp.address, expiry);
      await account.connect(user1).revokeSessionKey(dapp.address);

      const key = await account.sessionKeys(dapp.address);
      expect(key.isActive).to.be.false;

      console.log("✓ Session key revoked successfully");
    });
  });

  /*//////////////////////////////////////////////////////////////
      JOURNEY 5: Multiple Smart Accounts from One Factory
  //////////////////////////////////////////////////////////////*/

  describe("Journey 5: Multiple Smart Accounts from One Factory", function () {
    it("Should deploy separate accounts for user1 and user2 with correct owners", async function () {
      await factory.createAccount(user2.address, 0);

      const addr1 = await factory.getAccountAddress(user1.address, 0);
      const addr2 = await factory.getAccountAddress(user2.address, 0);
      expect(addr1).to.not.equal(addr2);

      const account1 = await ethers.getContractAt("AetherisAccount", addr1);
      const account2 = await ethers.getContractAt("AetherisAccount", addr2);

      expect(await account1.owner()).to.equal(user1.address);
      expect(await account2.owner()).to.equal(user2.address);

      console.log("✓ Two separate smart accounts deployed with correct owners");
    });

    it("Should prevent cross-account access", async function () {
      await factory.createAccount(user2.address, 0);
      const addr2 = await factory.getAccountAddress(user2.address, 0);
      const account2 = await ethers.getContractAt("AetherisAccount", addr2);

      await owner.sendTransaction({ to: await account.getAddress(), value: ethers.parseEther("0.5") });
      await owner.sendTransaction({ to: addr2, value: ethers.parseEther("0.5") });

      // user2 cannot control account1
      await expect(
        account.connect(user2).execute(recipient.address, 1n, "0x")
      ).to.be.revertedWithCustomError(account, "NotAuthorized");

      // user1 cannot control account2
      await expect(
        account2.connect(user1).execute(recipient.address, 1n, "0x")
      ).to.be.revertedWithCustomError(account2, "NotAuthorized");

      console.log("✓ Accounts are fully isolated — no cross-account access");
    });
  });

  /*//////////////////////////////////////////////////////////////
      JOURNEY 6: Smart Account as DeFi Actor
  //////////////////////////////////////////////////////////////*/

  describe("Journey 6: Smart Account as DeFi Actor", function () {
    it("Should allow smart account to approve a contract to spend its tokens", async function () {
      const amount = ethers.parseEther("50000");
      await ax.transfer(await account.getAddress(), amount);

      const approveCalldata = ax.interface.encodeFunctionData("approve", [
        await staking.getAddress(),
        amount,
      ]);
      await account.connect(user1).execute(await ax.getAddress(), 0, approveCalldata);

      const allowance = await ax.allowance(
        await account.getAddress(),
        await staking.getAddress()
      );
      expect(allowance).to.equal(amount);

      console.log("✓ Smart account approved staking contract to spend AX");
    });

    it("Should send ETH to multiple recipients in one batch tx", async function () {
      const targets = [recipient.address, guardian1.address, guardian2.address];
      const values = [
        ethers.parseEther("0.1"),
        ethers.parseEther("0.2"),
        ethers.parseEther("0.3"),
      ];
      const calldatas = ["0x", "0x", "0x"];

      const bals = await Promise.all(targets.map((t) => ethers.provider.getBalance(t)));

      await account.connect(user1).executeBatch(targets, values, calldatas);

      const newBals = await Promise.all(targets.map((t) => ethers.provider.getBalance(t)));

      expect(newBals[0] - bals[0]).to.equal(ethers.parseEther("0.1"));
      expect(newBals[1] - bals[1]).to.equal(ethers.parseEther("0.2"));
      expect(newBals[2] - bals[2]).to.equal(ethers.parseEther("0.3"));

      console.log("✓ Smart account sent ETH to 3 recipients in one batch tx");
    });
  });

  after(function () {
    console.log("\n========== AA INTEGRATION TESTS COMPLETE ==========");
    console.log("✓ Factory deployment and counterfactual addressing");
    console.log("✓ Smart account execution (single + batch)");
    console.log("✓ Session key add/revoke");
    console.log("✓ Social recovery full flow");
    console.log("✓ Multi-account isolation");
    console.log("✓ Smart account as DeFi actor");
    console.log("✓ Staking tier discount integration");
  });
});
