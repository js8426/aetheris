// Aetheris\aetheris-protocol\test\ProofOfExit.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ProofOfExit", function () {
  let proofOfExit: any;
  let mockToken:   any;
  let mockProtocol: any;

  let governance:  SignerWithAddress;
  let executor:    SignerWithAddress;
  let guardian:    SignerWithAddress;
  let oracle:      SignerWithAddress;
  let coldSafe:    SignerWithAddress;
  let attacker:    SignerWithAddress;
  let user:        SignerWithAddress;

  const THRESHOLD = 75;

  beforeEach(async function () {
    [governance, executor, guardian, oracle, coldSafe, attacker, user] =
      await ethers.getSigners();

    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("AetherisToken");
    mockToken = await Token.deploy();
    await mockToken.waitForDeployment();

    // Deploy mock protocol (just needs to receive calls)
    const MockProtocol = await ethers.getContractFactory("MockProtocolTarget");
    mockProtocol = await MockProtocol.deploy();
    await mockProtocol.waitForDeployment();

    // Deploy ProofOfExit
    const ProofOfExit = await ethers.getContractFactory("ProofOfExit");
    proofOfExit = await ProofOfExit.deploy(
      coldSafe.address,
      executor.address,
      guardian.address,
      oracle.address,
      governance.address,
    );
    await proofOfExit.waitForDeployment();

    // Register token
    await proofOfExit.connect(governance).registerToken(await mockToken.getAddress());

    // Register protocol with a simple withdraw calldata
    const withdrawCalldata = mockProtocol.interface.encodeFunctionData("emergencyWithdraw");
    await proofOfExit.connect(governance).registerProtocol(
      await mockProtocol.getAddress(),
      "Mock Protocol",
      withdrawCalldata,
    );

    // Fund the ProofOfExit contract with tokens and ETH
    await mockToken.transfer(await proofOfExit.getAddress(), ethers.parseEther("1000"));
    await governance.sendTransaction({
      to: await proofOfExit.getAddress(),
      value: ethers.parseEther("1"),
    });
  });

  /*//////////////////////////////////////////////////////////////
                          DEPLOYMENT
  //////////////////////////////////////////////////////////////*/

  describe("Deployment", function () {
    it("Should set immutable Cold Safe address", async function () {
      expect(await proofOfExit.COLD_SAFE()).to.equal(coldSafe.address);
    });

    it("Should set default threat threshold to 75", async function () {
      expect(await proofOfExit.threatThreshold()).to.equal(75n);
    });

    it("Should grant EXECUTOR_ROLE to executor", async function () {
      const role = await proofOfExit.EXECUTOR_ROLE();
      expect(await proofOfExit.hasRole(role, executor.address)).to.be.true;
    });

    it("Should grant GUARDIAN_ROLE to guardian", async function () {
      const role = await proofOfExit.GUARDIAN_ROLE();
      expect(await proofOfExit.hasRole(role, guardian.address)).to.be.true;
    });

    it("Should grant ORACLE_ROLE to oracle", async function () {
      const role = await proofOfExit.ORACLE_ROLE();
      expect(await proofOfExit.hasRole(role, oracle.address)).to.be.true;
    });

    it("Should grant DEFAULT_ADMIN_ROLE to governance", async function () {
      const role = await proofOfExit.DEFAULT_ADMIN_ROLE();
      expect(await proofOfExit.hasRole(role, governance.address)).to.be.true;
    });

    it("Should revert with zero Cold Safe address", async function () {
      const ProofOfExit = await ethers.getContractFactory("ProofOfExit");
      await expect(
        ProofOfExit.deploy(ethers.ZeroAddress, executor.address, guardian.address, oracle.address, governance.address)
      ).to.be.revertedWithCustomError(proofOfExit, "InvalidColdSafe");
    });

    it("Should revert with zero executor address", async function () {
      const ProofOfExit = await ethers.getContractFactory("ProofOfExit");
      await expect(
        ProofOfExit.deploy(coldSafe.address, ethers.ZeroAddress, guardian.address, oracle.address, governance.address)
      ).to.be.revertedWithCustomError(proofOfExit, "ZeroAddress");
    });
  });

  /*//////////////////////////////////////////////////////////////
                      ORACLE — THREAT SCORING
  //////////////////////////////////////////////////////////////*/

  describe("Threat Score Oracle", function () {
    it("Should allow oracle to update threat score", async function () {
      const target = attacker.address;
      await expect(proofOfExit.connect(oracle).updateThreatScore(target, 80))
        .to.emit(proofOfExit, "ThreatScoreUpdated")
        .withArgs(target, 0, 80, (await ethers.provider.getBlock("latest"))!.timestamp + 1);
    });

    it("Should reject threat score update from non-oracle", async function () {
      await expect(proofOfExit.connect(attacker).updateThreatScore(attacker.address, 80))
        .to.be.reverted;
    });

    it("Should reject score above 100", async function () {
      await expect(proofOfExit.connect(oracle).updateThreatScore(attacker.address, 101))
        .to.be.revertedWith("ProofOfExit: score out of range");
    });

    it("Should reject zero address score update", async function () {
      await expect(proofOfExit.connect(oracle).updateThreatScore(ethers.ZeroAddress, 80))
        .to.be.revertedWith("ProofOfExit: zero address");
    });

    it("Should track update count correctly", async function () {
      const target = attacker.address;
      await proofOfExit.connect(oracle).updateThreatScore(target, 50);
      await proofOfExit.connect(oracle).updateThreatScore(target, 80);
      const record = await proofOfExit.threatRecords(target);
      expect(record.updateCount).to.equal(2n);
    });

    it("Should return correct threat score via getThreatScore", async function () {
      await proofOfExit.connect(oracle).updateThreatScore(attacker.address, 90);
      expect(await proofOfExit.getThreatScore(attacker.address)).to.equal(90n);
    });
  });

  /*//////////////////////////////////////////////////////////////
                      AUTONOMOUS EXIT
  //////////////////////////////////////////////////////////////*/

  describe("Autonomous Exit (executeExit)", function () {
    const malicious = "0x1234567890123456789012345678901234567890";

    beforeEach(async function () {
      // Set threat score above threshold
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 80);
    });

    it("Should execute exit when score meets threshold", async function () {
      await expect(proofOfExit.connect(executor).executeExit(malicious, 80))
        .to.emit(proofOfExit, "ExitExecuted");
    });

    it("Should transfer tokens to Cold Safe on exit", async function () {
      const before = await mockToken.balanceOf(coldSafe.address);
      await proofOfExit.connect(executor).executeExit(malicious, 80);
      const after = await mockToken.balanceOf(coldSafe.address);
      expect(after).to.be.gt(before);
    });

    it("Should transfer ETH to Cold Safe on exit", async function () {
      const before = await ethers.provider.getBalance(coldSafe.address);
      await proofOfExit.connect(executor).executeExit(malicious, 80);
      const after = await ethers.provider.getBalance(coldSafe.address);
      expect(after).to.be.gt(before);
    });

    it("Should blacklist the malicious contract after exit", async function () {
      await proofOfExit.connect(executor).executeExit(malicious, 80);
      expect(await proofOfExit.blacklisted(malicious)).to.be.true;
    });

    it("Should record exit in history", async function () {
      await proofOfExit.connect(executor).executeExit(malicious, 80);
      expect(await proofOfExit.exitCount()).to.equal(1n);
      const record = await proofOfExit.getExitRecord(0);
      expect(record.maliciousContract).to.equal(malicious);
      expect(record.threatScore).to.equal(80n);
    });

    it("Should reject exit when score below threshold", async function () {
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 50);
      await expect(proofOfExit.connect(executor).executeExit(malicious, 50))
        .to.be.revertedWithCustomError(proofOfExit, "ThreatScoreBelowThreshold");
    });

    it("Should reject exit when score parameter does not match on-chain record", async function () {
      // On-chain says 80, but executor passes 90 (stale data)
      await expect(proofOfExit.connect(executor).executeExit(malicious, 90))
        .to.be.revertedWithCustomError(proofOfExit, "ThreatScoreBelowThreshold");
    });

    it("Should reject exit from non-executor", async function () {
      await expect(proofOfExit.connect(attacker).executeExit(malicious, 80))
        .to.be.reverted;
    });

    it("Should reject double exit of same contract", async function () {
      await proofOfExit.connect(executor).executeExit(malicious, 80);
      // Need different malicious contract after cooldown
      const malicious2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
      await proofOfExit.connect(oracle).updateThreatScore(malicious2, 80);

      // Cooldown is active, so even a non-blacklisted contract can't exit yet
      await expect(proofOfExit.connect(executor).executeExit(malicious, 80))
        .to.be.revertedWithCustomError(proofOfExit, "CooldownNotExpired");
    });

    it("Should enforce 60-second cooldown between exits", async function () {
      // First exit
      await proofOfExit.connect(executor).executeExit(malicious, 80);

      // Second exit immediately after (different contract)
      const malicious2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
      await proofOfExit.connect(oracle).updateThreatScore(malicious2, 80);

      await expect(proofOfExit.connect(executor).executeExit(malicious2, 80))
        .to.be.revertedWithCustomError(proofOfExit, "CooldownNotExpired");

      // Advance time past cooldown
      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);

      await expect(proofOfExit.connect(executor).executeExit(malicious2, 80))
        .to.emit(proofOfExit, "ExitExecuted");
    });

    it("Should reject exit when paused", async function () {
      await proofOfExit.connect(guardian).pause();
      await expect(proofOfExit.connect(executor).executeExit(malicious, 80))
        .to.be.revertedWithCustomError(proofOfExit, "EnforcedPause");
    });
  });

  /*//////////////////////////////////////////////////////////////
                      GUARDIAN EXIT
  //////////////////////////////////////////////////////////////*/

  describe("Guardian Exit (guardianExit)", function () {
    it("Should allow guardian to exit below threshold", async function () {
      const malicious = attacker.address;
      // Score below threshold
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 40);

      await expect(
        proofOfExit.connect(guardian).guardianExit(malicious, "Manual review confirmed attack")
      )
        .to.emit(proofOfExit, "ExitExecuted")
        .to.emit(proofOfExit, "GuardianExitTriggered");
    });

    it("Should reject guardian exit from non-guardian", async function () {
      await expect(
        proofOfExit.connect(attacker).guardianExit(attacker.address, "hack")
      ).to.be.reverted;
    });

    it("Should blacklist contract after guardian exit", async function () {
      const malicious = attacker.address;
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 40);
      await proofOfExit.connect(guardian).guardianExit(malicious, "Confirmed by team");
      expect(await proofOfExit.blacklisted(malicious)).to.be.true;
    });

    it("Guardian exit still works while autonomous exit is paused", async function () {
      const malicious = attacker.address;
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 90);
      await proofOfExit.connect(guardian).pause();

      // Autonomous exit blocked
      await expect(proofOfExit.connect(executor).executeExit(malicious, 90))
        .to.be.revertedWithCustomError(proofOfExit, "EnforcedPause");

      // But guardian exit still works (no whenNotPaused modifier)
      await expect(
        proofOfExit.connect(guardian).guardianExit(malicious, "Override while paused")
      ).to.emit(proofOfExit, "ExitExecuted");
    });
  });

  /*//////////////////////////////////////////////////////////////
                      ADMIN — REGISTRY
  //////////////////////////////////////////////////////////////*/

  describe("Protocol Registry", function () {
    it("Should register a protocol", async function () {
      const addr = user.address;
      await expect(
        proofOfExit.connect(governance).registerProtocol(addr, "Test Protocol", "0x")
      ).to.emit(proofOfExit, "ContractRegistered").withArgs(addr, "Test Protocol");
    });

    it("Should deregister a protocol", async function () {
      const addr = await mockProtocol.getAddress();
      await expect(proofOfExit.connect(governance).deregisterProtocol(addr))
        .to.emit(proofOfExit, "ContractDeregistered").withArgs(addr);
    });

    it("Should reject registering a blacklisted contract", async function () {
      const malicious = attacker.address;
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 80);
      await proofOfExit.connect(guardian).guardianExit(malicious, "Blacklisted");

      await expect(
        proofOfExit.connect(governance).registerProtocol(malicious, "Evil", "0x")
      ).to.be.revertedWithCustomError(proofOfExit, "BlacklistedContractOperation");
    });

    it("Should reject registerProtocol from non-admin", async function () {
      await expect(
        proofOfExit.connect(attacker).registerProtocol(user.address, "x", "0x")
      ).to.be.reverted;
    });

    it("Should register a token", async function () {
      const addr = user.address; // dummy address
      await expect(proofOfExit.connect(governance).registerToken(addr))
        .to.emit(proofOfExit, "TokenRegistered").withArgs(addr);
      expect(await proofOfExit.isTokenRegistered(addr)).to.be.true;
    });

    it("Should not double-register a token", async function () {
      const addr = user.address;
      await proofOfExit.connect(governance).registerToken(addr);
      // Second registration should be a no-op, not revert
      await proofOfExit.connect(governance).registerToken(addr);
      const tokens = await proofOfExit.getRegisteredTokens();
      expect(tokens.filter((t: string) => t === addr).length).to.equal(1);
    });
  });

  /*//////////////////////////////////////////////////////////////
                      ADMIN — PARAMETERS
  //////////////////////////////////////////////////////////////*/

  describe("Threshold Configuration", function () {
    it("Should allow governance to update threshold", async function () {
      await expect(proofOfExit.connect(governance).setThreatThreshold(80))
        .to.emit(proofOfExit, "ThresholdUpdated").withArgs(75, 80);
      expect(await proofOfExit.threatThreshold()).to.equal(80n);
    });

    it("Should reject threshold below 50", async function () {
      await expect(proofOfExit.connect(governance).setThreatThreshold(49))
        .to.be.revertedWithCustomError(proofOfExit, "InvalidThreshold");
    });

    it("Should reject threshold above 95", async function () {
      await expect(proofOfExit.connect(governance).setThreatThreshold(96))
        .to.be.revertedWithCustomError(proofOfExit, "InvalidThreshold");
    });

    it("Should reject threshold change from non-admin", async function () {
      await expect(proofOfExit.connect(attacker).setThreatThreshold(60))
        .to.be.reverted;
    });
  });

  /*//////////////////////////////////////////////////////////////
                      VIEW FUNCTIONS
  //////////////////////////////////////////////////////////////*/

  describe("View Functions", function () {
    it("Should return canExit = false when score below threshold", async function () {
      await proofOfExit.connect(oracle).updateThreatScore(attacker.address, 50);
      const [eligible] = await proofOfExit.canExit(attacker.address);
      expect(eligible).to.be.false;
    });

    it("Should return canExit = true when score meets threshold", async function () {
      await proofOfExit.connect(oracle).updateThreatScore(attacker.address, 80);
      const [eligible] = await proofOfExit.canExit(attacker.address);
      expect(eligible).to.be.true;
    });

    it("Should return canExit = false when paused", async function () {
      await proofOfExit.connect(oracle).updateThreatScore(attacker.address, 80);
      await proofOfExit.connect(guardian).pause();
      const [eligible] = await proofOfExit.canExit(attacker.address);
      expect(eligible).to.be.false;
    });

    it("Should return cooldownRemaining = 0 when ready", async function () {
      expect(await proofOfExit.cooldownRemaining()).to.equal(0n);
    });

    it("Should return cooldownRemaining > 0 after an exit", async function () {
      const malicious = attacker.address;
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 80);
      await proofOfExit.connect(guardian).guardianExit(malicious, "test");
      expect(await proofOfExit.cooldownRemaining()).to.be.gt(0n);
    });

    it("Should return all blacklisted contracts", async function () {
      const malicious = attacker.address;
      await proofOfExit.connect(oracle).updateThreatScore(malicious, 80);
      await proofOfExit.connect(guardian).guardianExit(malicious, "test");
      const list = await proofOfExit.getBlacklistedContracts();
      expect(list).to.include(malicious);
    });

    it("Should return all registered tokens", async function () {
      const tokens = await proofOfExit.getRegisteredTokens();
      expect(tokens).to.include(await mockToken.getAddress());
    });

    it("Should return protocol list", async function () {
      const protocols = await proofOfExit.getProtocolList();
      expect(protocols).to.include(await mockProtocol.getAddress());
    });
  });

  /*//////////////////////////////////////////////////////////////
                      PAUSE / UNPAUSE
  //////////////////////////////////////////////////////////////*/

  describe("Pause / Unpause", function () {
    it("Should allow guardian to pause", async function () {
      await proofOfExit.connect(guardian).pause();
      expect(await proofOfExit.paused()).to.be.true;
    });

    it("Should allow guardian to unpause", async function () {
      await proofOfExit.connect(guardian).pause();
      await proofOfExit.connect(guardian).unpause();
      expect(await proofOfExit.paused()).to.be.false;
    });

    it("Should reject pause from non-guardian", async function () {
      await expect(proofOfExit.connect(attacker).pause()).to.be.reverted;
    });
  });
});