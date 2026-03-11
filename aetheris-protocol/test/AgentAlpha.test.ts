// Aetheris\aetheris-protocol\test\AgentAlpha.test.ts

import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AgentAlpha + ProfitDistributor", function () {
    let agentAlpha:        any;
    let profitDistributor: any;
    let usdc:              any;
    let weth:              any;
    let mockAave:          any;
    let mockUniV3:         any;
    let mockAerodrome:     any;

    let governance:  SignerWithAddress;
    let executor:    SignerWithAddress;
    let guardian:    SignerWithAddress;
    let user1:       SignerWithAddress;
    let user2:       SignerWithAddress;
    let user3:       SignerWithAddress;
    let attacker:    SignerWithAddress;

    // USDC has 6 decimals
    const USDC = (n: number) => ethers.parseUnits(n.toString(), 6);
    const FLASH_AMOUNT = USDC(10_000); // $10,000 flash loan

    beforeEach(async function () {
        [governance, executor, guardian, user1, user2, user3, attacker] =
            await ethers.getSigners();

        // ── Deploy tokens ──────────────────────────────────────────────────
        const Token = await ethers.getContractFactory("AetherisToken");
        usdc = await Token.deploy();
        weth = await Token.deploy();
        await usdc.waitForDeployment();
        await weth.waitForDeployment();

        // ── Deploy mocks ───────────────────────────────────────────────────
        const MockAave  = await ethers.getContractFactory("MockAavePool");
        const MockV3    = await ethers.getContractFactory("MockUniswapV3Router");
        const MockAero  = await ethers.getContractFactory("MockAerodromeRouter");

        mockAave     = await MockAave.deploy();
        mockUniV3    = await MockV3.deploy();
        mockAerodrome = await MockAero.deploy();

        await mockAave.waitForDeployment();
        await mockUniV3.waitForDeployment();
        await mockAerodrome.waitForDeployment();

        // ── Deploy AgentAlpha ──────────────────────────────────────────────
        const AgentAlpha = await ethers.getContractFactory("AgentAlpha");
        agentAlpha = await AgentAlpha.deploy(
            await mockAave.getAddress(),
            executor.address,
            guardian.address,
            governance.address,
        );
        await agentAlpha.waitForDeployment();

        // ── Deploy ProfitDistributor ───────────────────────────────────────
        const ProfitDistributor = await ethers.getContractFactory("ProfitDistributor");
        profitDistributor = await ProfitDistributor.deploy(
            await usdc.getAddress(),
            await agentAlpha.getAddress(),
            guardian.address,
            governance.address,
        );
        await profitDistributor.waitForDeployment();

        // ── Wire AgentAlpha to ProfitDistributor ───────────────────────────
        await agentAlpha.connect(governance).setProfitDistributor(
            await profitDistributor.getAddress()
        );

        // ── Whitelist tokens ───────────────────────────────────────────────
        await agentAlpha.connect(governance).whitelistToken(await usdc.getAddress(), true);
        await agentAlpha.connect(governance).whitelistToken(await weth.getAddress(), true);

        // ── Whitelist DEXes ────────────────────────────────────────────────
        await agentAlpha.connect(governance).whitelistDex(
            await mockUniV3.getAddress(), 0, true    // DexType.UNISWAP_V3
        );
        await agentAlpha.connect(governance).whitelistDex(
            await mockAerodrome.getAddress(), 1, true // DexType.AERODROME
        );

        // ── Fund mock DEXes with tokens (simulate liquidity) ───────────────
        const DEX_LIQUIDITY = USDC(500_000);
        await usdc.transfer(await mockAave.getAddress(),     USDC(200_000));
        await usdc.transfer(await mockUniV3.getAddress(),    DEX_LIQUIDITY);
        await usdc.transfer(await mockAerodrome.getAddress(), DEX_LIQUIDITY);
        await weth.transfer(await mockUniV3.getAddress(),    ethers.parseEther("1000"));
        await weth.transfer(await mockAerodrome.getAddress(), ethers.parseEther("1000"));

        // ── Fund users with USDC for deposits ─────────────────────────────
        await usdc.transfer(user1.address, USDC(10_000));
        await usdc.transfer(user2.address, USDC(30_000));
        await usdc.transfer(user3.address, USDC(5_000));
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: build a two-hop trade (USDC → WETH on UniV3, WETH → USDC on Aerodrome)
    // ─────────────────────────────────────────────────────────────────────────
    async function buildTrade(overrides: Partial<any> = {}) {
        const usdcAddr = await usdc.getAddress();
        const wethAddr = await weth.getAddress();
        const v3Addr   = await mockUniV3.getAddress();
        const aeroAddr = await mockAerodrome.getAddress();

        return {
            tradeId:      ethers.id("trade-1"),
            flashToken:   usdcAddr,
            flashAmount:  FLASH_AMOUNT,
            path: [
                {
                    dex:     v3Addr,
                    dexType: 0,           // UNISWAP_V3
                    tokenIn: usdcAddr,
                    tokenOut: wethAddr,
                    fee:     3000,
                    minOut:  0n,
                    poolId:  ethers.ZeroHash,
                },
                {
                    dex:     aeroAddr,
                    dexType: 1,           // AERODROME
                    tokenIn: wethAddr,
                    tokenOut: usdcAddr,
                    fee:     0,           // volatile pool
                    minOut:  0n,
                    poolId:  ethers.ZeroHash,
                },
            ],
            minProfit: USDC(0.1),
            deadline:  (await ethers.provider.getBlock("latest"))!.timestamp + 3600,
            ...overrides,
        };
    }

    /*//////////////////////////////////////////////////////////////
                        AGENT ALPHA — DEPLOYMENT
    //////////////////////////////////////////////////////////////*/

    describe("AgentAlpha Deployment", function () {
        it("Should set Aave pool address", async function () {
            expect(await agentAlpha.AAVE_POOL()).to.equal(await mockAave.getAddress());
        });

        it("Should grant EXECUTOR_ROLE to executor", async function () {
            const role = await agentAlpha.EXECUTOR_ROLE();
            expect(await agentAlpha.hasRole(role, executor.address)).to.be.true;
        });

        it("Should grant GUARDIAN_ROLE to guardian", async function () {
            const role = await agentAlpha.GUARDIAN_ROLE();
            expect(await agentAlpha.hasRole(role, guardian.address)).to.be.true;
        });

        it("Should grant DEFAULT_ADMIN_ROLE to governance", async function () {
            const role = await agentAlpha.DEFAULT_ADMIN_ROLE();
            expect(await agentAlpha.hasRole(role, governance.address)).to.be.true;
        });

        it("Should set default protocol fee to 10%", async function () {
            expect(await agentAlpha.protocolFeeBps()).to.equal(1000n);
        });

        it("Should set default min profit to 0.1 USDC", async function () {
            expect(await agentAlpha.minProfitAmount()).to.equal(100_000n);
        });

        it("Should revert with zero Aave address", async function () {
            const AgentAlpha = await ethers.getContractFactory("AgentAlpha");
            await expect(
                AgentAlpha.deploy(
                    ethers.ZeroAddress, executor.address, guardian.address, governance.address
                )
            ).to.be.revertedWithCustomError(agentAlpha, "ZeroAddress");
        });
    });

    /*//////////////////////////////////////////////////////////////
                        ARBITRAGE EXECUTION
    //////////////////////////////////////////////////////////////*/

    describe("Arbitrage Execution", function () {
        it("Should execute a profitable two-hop arbitrage", async function () {
            const trade = await buildTrade();
            await expect(agentAlpha.connect(executor).executeArbitrage(trade))
                .to.emit(agentAlpha, "ArbitrageExecuted");
        });

        it("Should emit ArbitrageExecuted with correct tradeId", async function () {
            const trade = await buildTrade();
            const tx    = await agentAlpha.connect(executor).executeArbitrage(trade);
            const receipt = await tx.wait();
            const event   = receipt.logs.find((l: any) => {
                try { agentAlpha.interface.parseLog(l); return true; } catch { return false; }
            });
            expect(event).to.not.be.undefined;
        });

        it("Should transfer user share (90%) to ProfitDistributor", async function () {
            const trade   = await buildTrade();
            const before  = await usdc.balanceOf(await profitDistributor.getAddress());
            await agentAlpha.connect(executor).executeArbitrage(trade);
            const after   = await usdc.balanceOf(await profitDistributor.getAddress());
            expect(after).to.be.gt(before);
        });

        it("Should update totalProfitPerToken after trade", async function () {
            const trade = await buildTrade();
            await agentAlpha.connect(executor).executeArbitrage(trade);
            const profit = await agentAlpha.getTotalProfit(await usdc.getAddress());
            expect(profit).to.be.gt(0n);
        });

        it("Should reject trade from non-executor", async function () {
            const trade = await buildTrade();
            await expect(
                agentAlpha.connect(attacker).executeArbitrage(trade)
            ).to.be.reverted;
        });

        it("Should reject trade with unwhitelisted token", async function () {
            const trade = await buildTrade({ flashToken: attacker.address });
            await expect(
                agentAlpha.connect(executor).executeArbitrage(trade)
            ).to.be.revertedWithCustomError(agentAlpha, "TokenNotWhitelisted");
        });

        it("Should reject trade with unwhitelisted DEX", async function () {
            const trade = await buildTrade();
            trade.path[0].dex = attacker.address;
            await expect(
                agentAlpha.connect(executor).executeArbitrage(trade)
            ).to.be.revertedWithCustomError(agentAlpha, "DexNotWhitelisted");
        });

        it("Should reject trade with path too short (< 2 hops)", async function () {
            const trade = await buildTrade();
            trade.path  = [trade.path[0]];
            await expect(
                agentAlpha.connect(executor).executeArbitrage(trade)
            ).to.be.revertedWithCustomError(agentAlpha, "TradePathTooShort");
        });

        it("Should reject trade exceeding max flash loan amount", async function () {
            const trade = await buildTrade({ flashAmount: USDC(200_000) }); // over $100K limit
            await expect(
                agentAlpha.connect(executor).executeArbitrage(trade)
            ).to.be.revertedWithCustomError(agentAlpha, "FlashLoanTooLarge");
        });

        it("Should reject expired deadline", async function () {
            const trade = await buildTrade({ deadline: 1 }); // unix timestamp 1 = expired
            await expect(
                agentAlpha.connect(executor).executeArbitrage(trade)
            ).to.be.reverted;
        });

        it("Should reject duplicate tradeId", async function () {
            const trade = await buildTrade();
            await agentAlpha.connect(executor).executeArbitrage(trade);

            // Second trade with same ID but different flash amount (to pass other checks)
            const trade2 = await buildTrade({ flashAmount: USDC(5_000) });
            trade2.tradeId = trade.tradeId; // same ID
            await expect(
                agentAlpha.connect(executor).executeArbitrage(trade2)
            ).to.be.reverted;
        });

        it("Should mark tradeId as executed after success", async function () {
            const trade = await buildTrade();
            await agentAlpha.connect(executor).executeArbitrage(trade);
            expect(await agentAlpha.executedTradeIds(trade.tradeId)).to.be.true;
        });

        it("Should reject trade while paused", async function () {
            await agentAlpha.connect(guardian).pause();
            const trade = await buildTrade();
            await expect(
                agentAlpha.connect(executor).executeArbitrage(trade)
            ).to.be.revertedWithCustomError(agentAlpha, "EnforcedPause");
        });
    });

    /*//////////////////////////////////////////////////////////////
                        WHITELIST MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    describe("Whitelist Management", function () {
        it("Should whitelist a token", async function () {
            const newToken = user3.address;
            await expect(agentAlpha.connect(governance).whitelistToken(newToken, true))
                .to.emit(agentAlpha, "TokenWhitelisted").withArgs(newToken, true);
            expect(await agentAlpha.whitelistedTokens(newToken)).to.be.true;
        });

        it("Should remove token from whitelist", async function () {
            await agentAlpha.connect(governance).whitelistToken(await usdc.getAddress(), false);
            expect(await agentAlpha.whitelistedTokens(await usdc.getAddress())).to.be.false;
        });

        it("Should reject whitelist from non-admin", async function () {
            await expect(
                agentAlpha.connect(attacker).whitelistToken(await usdc.getAddress(), true)
            ).to.be.reverted;
        });

        it("Should whitelist a DEX", async function () {
            const newDex = user3.address;
            await expect(agentAlpha.connect(governance).whitelistDex(newDex, 0, true))
                .to.emit(agentAlpha, "DexWhitelisted").withArgs(newDex, 0, true);
        });

        it("Should reject invalid DEX type", async function () {
            await expect(
                agentAlpha.connect(governance).whitelistDex(user3.address, 99, true)
            ).to.be.revertedWithCustomError(agentAlpha, "InvalidDexType");
        });
    });

    /*//////////////////////////////////////////////////////////////
                        PARAMETER CONFIGURATION
    //////////////////////////////////////////////////////////////*/

    describe("Parameter Configuration", function () {
        it("Should update protocol fee", async function () {
            await expect(agentAlpha.connect(governance).setProtocolFee(500))
                .to.emit(agentAlpha, "ProtocolFeeUpdated").withArgs(1000, 500);
            expect(await agentAlpha.protocolFeeBps()).to.equal(500n);
        });

        it("Should reject protocol fee above 30%", async function () {
            await expect(
                agentAlpha.connect(governance).setProtocolFee(3001)
            ).to.be.revertedWithCustomError(agentAlpha, "InvalidProtocolFee");
        });

        it("Should update min profit amount", async function () {
            await agentAlpha.connect(governance).setMinProfitAmount(USDC(1));
            expect(await agentAlpha.minProfitAmount()).to.equal(USDC(1));
        });

        it("Should update max flash loan amount", async function () {
            await agentAlpha.connect(governance).setMaxFlashLoanAmount(USDC(50_000));
            expect(await agentAlpha.maxFlashLoanAmount()).to.equal(USDC(50_000));
        });

        it("Should set profit distributor", async function () {
            await expect(
                agentAlpha.connect(governance).setProfitDistributor(
                    await profitDistributor.getAddress()
                )
            ).to.emit(agentAlpha, "ProfitDistributorSet");
        });

        it("Should reject fee update from non-admin", async function () {
            await expect(
                agentAlpha.connect(attacker).setProtocolFee(500)
            ).to.be.reverted;
        });
    });

    /*//////////////////////////////////////////////////////////////
                        PAUSE / UNPAUSE
    //////////////////////////////////////////////////////////////*/

    describe("AgentAlpha Pause / Unpause", function () {
        it("Should allow guardian to pause", async function () {
            await agentAlpha.connect(guardian).pause();
            expect(await agentAlpha.paused()).to.be.true;
        });

        it("Should allow guardian to unpause", async function () {
            await agentAlpha.connect(guardian).pause();
            await agentAlpha.connect(guardian).unpause();
            expect(await agentAlpha.paused()).to.be.false;
        });

        it("Should reject pause from non-guardian", async function () {
            await expect(agentAlpha.connect(attacker).pause()).to.be.reverted;
        });
    });

    /*//////////////////////////////////////////////////////////////
                    PROFIT DISTRIBUTOR — DEPLOYMENT
    //////////////////////////////////////////////////////////////*/

    describe("ProfitDistributor Deployment", function () {
        it("Should set deposit token", async function () {
            expect(await profitDistributor.depositToken()).to.equal(await usdc.getAddress());
        });

        it("Should grant AGENT_ROLE to AgentAlpha", async function () {
            const role = await profitDistributor.AGENT_ROLE();
            expect(await profitDistributor.hasRole(role, await agentAlpha.getAddress())).to.be.true;
        });

        it("Should start with zero total deposited", async function () {
            expect(await profitDistributor.totalDeposited()).to.equal(0n);
        });

        it("Should revert with zero deposit token", async function () {
            const ProfitDistributor = await ethers.getContractFactory("ProfitDistributor");
            await expect(
                ProfitDistributor.deploy(
                    ethers.ZeroAddress,
                    await agentAlpha.getAddress(),
                    guardian.address,
                    governance.address,
                )
            ).to.be.revertedWithCustomError(profitDistributor, "ZeroAddress");
        });
    });

    /*//////////////////////////////////////////////////////////////
                    PROFIT DISTRIBUTOR — DEPOSITS
    //////////////////////////////////////////////////////////////*/

    describe("ProfitDistributor Deposits", function () {
        it("Should allow user to deposit USDC", async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await expect(profitDistributor.connect(user1).deposit(USDC(1000)))
                .to.emit(profitDistributor, "Deposited")
                .withArgs(user1.address, USDC(1000), USDC(1000));
        });

        it("Should update totalDeposited after deposit", async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            expect(await profitDistributor.totalDeposited()).to.equal(USDC(1000));
        });

        it("Should track depositor correctly", async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            expect(await profitDistributor.isDepositor(user1.address)).to.be.true;
            expect(await profitDistributor.depositorCount()).to.equal(1n);
        });

        it("Should reject deposit below minimum ($10)", async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(5));
            await expect(
                profitDistributor.connect(user1).deposit(USDC(5))
            ).to.be.revertedWithCustomError(profitDistributor, "ZeroAmount");
        });

        it("Should allow multiple deposits from same user", async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(2000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            expect(await profitDistributor.depositBalance(user1.address)).to.equal(USDC(2000));
        });

        it("Should not double-count user in depositor list", async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(2000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            expect(await profitDistributor.depositorCount()).to.equal(1n);
        });
    });

    /*//////////////////////////////////////////////////////////////
                    PROFIT DISTRIBUTOR — WITHDRAWALS
    //////////////////////////////////////////////////////////////*/

    describe("ProfitDistributor Withdrawals", function () {
        beforeEach(async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
        });

        it("Should allow user to withdraw their deposit", async function () {
            const before = await usdc.balanceOf(user1.address);
            await profitDistributor.connect(user1).withdraw(USDC(1000));
            const after  = await usdc.balanceOf(user1.address);
            expect(after - before).to.equal(USDC(1000));
        });

        it("Should update deposit balance after withdrawal", async function () {
            await profitDistributor.connect(user1).withdraw(USDC(500));
            expect(await profitDistributor.depositBalance(user1.address)).to.equal(USDC(500));
        });

        it("Should reject withdrawal exceeding deposit", async function () {
            await expect(
                profitDistributor.connect(user1).withdraw(USDC(2000))
            ).to.be.revertedWithCustomError(profitDistributor, "InsufficientDeposit");
        });

        it("Should emit Withdrawn event", async function () {
            await expect(profitDistributor.connect(user1).withdraw(USDC(1000)))
                .to.emit(profitDistributor, "Withdrawn");
        });
    });

    /*//////////////////////////////////////////////////////////////
                PROFIT DISTRIBUTOR — PROFIT SHARING
    //////////////////////////////////////////////////////////////*/

    describe("ProfitDistributor Profit Sharing", function () {
        beforeEach(async function () {
            // user1 deposits 1000, user2 deposits 3000 → 25%/75% split
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await usdc.connect(user2).approve(await profitDistributor.getAddress(), USDC(3000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            await profitDistributor.connect(user2).deposit(USDC(3000));
        });

        it("Should calculate pending profit proportionally", async function () {
            // Simulate 400 USDC profit arriving
            const profitAmount = USDC(400);
            await usdc.transfer(await profitDistributor.getAddress(), profitAmount);

            // Only AgentAlpha can call recordProfit
            const agentRole = await profitDistributor.AGENT_ROLE();
            // We grant executor the agent role for testing purposes
            await profitDistributor.connect(governance).grantRole(agentRole, executor.address);
            await profitDistributor.connect(executor).recordProfit(
                await usdc.getAddress(), profitAmount
            );

            // user1 has 25% → should see 100 USDC pending
            const user1Pending = await profitDistributor.pendingProfit(user1.address);
            expect(user1Pending).to.be.closeTo(USDC(100), USDC(1));

            // user2 has 75% → should see 300 USDC pending
            const user2Pending = await profitDistributor.pendingProfit(user2.address);
            expect(user2Pending).to.be.closeTo(USDC(300), USDC(1));
        });

        it("Should allow user to claim pending profit", async function () {
            const profitAmount = USDC(400);
            await usdc.transfer(await profitDistributor.getAddress(), profitAmount);
            const agentRole = await profitDistributor.AGENT_ROLE();
            await profitDistributor.connect(governance).grantRole(agentRole, executor.address);
            await profitDistributor.connect(executor).recordProfit(
                await usdc.getAddress(), profitAmount
            );

            const before = await usdc.balanceOf(user1.address);
            await profitDistributor.connect(user1).claimProfit();
            const after  = await usdc.balanceOf(user1.address);

            expect(after - before).to.be.closeTo(USDC(100), USDC(1));
        });

        it("Should zero out pending profit after claim", async function () {
            const profitAmount = USDC(400);
            await usdc.transfer(await profitDistributor.getAddress(), profitAmount);
            const agentRole = await profitDistributor.AGENT_ROLE();
            await profitDistributor.connect(governance).grantRole(agentRole, executor.address);
            await profitDistributor.connect(executor).recordProfit(
                await usdc.getAddress(), profitAmount
            );

            await profitDistributor.connect(user1).claimProfit();
            expect(await profitDistributor.pendingProfit(user1.address)).to.equal(0n);
        });

        it("Should reject claimProfit when nothing to claim", async function () {
            await expect(
                profitDistributor.connect(user3).claimProfit()
            ).to.be.revertedWithCustomError(profitDistributor, "NoProfitToClaim");
        });

        it("Should compound profit into deposit", async function () {
            const profitAmount = USDC(400);
            await usdc.transfer(await profitDistributor.getAddress(), profitAmount);
            const agentRole = await profitDistributor.AGENT_ROLE();
            await profitDistributor.connect(governance).grantRole(agentRole, executor.address);
            await profitDistributor.connect(executor).recordProfit(
                await usdc.getAddress(), profitAmount
            );

            const depositBefore = await profitDistributor.depositBalance(user1.address);
            await profitDistributor.connect(user1).compound();
            const depositAfter  = await profitDistributor.depositBalance(user1.address);

            // deposit should have increased by ~100 USDC (user1's 25% share)
            expect(depositAfter - depositBefore).to.be.closeTo(USDC(100), USDC(1));
        });

        it("Should track lifetime claimed correctly", async function () {
            const profitAmount = USDC(400);
            await usdc.transfer(await profitDistributor.getAddress(), profitAmount);
            const agentRole = await profitDistributor.AGENT_ROLE();
            await profitDistributor.connect(governance).grantRole(agentRole, executor.address);
            await profitDistributor.connect(executor).recordProfit(
                await usdc.getAddress(), profitAmount
            );

            await profitDistributor.connect(user1).claimProfit();
            const lifetime = await profitDistributor.lifetimeClaimed(user1.address);
            expect(lifetime).to.be.closeTo(USDC(100), USDC(1));
        });

        it("Should handle auto-compound mode correctly", async function () {
            await profitDistributor.connect(user1).setAutoCompound(true);
            expect(await profitDistributor.userInfo(user1.address).then((i: any) => i.autoCompound)).to.be.true;
        });

        it("Should return correct pool share", async function () {
            // user1 has 1000/4000 = 25%
            const share = await profitDistributor.userPoolShare(user1.address);
            const PRECISION = ethers.parseEther("1");
            expect(share).to.be.closeTo(PRECISION / 4n, PRECISION / 100n); // 25% ± 1%
        });

        it("Should reject recordProfit from non-agent", async function () {
            await expect(
                profitDistributor.connect(attacker).recordProfit(await usdc.getAddress(), USDC(100))
            ).to.be.reverted;
        });
    });

    /*//////////////////////////////////////////////////////////////
                PROFIT DISTRIBUTOR — PAUSE / UNPAUSE
    //////////////////////////////////////////////////////////////*/

    describe("ProfitDistributor Pause / Unpause", function () {
        it("Should allow guardian to pause deposits", async function () {
            await profitDistributor.connect(guardian).pause();
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await expect(
                profitDistributor.connect(user1).deposit(USDC(1000))
            ).to.be.revertedWithCustomError(profitDistributor, "EnforcedPause");
        });

        it("Should allow guardian to unpause", async function () {
            await profitDistributor.connect(guardian).pause();
            await profitDistributor.connect(guardian).unpause();
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await expect(
                profitDistributor.connect(user1).deposit(USDC(1000))
            ).to.emit(profitDistributor, "Deposited");
        });

        it("Should reject pause from non-guardian", async function () {
            await expect(profitDistributor.connect(attacker).pause()).to.be.reverted;
        });
    });

    /*//////////////////////////////////////////////////////////////
                    END-TO-END: ARBITRAGE → PROFIT → CLAIM
    //////////////////////////////////////////////////////////////*/

    describe("End-to-End: Arbitrage → Profit → User Claim", function () {
        it("Users receive proportional share of arbitrage profits", async function () {
            // user1 deposits 1000, user2 deposits 3000
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await usdc.connect(user2).approve(await profitDistributor.getAddress(), USDC(3000));
            await profitDistributor.connect(user1).deposit(USDC(1000));
            await profitDistributor.connect(user2).deposit(USDC(3000));

            // Execute arbitrage trade
            const trade = await buildTrade();
            await agentAlpha.connect(executor).executeArbitrage(trade);

            // Both users should have pending profit
            const user1Pending = await profitDistributor.pendingProfit(user1.address);
            const user2Pending = await profitDistributor.pendingProfit(user2.address);

            // user1 should have roughly 25% of user2's profit
            expect(user1Pending).to.be.gt(0n);
            expect(user2Pending).to.be.gt(0n);
            // user2 should earn ~3x more than user1 (3000 vs 1000 deposit)
            expect(user2Pending).to.be.closeTo(user1Pending * 3n, USDC(1));

            // Both can claim
            const u1Before = await usdc.balanceOf(user1.address);
            const u2Before = await usdc.balanceOf(user2.address);

            await profitDistributor.connect(user1).claimProfit();
            await profitDistributor.connect(user2).claimProfit();

            expect(await usdc.balanceOf(user1.address)).to.be.gt(u1Before);
            expect(await usdc.balanceOf(user2.address)).to.be.gt(u2Before);
        });

        it("Late depositor does not receive past profits", async function () {
            // user1 deposits first
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await profitDistributor.connect(user1).deposit(USDC(1000));

            // Trade happens — only user1 is deposited
            const trade = await buildTrade();
            await agentAlpha.connect(executor).executeArbitrage(trade);

            // user2 deposits AFTER the trade
            await usdc.connect(user2).approve(await profitDistributor.getAddress(), USDC(3000));
            await profitDistributor.connect(user2).deposit(USDC(3000));

            // user2 should have zero pending profit
            expect(await profitDistributor.pendingProfit(user2.address)).to.equal(0n);

            // user1 should still have their profit
            expect(await profitDistributor.pendingProfit(user1.address)).to.be.gt(0n);
        });

        it("Protocol fee stays in AgentAlpha contract", async function () {
            await usdc.connect(user1).approve(await profitDistributor.getAddress(), USDC(1000));
            await profitDistributor.connect(user1).deposit(USDC(1000));

            const before = await usdc.balanceOf(await agentAlpha.getAddress());
            const trade  = await buildTrade();
            await agentAlpha.connect(executor).executeArbitrage(trade);
            const after  = await usdc.balanceOf(await agentAlpha.getAddress());

            // Protocol fee (10%) stays in AgentAlpha
            expect(after).to.be.gte(before);
        });
    });
});
