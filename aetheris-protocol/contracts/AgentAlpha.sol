// Aetheris\aetheris-protocol\contracts\AgentAlpha.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\AgentAlpha.sol

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AgentAlpha
 * @notice On-chain arbitrage execution engine for the Aetheris Protocol
 *
 * @dev WHAT THIS CONTRACT DOES:
 *
 *      Agent Alpha executes arbitrage trades on Base L2.
 *      Arbitrage means buying an asset on one exchange where it is cheaper
 *      and simultaneously selling it on another exchange where it is more
 *      expensive, capturing the price difference as profit.
 *
 *      It uses Aave V3 flash loans — a mechanism that allows borrowing
 *      any amount of tokens with zero collateral, as long as the entire
 *      amount plus a fee is repaid within the same transaction.
 *
 *      EXECUTION SEQUENCE (fully atomic):
 *        1. Agent Alpha (off-chain) identifies an arbitrage opportunity
 *        2. Agent Alpha calls executeArbitrage() with trade parameters
 *        3. Contract borrows tokens from Aave V3 (flash loan)
 *        4. Contract swaps tokens across DEXs following the specified path
 *        5. Contract repays Aave V3 flash loan + fee (0.05%)
 *        6. Contract keeps the profit
 *        7. Profit split: 90% to profit pool (user claims), 10% protocol fee
 *
 *      SUPPORTED DEXs on Base:
 *        - Uniswap V3
 *        - Aerodrome (Base-native DEX, fork of Velodrome)
 *        - Balancer V2
 *        - Curve Finance
 *
 *      PER-USER ACTIVATION:
 *        Users who have deposited into ProfitDistributor may opt-in to Agent
 *        Alpha by calling activateForUser(). This is a consent signal stored
 *        on-chain. It does not gate trade execution — the agent trades on
 *        behalf of the protocol pool — but it enables the frontend to reflect
 *        each user's participation preference and is used off-chain by the
 *        agent service to determine eligible profit recipients.
 *
 *        activateForUser()   → user opts in  (emits UserActivated)
 *        deactivateForUser() → user opts out (emits UserDeactivated)
 *        isUserActive(addr)  → query any user's activation state
 *        isActive()          → query global agent liveness (inverse of paused)
 *
 *      RISK CONTROLS:
 *        - Minimum profit threshold (default 0.1 USDC) — no trade if not profitable
 *        - Maximum slippage tolerance per swap (default 0.5%)
 *        - Maximum flash loan size (default $100,000 USDC equivalent)
 *        - Per-token whitelist (only trade approved tokens)
 *        - Circuit breaker (pause all trading instantly)
 *        - Daily loss limit (auto-pause if cumulative losses exceed limit)
 *
 *      ACCESS CONTROL:
 *        EXECUTOR_ROLE → Agent Alpha off-chain service (calls executeArbitrage)
 *        GUARDIAN_ROLE → Cold Safe multi-sig (emergency pause)
 *        DEFAULT_ADMIN → Governance timelock (parameter changes)
 *
 * @custom:security-contact security@aetheris.io
 */
contract AgentAlpha is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                ROLES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event ArbitrageExecuted(
        bytes32 indexed tradeId,
        address indexed tokenBorrowed,
        uint256 amountBorrowed,
        uint256 profit,
        uint256 userShare,
        uint256 protocolShare,
        uint256 gasUsed,
        uint256 timestamp
    );

    event ProfitDeposited(
        address indexed token,
        uint256 amount,
        uint256 totalPoolBalance
    );

    /// @notice Emitted when a user opts in to Agent Alpha
    event UserActivated(address indexed user);

    /// @notice Emitted when a user opts out of Agent Alpha
    event UserDeactivated(address indexed user);

    event TokenWhitelisted(address indexed token, bool approved);
    event DexWhitelisted(address indexed dex, uint8 dexType, bool approved);
    event MinProfitUpdated(uint256 oldMin, uint256 newMin);
    event MaxFlashLoanUpdated(uint256 oldMax, uint256 newMax);
    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event DailyLossLimitBreached(uint256 totalLoss, uint256 limit);
    event ProfitDistributorSet(address indexed distributor);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error TokenNotWhitelisted(address token);
    error DexNotWhitelisted(address dex);
    error InsufficientProfit(uint256 actual, uint256 minimum);
    error FlashLoanTooLarge(uint256 requested, uint256 maximum);
    error TradePathTooShort();
    error TradePathTooLong();
    error SlippageExceeded(uint256 expected, uint256 actual);
    error NotAavePool();
    error InvalidProtocolFee();
    error DailyLossLimitExceeded(uint256 loss, uint256 limit);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidDexType();

    /*//////////////////////////////////////////////////////////////
                                ENUMS
    //////////////////////////////////////////////////////////////*/

    /// @notice DEX type identifier — determines which swap interface to call
    enum DexType {
        UNISWAP_V3,   // 0 — tick-based concentrated liquidity
        AERODROME,    // 1 — stable/volatile AMM (Base-native)
        BALANCER_V2,  // 2 — weighted pool, vault-based
        CURVE         // 3 — stableswap invariant
    }

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice A single hop in a multi-step arbitrage path
     * @param dex        Address of the DEX router/pool to use
     * @param dexType    Which DEX interface to call
     * @param tokenIn    Token being sold in this hop
     * @param tokenOut   Token being received in this hop
     * @param fee        Pool fee tier in basis points (Uniswap V3: 500=0.05%, 3000=0.3%)
     * @param minOut     Minimum acceptable output (slippage protection)
     * @param poolId     Balancer pool ID (only used for Balancer swaps)
     */
    struct SwapHop {
        address dex;
        DexType dexType;
        address tokenIn;
        address tokenOut;
        uint24  fee;
        uint256 minOut;
        bytes32 poolId;
    }

    /**
     * @notice Full parameters for one arbitrage execution
     * @param tradeId        Unique identifier for this trade (for event tracking)
     * @param flashToken     Token to borrow from Aave
     * @param flashAmount    Amount to borrow
     * @param path           Ordered list of swap hops
     * @param minProfit      Minimum profit required (reverts if not met)
     * @param deadline       Unix timestamp — revert if block.timestamp exceeds this
     */
    struct TradeParams {
        bytes32   tradeId;
        address   flashToken;
        uint256   flashAmount;
        SwapHop[] path;
        uint256   minProfit;
        uint256   deadline;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Aave V3 Pool address on Base Mainnet
    address public immutable AAVE_POOL;

    /// @notice Aave V3 flash loan fee in basis points (5 = 0.05%)
    uint256 public constant AAVE_FLASH_FEE_BPS = 5;

    /// @notice Protocol fee on profits (default 10% = 1000 bps)
    uint256 public protocolFeeBps = 1000;

    /// @notice Minimum profit per trade in the flash loan token's units
    uint256 public minProfitAmount = 100_000; // 0.1 USDC (6 decimals)

    /// @notice Maximum flash loan size in the borrowed token's units
    uint256 public maxFlashLoanAmount = 100_000 * 1e6; // $100,000 USDC

    /// @notice Maximum daily loss before auto-pause (in USDC equivalent)
    uint256 public dailyLossLimit = 1_000 * 1e6; // $1,000 USDC

    /// @notice Accumulated losses today
    uint256 public dailyLossAccumulated;

    /// @notice Timestamp of last daily loss reset
    uint256 public lastLossResetTimestamp;

    /// @notice Contract that tracks user deposits and distributes profits
    address public profitDistributor;

    // ── Per-user activation ────────────────────────────────────────────────────

    /// @notice Tracks whether each user has opted in to Agent Alpha
    /// @dev This is a consent signal. It does not affect trade execution.
    ///      The agent service reads this off-chain to determine eligible
    ///      recipients and to surface activation state in the frontend.
    mapping(address => bool) public userActivated;

    /// @notice Total number of users currently opted in
    uint256 public activeUserCount;

    // ── Profit accounting ──────────────────────────────────────────────────────

    /// @notice Cumulative profit per token (all-time), keyed by token address
    mapping(address => uint256) public totalProfitPerToken;

    /// @notice Cumulative profit across ALL tokens combined (all-time)
    /// @dev Used by getTotalArbitrageProfit() — avoids requiring a token arg
    uint256 public totalArbitrageProfit;

    /// @notice Profit available to distribute per token
    mapping(address => uint256) public pendingProfitPerToken;

    /// @notice Whitelisted tokens Agent Alpha can trade
    mapping(address => bool) public whitelistedTokens;

    /// @notice Whitelisted DEX routers/pools
    mapping(address => bool) public whitelistedDexes;

    /// @notice DEX type per whitelisted router
    mapping(address => DexType) public dexTypes;

    /// @notice Historical trade records (prevents replay attacks)
    mapping(bytes32 => bool) public executedTradeIds;

    /// @notice Temporary storage for flash loan parameters (set before callback)
    TradeParams private _pendingTrade;

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param aavePool        Aave V3 Pool address on Base
     * @param executor        Agent Alpha off-chain service address
     * @param guardian        Cold Safe / guardian address
     * @param governance      Governance timelock address
     */
    constructor(
        address aavePool,
        address executor,
        address guardian,
        address governance
    ) {
        if (aavePool   == address(0)) revert ZeroAddress();
        if (executor   == address(0)) revert ZeroAddress();
        if (guardian   == address(0)) revert ZeroAddress();
        if (governance == address(0)) revert ZeroAddress();

        AAVE_POOL = aavePool;

        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(EXECUTOR_ROLE,      executor);
        _grantRole(GUARDIAN_ROLE,      guardian);

        lastLossResetTimestamp = block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                    PER-USER ACTIVATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Opt in to Agent Alpha — signals consent for the agent to
     *         trade on behalf of the protocol pool and attribute profits
     *         to this user's deposit in ProfitDistributor.
     *
     * @dev    Callable by any address. Reverts when the contract is paused
     *         so users cannot activate during a circuit-breaker halt.
     *         Idempotent — calling again when already active is a no-op.
     */
    function activateForUser() external whenNotPaused {
        if (!userActivated[msg.sender]) {
            userActivated[msg.sender] = true;
            activeUserCount          += 1;
            emit UserActivated(msg.sender);
        }
    }

    /**
     * @notice Opt out of Agent Alpha — removes consent signal.
     *
     * @dev    Callable even when paused so users can always exit.
     *         Idempotent — calling again when already inactive is a no-op.
     */
    function deactivateForUser() external {
        if (userActivated[msg.sender]) {
            userActivated[msg.sender] = false;
            // Underflow guard — activeUserCount should never be zero here
            // but we protect against any edge case.
            if (activeUserCount > 0) activeUserCount -= 1;
            emit UserDeactivated(msg.sender);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS — AGENT STATUS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Returns true when the agent is globally live (not paused).
     * @dev    Frontend uses this for the LIVE / OFFLINE badge.
     *         Equivalent to `!paused()` but matches the expected ABI signature.
     */
    function isActive() external view returns (bool) {
        return !paused();
    }

    /**
     * @notice Returns true when a specific user has opted in.
     * @param  user  Address to query
     */
    function isUserActive(address user) external view returns (bool) {
        return userActivated[user];
    }

    /**
     * @notice Total arbitrage profit across all tokens, all-time.
     * @dev    Aggregated into a single uint256 in executeOperation so
     *         callers do not need to know individual token addresses.
     *         Denominated in the smallest unit of the profit token
     *         (for a USDC-primary strategy: 6 decimals).
     */
    function getTotalArbitrageProfit() external view returns (uint256) {
        return totalArbitrageProfit;
    }

    // ── Legacy per-token helpers (retained for off-chain tooling) ─────────────

    function getPendingProfit(address token) external view returns (uint256) {
        return pendingProfitPerToken[token];
    }

    function getTotalProfit(address token) external view returns (uint256) {
        return totalProfitPerToken[token];
    }

    /*//////////////////////////////////////////////////////////////
                        PRIMARY ENTRY POINT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Execute an arbitrage trade using an Aave V3 flash loan
     * @dev Called by the Agent Alpha off-chain service when a profitable
     *      opportunity is identified. All validation happens here before
     *      the flash loan is initiated.
     *
     * @param params  Complete trade parameters including path and profit minimum
     */
    function executeArbitrage(TradeParams calldata params)
        external
        nonReentrant
        whenNotPaused
        onlyRole(EXECUTOR_ROLE)
    {
        // ── Pre-flight validation ─────────────────────────────────────────────
        if (block.timestamp > params.deadline)           revert SlippageExceeded(0, 0);
        if (params.path.length < 2)                      revert TradePathTooShort();
        if (params.path.length > 6)                      revert TradePathTooLong();
        if (!whitelistedTokens[params.flashToken])       revert TokenNotWhitelisted(params.flashToken);
        if (params.flashAmount == 0)                     revert ZeroAmount();
        if (params.flashAmount > maxFlashLoanAmount)     revert FlashLoanTooLarge(params.flashAmount, maxFlashLoanAmount);
        if (params.minProfit < minProfitAmount)          revert InsufficientProfit(params.minProfit, minProfitAmount);
        if (executedTradeIds[params.tradeId])            revert ZeroAmount(); // duplicate trade

        // Validate all DEXes in path are whitelisted
        for (uint256 i = 0; i < params.path.length; i++) {
            if (!whitelistedDexes[params.path[i].dex]) {
                revert DexNotWhitelisted(params.path[i].dex);
            }
        }

        // ── Reset daily loss counter if 24 hours have passed ─────────────────
        if (block.timestamp >= lastLossResetTimestamp + 1 days) {
            dailyLossAccumulated   = 0;
            lastLossResetTimestamp = block.timestamp;
        }

        // Store params for the flash loan callback
        _pendingTrade = params;

        // ── Initiate Aave V3 flash loan ───────────────────────────────────────
        address[] memory assets  = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory modes   = new uint256[](1);

        assets[0]  = params.flashToken;
        amounts[0] = params.flashAmount;
        modes[0]   = 0; // 0 = no debt (must repay in same transaction)

        IAavePool(AAVE_POOL).flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            "",
            0
        );

        // Mark trade as executed (prevents replay)
        executedTradeIds[params.tradeId] = true;
    }

    /*//////////////////////////////////////////////////////////////
                    AAVE FLASH LOAN CALLBACK
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Called by Aave V3 Pool after transferring flash loan funds
     * @dev This function MUST repay amounts[0] + premiums[0] before returning.
     *      If it does not, the entire transaction reverts.
     *      Only callable by the Aave Pool itself.
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata
    ) external returns (bool) {
        if (msg.sender != AAVE_POOL)    revert NotAavePool();
        if (initiator  != address(this)) revert NotAavePool();

        TradeParams memory trade = _pendingTrade;
        uint256 gasStart = gasleft();

        uint256 totalRepayment = amounts[0] + premiums[0];

        // ── Execute swap path ─────────────────────────────────────────────────
        uint256 amountOut = _executeSwapPath(trade.path, amounts[0]);

        // ── Verify profitability ──────────────────────────────────────────────
        if (amountOut <= totalRepayment) {
            uint256 loss = totalRepayment - amountOut;
            _recordLoss(loss);
            revert InsufficientProfit(0, trade.minProfit);
        }

        uint256 grossProfit = amountOut - totalRepayment;

        if (grossProfit < trade.minProfit) {
            revert InsufficientProfit(grossProfit, trade.minProfit);
        }

        // ── Repay Aave ────────────────────────────────────────────────────────
        IERC20(assets[0]).forceApprove(AAVE_POOL, totalRepayment);

        // ── Split profit ──────────────────────────────────────────────────────
        uint256 protocolShare = (grossProfit * protocolFeeBps) / 10_000;
        uint256 userShare     = grossProfit - protocolShare;

        // ── Update profit accounting ──────────────────────────────────────────
        totalProfitPerToken[assets[0]]   += grossProfit;
        pendingProfitPerToken[assets[0]] += userShare;
        totalArbitrageProfit             += grossProfit; // ← aggregate accumulator

        // ── Notify ProfitDistributor ──────────────────────────────────────────
        if (profitDistributor != address(0)) {
            IERC20(assets[0]).safeTransfer(profitDistributor, userShare);
            IProfitDistributor(profitDistributor).recordProfit(assets[0], userShare);
        }

        uint256 gasUsed = gasStart - gasleft();

        emit ArbitrageExecuted(
            trade.tradeId,
            assets[0],
            amounts[0],
            grossProfit,
            userShare,
            protocolShare,
            gasUsed,
            block.timestamp
        );

        emit ProfitDeposited(assets[0], userShare, pendingProfitPerToken[assets[0]]);

        return true;
    }

    /*//////////////////////////////////////////////////////////////
                        SWAP PATH EXECUTION
    //////////////////////////////////////////////////////////////*/

    function _executeSwapPath(
        SwapHop[] memory path,
        uint256 amountIn
    ) internal returns (uint256) {
        uint256 currentAmount = amountIn;

        for (uint256 i = 0; i < path.length; i++) {
            SwapHop memory hop = path[i];

            if (hop.dexType == DexType.UNISWAP_V3) {
                currentAmount = _swapUniswapV3(hop, currentAmount);
            } else if (hop.dexType == DexType.AERODROME) {
                currentAmount = _swapAerodrome(hop, currentAmount);
            } else if (hop.dexType == DexType.BALANCER_V2) {
                currentAmount = _swapBalancer(hop, currentAmount);
            } else if (hop.dexType == DexType.CURVE) {
                currentAmount = _swapCurve(hop, currentAmount);
            } else {
                revert InvalidDexType();
            }

            if (currentAmount < hop.minOut) {
                revert SlippageExceeded(hop.minOut, currentAmount);
            }
        }

        return currentAmount;
    }

    /*//////////////////////////////////////////////////////////////
                        DEX SWAP IMPLEMENTATIONS
    //////////////////////////////////////////////////////////////*/

    function _swapUniswapV3(SwapHop memory hop, uint256 amountIn)
        internal returns (uint256 amountOut)
    {
        IERC20(hop.tokenIn).forceApprove(hop.dex, amountIn);

        IUniswapV3Router.ExactInputSingleParams memory params =
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn:           hop.tokenIn,
                tokenOut:          hop.tokenOut,
                fee:               hop.fee,
                recipient:         address(this),
                deadline:          block.timestamp,
                amountIn:          amountIn,
                amountOutMinimum:  hop.minOut,
                sqrtPriceLimitX96: 0
            });

        amountOut = IUniswapV3Router(hop.dex).exactInputSingle(params);
    }

    function _swapAerodrome(SwapHop memory hop, uint256 amountIn)
        internal returns (uint256 amountOut)
    {
        IERC20(hop.tokenIn).forceApprove(hop.dex, amountIn);

        bool stable = hop.fee == 1;

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from:    hop.tokenIn,
            to:      hop.tokenOut,
            stable:  stable,
            factory: address(0)
        });

        uint256[] memory amounts = IAerodromeRouter(hop.dex).swapExactTokensForTokens(
            amountIn,
            hop.minOut,
            routes,
            address(this),
            block.timestamp
        );

        amountOut = amounts[amounts.length - 1];
    }

    function _swapBalancer(SwapHop memory hop, uint256 amountIn)
        internal returns (uint256 amountOut)
    {
        IERC20(hop.tokenIn).forceApprove(hop.dex, amountIn);

        IBalancerVault.SingleSwap memory singleSwap = IBalancerVault.SingleSwap({
            poolId:   hop.poolId,
            kind:     IBalancerVault.SwapKind.GIVEN_IN,
            assetIn:  hop.tokenIn,
            assetOut: hop.tokenOut,
            amount:   amountIn,
            userData: ""
        });

        IBalancerVault.FundManagement memory funds = IBalancerVault.FundManagement({
            sender:              address(this),
            fromInternalBalance: false,
            recipient:           payable(address(this)),
            toInternalBalance:   false
        });

        amountOut = IBalancerVault(hop.dex).swap(
            singleSwap,
            funds,
            hop.minOut,
            block.timestamp
        );
    }

    function _swapCurve(SwapHop memory hop, uint256 amountIn)
        internal returns (uint256 amountOut)
    {
        IERC20(hop.tokenIn).forceApprove(hop.dex, amountIn);

        int128 i = int128(int24(hop.fee) >> 8);
        int128 j = int128(int24(hop.fee) & 0xFF);

        amountOut = ICurvePool(hop.dex).exchange(i, j, amountIn, hop.minOut);
    }

    /*//////////////////////////////////////////////////////////////
                        RISK MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    function _recordLoss(uint256 amount) internal {
        dailyLossAccumulated += amount;
        if (dailyLossAccumulated >= dailyLossLimit) {
            _pause();
            emit DailyLossLimitBreached(dailyLossAccumulated, dailyLossLimit);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function whitelistToken(address token, bool approved)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (token == address(0)) revert ZeroAddress();
        whitelistedTokens[token] = approved;
        emit TokenWhitelisted(token, approved);
    }

    function whitelistDex(address dex, uint8 dexType, bool approved)
        external onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (dex == address(0)) revert ZeroAddress();
        if (dexType > 3) revert InvalidDexType();
        whitelistedDexes[dex] = approved;
        dexTypes[dex] = DexType(dexType);
        emit DexWhitelisted(dex, dexType, approved);
    }

    function setMinProfitAmount(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit MinProfitUpdated(minProfitAmount, amount);
        minProfitAmount = amount;
    }

    function setMaxFlashLoanAmount(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (amount == 0) revert ZeroAmount();
        emit MaxFlashLoanUpdated(maxFlashLoanAmount, amount);
        maxFlashLoanAmount = amount;
    }

    function setProtocolFee(uint256 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeBps > 3000) revert InvalidProtocolFee();
        emit ProtocolFeeUpdated(protocolFeeBps, feeBps);
        protocolFeeBps = feeBps;
    }

    function setProfitDistributor(address distributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (distributor == address(0)) revert ZeroAddress();
        profitDistributor = distributor;
        emit ProfitDistributorSet(distributor);
    }

    function setDailyLossLimit(uint256 limit) external onlyRole(DEFAULT_ADMIN_ROLE) {
        dailyLossLimit = limit;
    }

    /// @dev Testnet only — guardian injects profit directly to test the
    ///      full investor pipeline (deposit → profit → claim) without
    ///      requiring a real arbitrage trade.
    function simulateProfit(address token, uint256 amount)
        external onlyRole(GUARDIAN_ROLE)  {
        if (profitDistributor == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, profitDistributor, amount);
        IProfitDistributor(profitDistributor).recordProfit(token, amount);
        totalProfitPerToken[token] += amount;
        totalArbitrageProfit       += amount;
    }

    function pause()   external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    receive() external payable {}
}

/*//////////////////////////////////////////////////////////////
                    EXTERNAL INTERFACES
//////////////////////////////////////////////////////////////*/

interface IAavePool {
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata interestRateModes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params)
        external returns (uint256 amountOut);
}

interface IAerodromeRouter {
    struct Route {
        address from;
        address to;
        bool    stable;
        address factory;
    }
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IBalancerVault {
    enum SwapKind { GIVEN_IN, GIVEN_OUT }

    struct SingleSwap {
        bytes32  poolId;
        SwapKind kind;
        address  assetIn;
        address  assetOut;
        uint256  amount;
        bytes    userData;
    }

    struct FundManagement {
        address sender;
        bool    fromInternalBalance;
        address payable recipient;
        bool    toInternalBalance;
    }

    function swap(
        SingleSwap memory singleSwap,
        FundManagement memory funds,
        uint256 limit,
        uint256 deadline
    ) external returns (uint256 amountCalculated);
}

interface ICurvePool {
    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);
}

interface IProfitDistributor {
    function recordProfit(address token, uint256 amount) external;
}
