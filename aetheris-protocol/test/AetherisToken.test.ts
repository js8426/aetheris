// Aetheris\aetheris-protocol\test\AetherisToken.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { AetherisToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AetherisToken", function () {
  let token: AetherisToken;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const TOTAL_SUPPLY = ethers.parseEther("1000000000"); // 1 billion

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const AetherisToken = await ethers.getContractFactory("AetherisToken");
    token = await AetherisToken.deploy();
    await token.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right total supply", async function () {
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("Should assign total supply to owner", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);
    });

    it("Should have correct name and symbol", async function () {
      expect(await token.name()).to.equal("Aetheris");
      expect(await token.symbol()).to.equal("AX");
    });

    it("Should have 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });
  });

  describe("Standard ERC20 Transfers", function () {
    it("Should transfer tokens correctly", async function () {
      const transferAmount = ethers.parseEther("1000");
      
      await token.transfer(addr1.address, transferAmount);

      expect(await token.balanceOf(addr1.address)).to.equal(transferAmount);
      expect(await token.balanceOf(owner.address)).to.equal(
        TOTAL_SUPPLY - transferAmount
      );
    });

    it("Should emit Transfer event", async function () {
      const transferAmount = ethers.parseEther("1000");

      await expect(token.transfer(addr1.address, transferAmount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);
    });

    it("Should not change total supply on transfer", async function () {
      const transferAmount = ethers.parseEther("1000");
      
      await token.transfer(addr1.address, transferAmount);

      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("Should fail when transferring more than balance", async function () {
      const balance = await token.balanceOf(owner.address);

      await expect(
        token.transfer(addr1.address, balance + 1n)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("Should fail when transferring to zero address", async function () {
      await expect(
        token.transfer(ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
    });

    it("Should handle multiple transfers correctly", async function () {
      const amount = ethers.parseEther("1000");

      await token.transfer(addr1.address, amount);
      await token.transfer(addr1.address, amount);
      await token.transfer(addr1.address, amount);

      expect(await token.balanceOf(addr1.address)).to.equal(amount * 3n);
      expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
    });
  });

  describe("TransferFrom", function () {
    beforeEach(async function () {
      await token.approve(addr1.address, ethers.parseEther("10000"));
    });

    it("Should transferFrom correctly", async function () {
      const transferAmount = ethers.parseEther("1000");

      await token
        .connect(addr1)
        .transferFrom(owner.address, addr2.address, transferAmount);

      expect(await token.balanceOf(addr2.address)).to.equal(transferAmount);
      expect(await token.balanceOf(owner.address)).to.equal(
        TOTAL_SUPPLY - transferAmount
      );
    });

    it("Should reduce allowance after transferFrom", async function () {
      const transferAmount = ethers.parseEther("1000");
      const initialAllowance = ethers.parseEther("10000");

      await token
        .connect(addr1)
        .transferFrom(owner.address, addr2.address, transferAmount);

      expect(await token.allowance(owner.address, addr1.address)).to.equal(
        initialAllowance - transferAmount
      );
    });

    it("Should fail when transferFrom exceeds allowance", async function () {
      await expect(
        token
          .connect(addr1)
          .transferFrom(owner.address, addr2.address, ethers.parseEther("20000"))
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });
  });

  describe("Pausable", function () {
    it("Should pause transfers", async function () {
      await token.pause();
      expect(await token.paused()).to.be.true;

      await expect(
        token.transfer(addr1.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("Should unpause transfers", async function () {
      await token.pause();
      await token.unpause();
      expect(await token.paused()).to.be.false;

      await expect(
        token.transfer(addr1.address, ethers.parseEther("100"))
      ).to.not.be.reverted;
    });

    it("Should only allow owner to pause", async function () {
      await expect(
        token.connect(addr1).pause()
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to unpause", async function () {
      await token.pause();

      await expect(
        token.connect(addr1).unpause()
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("ERC20Votes", function () {
    it("Should allow delegation", async function () {
      await token.transfer(addr1.address, ethers.parseEther("1000"));

      await token.connect(addr1).delegate(addr2.address);

      const votes = await token.getVotes(addr2.address);
      expect(votes).to.equal(ethers.parseEther("1000"));
    });

    it("Should update votes after delegation", async function () {
      const amount = ethers.parseEther("1000");
      await token.transfer(addr1.address, amount);

      await token.connect(addr1).delegate(addr1.address);
      const votesBefore = await token.getVotes(addr1.address);

      await token.connect(addr1).delegate(addr2.address);

      expect(await token.getVotes(addr1.address)).to.equal(0);
      expect(await token.getVotes(addr2.address)).to.equal(votesBefore);
    });

    it("Should track historical votes", async function () {
      const amount = ethers.parseEther("1000");
      await token.transfer(addr1.address, amount);
      await token.connect(addr1).delegate(addr1.address);

      const currentBlock = await ethers.provider.getBlockNumber();

      await ethers.provider.send("evm_mine", []);

      const pastVotes = await token.getPastVotes(addr1.address, currentBlock);
      expect(pastVotes).to.equal(amount);
    });

    it("Should return zero votes for non-delegated addresses", async function () {
      await token.transfer(addr1.address, ethers.parseEther("1000"));
      
      // No delegation yet
      expect(await token.getVotes(addr1.address)).to.equal(0);
    });
  });

  describe("ERC20Permit (via ERC20Votes)", function () {
    it("Should have correct domain separator", async function () {
      const domain = await token.eip712Domain();
      expect(domain.name).to.equal("Aetheris");
      expect(domain.version).to.equal("1");
    });

    it("Should track nonces correctly", async function () {
      // Initially zero
      expect(await token.nonces(owner.address)).to.equal(0);
      
      // Nonces only increment with permit/signature operations, not regular delegate
      // Delegate to self
      await token.delegate(owner.address);
      
      // Nonce still zero (delegate doesn't use permit)
      expect(await token.nonces(owner.address)).to.equal(0);
    });
  });

  describe("Burnable", function () {
    it("Should allow burning tokens", async function () {
      const burnAmount = ethers.parseEther("1000");
      const initialSupply = await token.totalSupply();

      await token.burn(burnAmount);

      expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
      expect(await token.balanceOf(owner.address)).to.equal(
        TOTAL_SUPPLY - burnAmount
      );
    });

    it("Should emit Transfer event on burn", async function () {
      const burnAmount = ethers.parseEther("1000");

      await expect(token.burn(burnAmount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, burnAmount);
    });

    it("Should fail when burning more than balance", async function () {
      const balance = await token.balanceOf(owner.address);

      await expect(
        token.burn(balance + 1n)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("Should allow burning from allowance", async function () {
      const burnAmount = ethers.parseEther("1000");
      
      await token.approve(addr1.address, burnAmount);
      await token.connect(addr1).burnFrom(owner.address, burnAmount);

      expect(await token.balanceOf(owner.address)).to.equal(
        TOTAL_SUPPLY - burnAmount
      );
    });
  });

  describe("Ownership", function () {
    it("Should have correct owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("Should allow owner transfer", async function () {
      await token.transferOwnership(addr1.address);
      expect(await token.owner()).to.equal(addr1.address);
    });

    it("Should prevent non-owner from transferring ownership", async function () {
      await expect(
        token.connect(addr1).transferOwnership(addr2.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very small transfers", async function () {
      const amount = 100n;

      await token.transfer(addr1.address, amount);

      expect(await token.balanceOf(addr1.address)).to.equal(amount);
    });

    it("Should handle large transfers", async function () {
      const amount = ethers.parseEther("100000000"); // 100M tokens

      await token.transfer(addr1.address, amount);

      expect(await token.balanceOf(addr1.address)).to.equal(amount);
    });

    it("Should handle zero transfers", async function () {
      await expect(token.transfer(addr1.address, 0)).to.not.be.reverted;
      expect(await token.balanceOf(addr1.address)).to.equal(0);
    });

    it("Should maintain total supply through complex operations", async function () {
      const amount1 = ethers.parseEther("1000");
      const amount2 = ethers.parseEther("500");
      const burnAmount = ethers.parseEther("100");

      await token.transfer(addr1.address, amount1);
      await token.transfer(addr2.address, amount2);
      await token.burn(burnAmount);

      const expectedSupply = TOTAL_SUPPLY - burnAmount;
      expect(await token.totalSupply()).to.equal(expectedSupply);
    });
  });
});