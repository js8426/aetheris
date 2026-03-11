// Aetheris\aetheris-protocol\test\ColdSafeClaim.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { MerkleTree } from "merkletreejs";

// ─────────────────────────────────────────────────────────────────────────────
// Merkle Tree Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface LeafEntry {
  user:   string;
  token:  string;
  amount: bigint;
}

/**
 * Hash a single leaf the same way the Solidity contract does:
 * keccak256(abi.encodePacked(user, token, amount))
 */
function hashLeaf(entry: LeafEntry): Buffer {
  const packed = ethers.solidityPackedKeccak256(
    ["address", "address", "uint256"],
    [entry.user, entry.token, entry.amount]
  );
  return Buffer.from(packed.slice(2), "hex");
}

/**
 * Hash function wrapper for MerkleTree — converts hex string output to Buffer
 */
function keccakBuffer(data: Buffer): Buffer {
  return Buffer.from(ethers.keccak256(data).slice(2), "hex");
}

/**
 * Build a Merkle tree. sortPairs:true matches Solidity _verifyProof sorting.
 */
function buildTree(entries: LeafEntry[]): MerkleTree {
  const leaves = entries.map(hashLeaf);
  return new MerkleTree(leaves, keccakBuffer, { sortPairs: true });
}

/**
 * Get Merkle root as 0x hex string.
 */
function getRoot(tree: MerkleTree): string {
  return "0x" + tree.getRoot().toString("hex");
}

/**
 * Get Merkle proof for a specific entry.
 * Uses getHexProof which returns string[] already prefixed with 0x.
 */
function getProof(tree: MerkleTree, entry: LeafEntry): string[] {
  const leaf = hashLeaf(entry);
  return tree.getHexProof(leaf);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("ColdSafeClaim", function () {
  let claim:      any;
  let usdc:       any;
  let token2:     any;

  let governance: SignerWithAddress;
  let coldSafe:   SignerWithAddress;
  let user1:      SignerWithAddress;
  let user2:      SignerWithAddress;
  let user3:      SignerWithAddress;
  let attacker:   SignerWithAddress;

  const USER1_USDC = ethers.parseUnits("1000", 6);
  const USER2_USDC = ethers.parseUnits("500",  6);
  const USER3_USDC = ethers.parseUnits("250",  6);
  const TOTAL_USDC = USER1_USDC + USER2_USDC + USER3_USDC;

  let tree:    MerkleTree;
  let root:    string;
  let entries: LeafEntry[];

  beforeEach(async function () {
    [governance, coldSafe, user1, user2, user3, attacker] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("AetherisToken");
    usdc   = await Token.deploy();
    token2 = await Token.deploy();
    await usdc.waitForDeployment();
    await token2.waitForDeployment();

    const ColdSafeClaim = await ethers.getContractFactory("ColdSafeClaim");
    claim = await ColdSafeClaim.deploy(coldSafe.address, governance.address);
    await claim.waitForDeployment();

    entries = [
      { user: user1.address, token: await usdc.getAddress(), amount: USER1_USDC },
      { user: user2.address, token: await usdc.getAddress(), amount: USER2_USDC },
      { user: user3.address, token: await usdc.getAddress(), amount: USER3_USDC },
    ];

    tree = buildTree(entries);
    root = getRoot(tree);

    await usdc.transfer(await claim.getAddress(), TOTAL_USDC);

    await claim.connect(coldSafe).createClaimEvent(
      root,
      [await usdc.getAddress()],
      [TOTAL_USDC],
      await ethers.provider.getBlockNumber(),
    );
  });

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("Should set correct Cold Safe address", async function () {
      expect(await claim.COLD_SAFE()).to.equal(coldSafe.address);
    });

    it("Should grant COLD_SAFE_ROLE to Cold Safe", async function () {
      const role = await claim.COLD_SAFE_ROLE();
      expect(await claim.hasRole(role, coldSafe.address)).to.be.true;
    });

    it("Should grant DEFAULT_ADMIN_ROLE to governance", async function () {
      const role = await claim.DEFAULT_ADMIN_ROLE();
      expect(await claim.hasRole(role, governance.address)).to.be.true;
    });

    it("Should revert with zero Cold Safe address", async function () {
      const ColdSafeClaim = await ethers.getContractFactory("ColdSafeClaim");
      await expect(
        ColdSafeClaim.deploy(ethers.ZeroAddress, governance.address)
      ).to.be.revertedWithCustomError(claim, "ZeroAddress");
    });

    it("Should revert with zero governance address", async function () {
      const ColdSafeClaim = await ethers.getContractFactory("ColdSafeClaim");
      await expect(
        ColdSafeClaim.deploy(coldSafe.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(claim, "ZeroAddress");
    });
  });

  // ── Create Claim Event ──────────────────────────────────────────────────────

  describe("Create Claim Event", function () {
    it("Should create a claim event with correct data", async function () {
      const ev = await claim.getClaimEvent(1);
      expect(ev.merkleRoot).to.equal(root);
      expect(ev.isActive).to.be.true;
      expect(ev.tokens[0]).to.equal(await usdc.getAddress());
      expect(ev.amounts[0]).to.equal(TOTAL_USDC);
    });

    it("Should emit ClaimEventCreated event", async function () {
      const newRoot = "0x" + "ab".repeat(32);
      await expect(
        claim.connect(coldSafe).createClaimEvent(
          newRoot, [await usdc.getAddress()], [ethers.parseUnits("100", 6)],
          await ethers.provider.getBlockNumber(),
        )
      ).to.emit(claim, "ClaimEventCreated");
    });

    it("Should increment eventCount", async function () {
      expect(await claim.eventCount()).to.equal(1n);
      const newRoot = "0x" + "cd".repeat(32);
      await claim.connect(coldSafe).createClaimEvent(
        newRoot, [await usdc.getAddress()], [ethers.parseUnits("100", 6)],
        await ethers.provider.getBlockNumber(),
      );
      expect(await claim.eventCount()).to.equal(2n);
    });

    it("Should reject from non-Cold Safe", async function () {
      await expect(
        claim.connect(attacker).createClaimEvent(root, [await usdc.getAddress()], [TOTAL_USDC], 1)
      ).to.be.reverted;
    });

    it("Should reject mismatched token/amount arrays", async function () {
      await expect(
        claim.connect(coldSafe).createClaimEvent(
          root, [await usdc.getAddress(), await token2.getAddress()], [TOTAL_USDC], 1,
        )
      ).to.be.revertedWithCustomError(claim, "ArrayLengthMismatch");
    });

    it("Should reject empty token array", async function () {
      await expect(
        claim.connect(coldSafe).createClaimEvent(root, [], [], 1)
      ).to.be.revertedWithCustomError(claim, "ZeroAmount");
    });

    it("Should reject zero merkle root", async function () {
      await expect(
        claim.connect(coldSafe).createClaimEvent(
          ethers.ZeroHash, [await usdc.getAddress()], [TOTAL_USDC], 1,
        )
      ).to.be.revertedWithCustomError(claim, "InvalidMerkleProof");
    });

    it("Should set claim deadline to 90 days from now", async function () {
      const ev    = await claim.getClaimEvent(1);
      const block = await ethers.provider.getBlock("latest");
      const expected = BigInt(block!.timestamp) + BigInt(90 * 24 * 3600);
      expect(ev.claimDeadline).to.be.closeTo(expected, 5n);
    });
  });

  // ── Single Token Claim ──────────────────────────────────────────────────────

  describe("Single Token Claim", function () {
    it("Should allow user1 to claim correct USDC amount", async function () {
      const proof  = getProof(tree, entries[0]);
      const before = await usdc.balanceOf(user1.address);
      await claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof);
      const after  = await usdc.balanceOf(user1.address);
      expect(after - before).to.equal(USER1_USDC);
    });

    it("Should emit ClaimPaid event", async function () {
      const proof = getProof(tree, entries[0]);
      await expect(
        claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof)
      ).to.emit(claim, "ClaimPaid")
        .withArgs(1, user1.address, await usdc.getAddress(), USER1_USDC);
    });

    it("Should mark claim as used after first claim", async function () {
      const proof = getProof(tree, entries[0]);
      await claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof);
      expect(await claim.hasClaimed(1, user1.address, await usdc.getAddress())).to.be.true;
    });

    it("Should reject double claim", async function () {
      const proof = getProof(tree, entries[0]);
      await claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof);
      await expect(
        claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof)
      ).to.be.revertedWithCustomError(claim, "AlreadyClaimed");
    });

    it("Should reject invalid Merkle proof", async function () {
      const proof = getProof(tree, entries[0]);
      await expect(
        claim.connect(user1).claim(1, await usdc.getAddress(), USER2_USDC, proof)
      ).to.be.revertedWithCustomError(claim, "InvalidMerkleProof");
    });

    it("Should reject attacker claiming with someone else's proof", async function () {
      const proof = getProof(tree, entries[0]);
      await expect(
        claim.connect(attacker).claim(1, await usdc.getAddress(), USER1_USDC, proof)
      ).to.be.revertedWithCustomError(claim, "InvalidMerkleProof");
    });

    it("Should allow all three users to claim independently", async function () {
      for (let i = 0; i < entries.length; i++) {
        const proof  = getProof(tree, entries[i]);
        const signer = [user1, user2, user3][i];
        await claim.connect(signer).claim(1, await usdc.getAddress(), entries[i].amount, proof);
        expect(await usdc.balanceOf(signer.address)).to.equal(entries[i].amount);
      }
    });

    it("Should track totalClaimed correctly", async function () {
      const proof = getProof(tree, entries[0]);
      await claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof);
      expect(await claim.totalClaimed(1, await usdc.getAddress())).to.equal(USER1_USDC);
    });

    it("Should reject claim after deadline", async function () {
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      const proof = getProof(tree, entries[0]);
      await expect(
        claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof)
      ).to.be.revertedWithCustomError(claim, "ClaimDeadlinePassed");
    });

    it("Should reject claim on non-existent event", async function () {
      const proof = getProof(tree, entries[0]);
      await expect(
        claim.connect(user1).claim(999, await usdc.getAddress(), USER1_USDC, proof)
      ).to.be.revertedWithCustomError(claim, "EventDoesNotExist");
    });
  });

  // ── Claim All ───────────────────────────────────────────────────────────────

  describe("Claim All (multiple tokens in one tx)", function () {
    const USER1_TOKEN2 = ethers.parseEther("100");
    let multiTree:    MerkleTree;
    let multiEntries: LeafEntry[];

    beforeEach(async function () {
      multiEntries = [
        { user: user1.address, token: await usdc.getAddress(),   amount: USER1_USDC   },
        { user: user1.address, token: await token2.getAddress(), amount: USER1_TOKEN2  },
        { user: user2.address, token: await usdc.getAddress(),   amount: USER2_USDC   },
      ];
      multiTree = buildTree(multiEntries);
      const multiRoot = getRoot(multiTree);

      await usdc.transfer(await claim.getAddress(), USER1_USDC + USER2_USDC);
      await token2.transfer(await claim.getAddress(), USER1_TOKEN2);

      await claim.connect(coldSafe).createClaimEvent(
        multiRoot,
        [await usdc.getAddress(), await token2.getAddress()],
        [USER1_USDC + USER2_USDC, USER1_TOKEN2],
        await ethers.provider.getBlockNumber(),
      );
    });

    it("Should allow user to claim all tokens at once", async function () {
      const proof1 = getProof(multiTree, multiEntries[0]);
      const proof2 = getProof(multiTree, multiEntries[1]);
      await claim.connect(user1).claimAll(
        2,
        [await usdc.getAddress(), await token2.getAddress()],
        [USER1_USDC, USER1_TOKEN2],
        [proof1, proof2],
      );
      expect(await usdc.balanceOf(user1.address)).to.equal(USER1_USDC);
      expect(await token2.balanceOf(user1.address)).to.equal(USER1_TOKEN2);
    });

    it("Should reject claimAll with mismatched arrays", async function () {
      await expect(
        claim.connect(user1).claimAll(
          2, [await usdc.getAddress()], [USER1_USDC, USER1_TOKEN2], [[]]
        )
      ).to.be.revertedWithCustomError(claim, "ArrayLengthMismatch");
    });
  });

  // ── Close Claim Event ───────────────────────────────────────────────────────

  describe("Close Claim Event", function () {
    it("Should return unclaimed funds to Cold Safe after deadline", async function () {
      const proof = getProof(tree, entries[0]);
      await claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof);

      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);

      const before = await usdc.balanceOf(coldSafe.address);
      await claim.connect(coldSafe).closeClaimEvent(1);
      const after  = await usdc.balanceOf(coldSafe.address);
      expect(after - before).to.equal(USER2_USDC + USER3_USDC);
    });

    it("Should emit ClaimEventClosed event", async function () {
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await expect(claim.connect(coldSafe).closeClaimEvent(1))
        .to.emit(claim, "ClaimEventClosed");
    });

    it("Should mark event as inactive after closing", async function () {
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await claim.connect(coldSafe).closeClaimEvent(1);
      const ev = await claim.getClaimEvent(1);
      expect(ev.isActive).to.be.false;
    });

    it("Should reject closing before deadline", async function () {
      await expect(
        claim.connect(coldSafe).closeClaimEvent(1)
      ).to.be.revertedWithCustomError(claim, "ClaimDeadlineNotPassed");
    });

    it("Should reject closing non-existent event", async function () {
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        claim.connect(coldSafe).closeClaimEvent(999)
      ).to.be.revertedWithCustomError(claim, "EventDoesNotExist");
    });

    it("Should reject closing from non-Cold Safe", async function () {
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      await expect(claim.connect(attacker).closeClaimEvent(1)).to.be.reverted;
    });
  });

  // ── View Functions ──────────────────────────────────────────────────────────

  describe("View Functions", function () {
    it("Should return correct days remaining", async function () {
      const days = await claim.daysRemaining(1);
      expect(days).to.be.closeTo(90n, 1n);
    });

    it("Should return 0 days remaining after deadline", async function () {
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 3600]);
      await ethers.provider.send("evm_mine", []);
      expect(await claim.daysRemaining(1)).to.equal(0n);
    });

    it("Should verify a valid proof", async function () {
      const proof = getProof(tree, entries[0]);
      expect(
        await claim.verifyClaimProof(1, user1.address, await usdc.getAddress(), USER1_USDC, proof)
      ).to.be.true;
    });

    it("Should reject an invalid proof in verifyClaimProof", async function () {
      expect(
        await claim.verifyClaimProof(1, attacker.address, await usdc.getAddress(), USER1_USDC, [])
      ).to.be.false;
    });

    it("Should revert getClaimEvent for non-existent event", async function () {
      await expect(claim.getClaimEvent(999))
        .to.be.revertedWithCustomError(claim, "EventDoesNotExist");
    });
  });

  // ── Pause / Unpause ─────────────────────────────────────────────────────────

  describe("Pause / Unpause", function () {
    it("Should allow governance to pause", async function () {
      await claim.connect(governance).pause();
      expect(await claim.paused()).to.be.true;
    });

    it("Should block claims while paused", async function () {
      await claim.connect(governance).pause();
      const proof = getProof(tree, entries[0]);
      await expect(
        claim.connect(user1).claim(1, await usdc.getAddress(), USER1_USDC, proof)
      ).to.be.revertedWithCustomError(claim, "EnforcedPause");
    });

    it("Should allow governance to unpause", async function () {
      await claim.connect(governance).pause();
      await claim.connect(governance).unpause();
      expect(await claim.paused()).to.be.false;
    });

    it("Should reject pause from non-governance", async function () {
      await expect(claim.connect(attacker).pause()).to.be.reverted;
    });
  });
});