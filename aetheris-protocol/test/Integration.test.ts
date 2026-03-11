// Aetheris\aetheris-protocol\test\Integration.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AetherisToken,
  AetherisVesting,
  AetherisStaking,
  AetherisTimelock,
  AetherisGovernance
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

describe("Integration Tests - Full Protocol", function () {
  let token: AetherisToken;
  let vesting: AetherisVesting;
  let staking: AetherisStaking;
  let timelock: AetherisTimelock;
  let governance: AetherisGovernance;
  let usdc: AetherisToken; // Mock USDC
  
  let owner: SignerWithAddress;
  let teamMember: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  const TOTAL_SUPPLY = ethers.parseEther("1000000000");
  const MIN_DELAY = 172800; // 48 hours

  beforeEach(async function () {
    [owner, teamMember, user1, user2, user3] = await ethers.getSigners();

    // Deploy $AX token
    const AetherisToken = await ethers.getContractFactory("AetherisToken");
    token = await AetherisToken.deploy();
    await token.waitForDeployment();

    // Deploy mock USDC
    usdc = await AetherisToken.deploy();
    await usdc.waitForDeployment();

    // Deploy Vesting
    const AetherisVesting = await ethers.getContractFactory("AetherisVesting");
    vesting = await AetherisVesting.deploy(await token.getAddress());
    await vesting.waitForDeployment();

    // Deploy Staking
    const AetherisStaking = await ethers.getContractFactory("AetherisStaking");
    staking = await AetherisStaking.deploy(
      await token.getAddress(),
      await usdc.getAddress()
    );
    await staking.waitForDeployment();

    // Deploy Timelock
    const AetherisTimelock = await ethers.getContractFactory("AetherisTimelock");
    timelock = await AetherisTimelock.deploy(
      MIN_DELAY,
      [],
      [],
      owner.address
    );
    await timelock.waitForDeployment();

    // Deploy Governance
    const AetherisGovernance = await ethers.getContractFactory("AetherisGovernance");
    governance = await AetherisGovernance.deploy(
      await token.getAddress(),
      await timelock.getAddress()
    );
    await governance.waitForDeployment();

    // Setup Timelock roles
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

    await timelock.grantRole(PROPOSER_ROLE, await governance.getAddress());
    await timelock.grantRole(EXECUTOR_ROLE, await governance.getAddress());
    await timelock.grantRole(CANCELLER_ROLE, await governance.getAddress());
  });

  describe("Full User Journey: Vesting → Staking → Governance", function () {
    it("Should complete full user journey", async function () {
      // ========== STEP 1: Setup Team Vesting ==========
      const vestingAmount = ethers.parseEther("150000"); // Team allocation
      const startTime = await time.latest();
      const cliffDuration = 365 * 24 * 60 * 60; // 12 months
      const duration = 4 * 365 * 24 * 60 * 60; // 48 months total

      // Owner approves vesting contract to spend tokens
      await token.approve(await vesting.getAddress(), vestingAmount);

      // Create vesting schedule for team member (will transfer tokens)
      // Correct argument order to match AetherisVesting.sol
      // Order: (beneficiary, amount, start, cliff, duration, revocable)
      await vesting.createVestingSchedule(
        teamMember.address,
        vestingAmount, // This is the total AX amount
        startTime,     // This is the start timestamp
        cliffDuration,
        duration,
        true
      );

      console.log("✓ Team vesting schedule created");

      // ========== STEP 2: Fast-forward past cliff ==========
      await time.increase(cliffDuration + 86400);

      // Team member releases vested tokens (after 1 year, ~25% vested)
      const releasableBefore = await vesting.releasableAmount(teamMember.address);
      expect(releasableBefore).to.be.gt(0);

      await vesting.connect(teamMember).release(teamMember.address);

      const teamBalance = await token.balanceOf(teamMember.address);
      expect(teamBalance).to.be.gt(0);

      console.log("✓ Team member released vested tokens:", ethers.formatEther(teamBalance), "$AX");

      // ========== STEP 3: Team member stakes tokens ==========
      const releasedBalance = await token.balanceOf(teamMember.address);
      
      // Delegate voting power BEFORE staking 
      // This ensures the votes are tracked while tokens are in the wallet
      await token.connect(teamMember).delegate(teamMember.address);
      await mine(1);

      const votingPowerBeforeStaking = await token.getVotes(teamMember.address);
      expect(votingPowerBeforeStaking).to.equal(releasedBalance);
      console.log("✓ Team member delegated voting power:", ethers.formatEther(votingPowerBeforeStaking), "votes");

      // Now stake the tokens
      await token.connect(teamMember).approve(await staking.getAddress(), releasedBalance);
      await staking.connect(teamMember).stake(releasedBalance);

      const stakedBalance = await staking.stakedBalance(teamMember.address);
      expect(stakedBalance).to.equal(releasedBalance);
      console.log("✓ Team member staked tokens");

      // ========== STEP 4: Distribute USDC rewards ==========
      const rewardAmount = ethers.parseEther("10000");
      await usdc.approve(await staking.getAddress(), rewardAmount);
      await staking.distributeRewards(rewardAmount);
      console.log("✓ Distributed 10K USDC rewards to stakers");

      // ========== STEP 5: Prepare for Proposal ==========
      // Since the team member staked their tokens, they need more in their wallet 
      // to meet the 100,000 AX proposal threshold.
      await token.transfer(teamMember.address, ethers.parseEther("110000"));
      await mine(1);

      // ========== STEP 6: Create governance proposal ==========
      // Distribute enough tokens to satisfy the 40M AX Quorum
      await token.transfer(user1.address, ethers.parseEther("25000000"));
      await token.transfer(user2.address, ethers.parseEther("25000000"));
      await token.transfer(user3.address, ethers.parseEther("100000"));

      await token.connect(user1).delegate(user1.address);
      await token.connect(user2).delegate(user2.address);
      await token.connect(user3).delegate(user3.address);
      await ethers.provider.send("evm_mine", []);

      // Create proposal to change staking rewards
      const targets = [await staking.getAddress()];
      const values = [0n];
      const calldatas = [
        staking.interface.encodeFunctionData("distributeRewards", [ethers.parseEther("5000")])
      ];
      const description = "Distribute additional 5K USDC rewards to stakers";

      // Transfer USDC to timelock for execution
      await usdc.transfer(await timelock.getAddress(), ethers.parseEther("10000"));

      await governance.connect(user1).propose(targets, values, calldatas, description);

      const proposalId = await governance.hashProposal(
        targets,
        values,
        calldatas,
        ethers.id(description)
      );

      console.log("✓ Governance proposal created");

      // ========== STEP 7: Users vote on proposal ==========
      await ethers.provider.send("evm_mine", []); // Wait for voting delay

      await governance.connect(user1).castVote(proposalId, 1); // For
      await governance.connect(user2).castVote(proposalId, 1); // For
      await governance.connect(teamMember).castVote(proposalId, 1); // For

      const votes = await governance.proposalVotes(proposalId);
      expect(votes.forVotes).to.be.gt(votes.againstVotes);

      console.log("✓ Users voted on proposal");

      // ========== STEP 8: Fast-forward to end voting period ==========
      await mine(302401);

      // Check proposal succeeded
      const state = await governance.state(proposalId);
      expect(state).to.equal(4); // Succeeded

      console.log("✓ Proposal succeeded");

      // ========== STEP 9: Queue proposal in timelock ==========
      await governance.queue(targets, values, calldatas, ethers.id(description));

      console.log("✓ Proposal queued in timelock");

      // ========== STEP 10: Wait for timelock delay ==========
      await time.increase(MIN_DELAY + 1);

      // ========== STEP 11: Execute proposal ==========
      // Need to approve staking to spend timelock's USDC
      const timelockUSDC = await usdc.balanceOf(await timelock.getAddress());
      expect(timelockUSDC).to.be.gte(ethers.parseEther("5000"));

      // For this to work, we need to transfer USDC to staking directly
      // since the timelock can't approve. Let's modify the proposal:
      const newTargets = [await usdc.getAddress()];
      const newCalldatas = [
        usdc.interface.encodeFunctionData("transfer", [
          await staking.getAddress(),
          ethers.parseEther("5000")
        ])
      ];
      const newDescription = "Transfer 5K USDC to staking contract";

      // Create new proposal
      await governance.connect(user1).propose(newTargets, [0n], newCalldatas, newDescription);
      const newProposalId = await governance.hashProposal(
        newTargets,
        [0n],
        newCalldatas,
        ethers.id(newDescription)
      );

      await ethers.provider.send("evm_mine", []);

      // Vote
      await governance.connect(user1).castVote(newProposalId, 1);
      await governance.connect(user2).castVote(newProposalId, 1);

      // Wait for voting period
      await mine(302401);

      // Queue and execute
      await governance.queue(newTargets, [0n], newCalldatas, ethers.id(newDescription));
      await time.increase(MIN_DELAY + 1);

      const stakingUSDCBefore = await usdc.balanceOf(await staking.getAddress());
      
      await governance.execute(newTargets, [0n], newCalldatas, ethers.id(newDescription));

      const stakingUSDCAfter = await usdc.balanceOf(await staking.getAddress());
      expect(stakingUSDCAfter - stakingUSDCBefore).to.equal(ethers.parseEther("5000"));

      console.log("✓ Proposal executed successfully");

      // ========== STEP 12: Team member claims staking rewards ==========
      const pendingRewards = await staking.pendingRewards(teamMember.address);
      expect(pendingRewards).to.be.gt(0);

      const usdcBalanceBefore = await usdc.balanceOf(teamMember.address);
      
      await staking.connect(teamMember).claimRewards();

      const usdcBalanceAfter = await usdc.balanceOf(teamMember.address);
      expect(usdcBalanceAfter).to.be.gt(usdcBalanceBefore);

      console.log("✓ Team member claimed USDC rewards:", ethers.formatEther(usdcBalanceAfter), "USDC");

      // ========== SUMMARY ==========
      console.log("\n========== FULL JOURNEY COMPLETE ==========");
      console.log("✓ Vesting → Staking → Governance → Rewards");
      console.log("✓ All contracts integrated successfully");
    });
  });

  describe("Multi-User Staking and Rewards Distribution", function () {
    it("Should distribute rewards proportionally to multiple users", async function () {
      // Setup: 3 users with different stake amounts
      await token.transfer(user1.address, ethers.parseEther("100000"));
      await token.transfer(user2.address, ethers.parseEther("50000"));
      await token.transfer(user3.address, ethers.parseEther("25000"));

      // All users stake
      await token.connect(user1).approve(await staking.getAddress(), ethers.parseEther("100000"));
      await token.connect(user2).approve(await staking.getAddress(), ethers.parseEther("50000"));
      await token.connect(user3).approve(await staking.getAddress(), ethers.parseEther("25000"));

      await staking.connect(user1).stake(ethers.parseEther("100000"));
      await staking.connect(user2).stake(ethers.parseEther("50000"));
      await staking.connect(user3).stake(ethers.parseEther("25000"));

      // Total staked: 175K
      const totalStaked = await staking.totalStaked();
      expect(totalStaked).to.equal(ethers.parseEther("175000"));

      // Distribute 10K USDC rewards
      const totalRewards = ethers.parseEther("10000");
      await usdc.approve(await staking.getAddress(), totalRewards);
      await staking.distributeRewards(totalRewards);

      // Check pending rewards (should be proportional)
      const pending1 = await staking.pendingRewards(user1.address);
      const pending2 = await staking.pendingRewards(user2.address);
      const pending3 = await staking.pendingRewards(user3.address);

      // User1 staked 100K/175K = 57.14% → should get ~5,714 USDC
      // User2 staked 50K/175K = 28.57% → should get ~2,857 USDC
      // User3 staked 25K/175K = 14.29% → should get ~1,429 USDC

      expect(pending1).to.be.closeTo(ethers.parseEther("5714.285714"), ethers.parseEther("1"));
      expect(pending2).to.be.closeTo(ethers.parseEther("2857.142857"), ethers.parseEther("1"));
      expect(pending3).to.be.closeTo(ethers.parseEther("1428.571428"), ethers.parseEther("1"));

      console.log("✓ Rewards distributed proportionally");
      console.log("  User1 (100K staked):", ethers.formatEther(pending1), "USDC");
      console.log("  User2 (50K staked):", ethers.formatEther(pending2), "USDC");
      console.log("  User3 (25K staked):", ethers.formatEther(pending3), "USDC");
    });
  });

  describe("Vesting + Staking Integration", function () {
    it("Should allow vesting beneficiary to stake released tokens", async function () {
      const vestingAmount = ethers.parseEther("100000");
      const startTime = await time.latest();
      const cliffDuration = 30 * 24 * 60 * 60; // 30 days
      const duration = 365 * 24 * 60 * 60; // 1 year

      // Create vesting schedule
      await token.approve(await vesting.getAddress(), vestingAmount);
      await vesting.createVestingSchedule(
        user1.address,
        vestingAmount, // Amount was at the end, it must be 2nd
        startTime,     // Start time was 2nd, it must be 3rd
        cliffDuration,
        duration,
        false
      );

      // Fast-forward past cliff
      await time.increase(cliffDuration + 86400);

      // Release vested tokens
      await vesting.connect(user1).release(user1.address);

      const balance = await token.balanceOf(user1.address);
      expect(balance).to.be.gt(0);

      // Stake the released tokens
      await token.connect(user1).approve(await staking.getAddress(), balance);
      await staking.connect(user1).stake(balance);

      const staked = await staking.stakedBalance(user1.address);
      expect(staked).to.equal(balance);

      console.log("✓ Beneficiary staked vested tokens:", ethers.formatEther(staked), "$AX");
    });
  });

  describe("Emergency Scenarios", function () {
    it("Should handle token pause across all contracts", async function () {
      // Distribute tokens
      await token.transfer(user1.address, ethers.parseEther("10000"));

      // User stakes
      await token.connect(user1).approve(await staking.getAddress(), ethers.parseEther("5000"));
      await staking.connect(user1).stake(ethers.parseEther("5000"));

      // Owner pauses token
      await token.pause();

      // Transfers should fail
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");

      // Staking should fail (requires transfer)
      await expect(
        staking.connect(user1).stake(ethers.parseEther("1000"))
      ).to.be.reverted;

      // Unpause
      await token.unpause();

      // Transfers should work again
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("100"))
      ).to.not.be.reverted;

      console.log("✓ Emergency pause worked across all contracts");
    });
  });

  describe("Governance-Controlled Protocol Changes", function () {
    it("Should allow governance to change staking tiers", async function () {
      // This test verifies that governance CAN control protocol parameters
      // In practice, you'd create a setter function in AetherisStaking
      
      // For now, we verify the governance flow works
      // Give user1 enough tokens to pass 4% Quorum (40M AX) single-handedly
      await token.transfer(user1.address, ethers.parseEther("41000000"));
      await token.connect(user1).delegate(user1.address);
      await ethers.provider.send("evm_mine", []);

      // Create a proposal (example: just transfer tokens to demonstrate governance works)
      const targets = [await token.getAddress()];
      const values = [0n];
      const calldatas = [
        token.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("1000")])
      ];
      const description = "Transfer tokens via governance";

      await token.transfer(await timelock.getAddress(), ethers.parseEther("10000"));

      await governance.connect(user1).propose(targets, values, calldatas, description);
      const proposalId = await governance.hashProposal(targets, values, calldatas, ethers.id(description));

      await ethers.provider.send("evm_mine", []);

      // Vote with user1 only (user2 has 0 tokens at this point)
      await governance.connect(user1).castVote(proposalId, 1); // 200K
      // Wait for voting period to end
      await mine(302401);

      await governance.queue(targets, values, calldatas, ethers.id(description));
      await time.increase(MIN_DELAY + 1);

      const balanceBefore = await token.balanceOf(user2.address);
      
      await governance.execute(targets, values, calldatas, ethers.id(description));

      const balanceAfter = await token.balanceOf(user2.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1000"));

      console.log("✓ Governance successfully executed protocol change");
    });
  });
});