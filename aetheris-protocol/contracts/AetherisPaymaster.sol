// Aetheris\aetheris-protocol\contracts\AetherisPaymaster.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol"; // ADD THIS LINE
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAetherisStaking {
    function getDiscount(address user) external view returns (uint256);
    function stakedBalance(address user) external view returns (uint256);
}

interface IUniswapV2Router {
    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
    
    function getAmountsIn(
        uint256 amountOut,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

/**
 * @title AetherisPaymaster
 * @notice ERC-4337 Paymaster that accepts USDC for gas payment
 * @dev Production implementation with:
 * - USDC → ETH conversion via DEX
 * - Tier-based fee discounts (0-100%)
 * - Revenue protection safeguards
 * - Rate limiting per user
 * - Gas tank budget management
 * - Emergency circuit breaker
 * 
 * Mathematical Safeguards:
 * - Weekly gas budget (% of protocol revenue)
 * - Per-transaction gas cap
 * - Per-user rate limiting
 * - Minimum trade size enforcement
 * - Slippage protection on swaps
 * 
 * @custom:security-contact security@aetheris.io
 */
contract AetherisPaymaster is BasePaymaster, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event UserOperationSponsored(
        address indexed account,
        uint256 usdcCharged,
        uint256 ethCost,
        uint256 discount
    );
    event GasTankRefilled(uint256 amount);
    event GasBudgetUpdated(uint256 newBudget);
    event EmergencyWithdraw(address token, uint256 amount);
    event CircuitBreakerTriggered(string reason);
    event RateLimitUpdated(uint256 newLimit);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InsufficientUSDC();
    error GasBudgetExceeded();
    error RateLimitExceeded();
    error GasCapExceeded();
    error TradeTooSmall();
    error SlippageExceeded();
    error CircuitBreakerActive();
    error InvalidConfiguration();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC token (Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
    IERC20 public immutable USDC;

    /// @notice WETH token (Base: 0x4200000000000000000000000000000000000006)
    address public immutable WETH;

    /// @notice Staking contract for discount queries
    IAetherisStaking public immutable staking;

    /// @notice DEX router for USDC → ETH swaps
    IUniswapV2Router public immutable dexRouter;

    /// @notice Weekly gas budget (in ETH wei)
    uint256 public weeklyGasBudget;

    /// @notice Current week's gas spent
    uint256 public weeklyGasSpent;

    /// @notice Week start timestamp
    uint256 public weekStartTime;

    /// @notice Maximum gas per transaction (200k gas)
    uint256 public constant MAX_GAS_PER_TX = 200_000;

    /// @notice Maximum transactions per user per hour
    uint256 public rateLimit = 50;

    /// @notice User rate limiting
    struct UserStats {
        uint256 lastHourStart;
        uint256 transactionsThisHour;
    }
    mapping(address => UserStats) public userStats;

    /// @notice Minimum trade size ($10 USDC in wei)
    uint256 public minTradeSize = 10 * 1e6; // USDC has 6 decimals

    /// @notice Maximum slippage tolerance (5%)
    uint256 public constant MAX_SLIPPAGE = 500; // 5% in basis points

    /// @notice Circuit breaker (emergency pause)
    bool public circuitBreakerActive;

    /// @notice Price markup for USDC → ETH (110% = 10% protocol fee)
    uint256 public priceMarkup = 11000; // 110% in basis points

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        IEntryPoint _entryPoint,
        address _usdc,
        address _weth,
        address _staking,
        address _dexRouter,
        uint256 _weeklyGasBudget
    ) BasePaymaster(_entryPoint) {
        if (_usdc == address(0) || _weth == address(0) || _staking == address(0) || _dexRouter == address(0)) {
            revert InvalidConfiguration();
        }
        
        USDC = IERC20(_usdc);
        WETH = _weth;
        staking = IAetherisStaking(_staking);
        dexRouter = IUniswapV2Router(_dexRouter);
        weeklyGasBudget = _weeklyGasBudget;
        weekStartTime = block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                        PAYMASTER LOGIC
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Validate if paymaster will sponsor this operation
     * @param userOp User operation to validate
     * @param userOpHash Hash of the user operation
     * @param maxCost Maximum ETH cost
     * @return context Encoded data for postOp
     * @return validationData Validation result
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        (userOpHash); // Silence unused

        // Check circuit breaker
        if (circuitBreakerActive) revert CircuitBreakerActive();

        // Get account address
        address account = userOp.sender;

        // Check rate limiting
        _checkRateLimit(account);

        // Unpack gas limits from accountGasLimits (packed as uint128 + uint128)
        uint256 callGasLimit = uint128(bytes16(userOp.accountGasLimits));
        
        // Check gas cap
        if (callGasLimit > MAX_GAS_PER_TX) revert GasCapExceeded();
        // Check weekly budget
        _checkWeeklyBudget(maxCost);

        // Calculate USDC cost with discount
        (uint256 usdcCost, uint256 discount) = _calculateUSDCCost(account, maxCost);

        // Check minimum trade size
        if (usdcCost < minTradeSize) revert TradeTooSmall();

        // Verify user has enough USDC
        uint256 userBalance = USDC.balanceOf(account);
        if (userBalance < usdcCost) revert InsufficientUSDC();

        // Encode context for postOp
        context = abi.encode(account, usdcCost, maxCost, discount);

        return (context, 0); // 0 = validation success
    }

    /**
     * @notice Post-operation processing
     * @param mode Mode (opSucceeded, opReverted, postOpReverted)
     * @param context Encoded data from validatePaymasterUserOp
     * @param actualGasCost Actual ETH spent
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) internal override nonReentrant {
        (mode); // Silence unused
        (actualUserOpFeePerGas); // Silence unused

        // Decode context
        (
            address account,
            uint256 estimatedUSDC,
            uint256 estimatedETH,
            uint256 discount
        ) = abi.decode(context, (address, uint256, uint256, uint256));

        // Calculate actual USDC needed
        uint256 actualUSDC = (estimatedUSDC * actualGasCost) / estimatedETH;

        // Transfer USDC from user to paymaster
        USDC.safeTransferFrom(account, address(this), actualUSDC);

        // Convert USDC → ETH to reimburse EntryPoint
        _swapUSDCForETH(actualGasCost);

        // Update gas spent
        weeklyGasSpent += actualGasCost;

        emit UserOperationSponsored(account, actualUSDC, actualGasCost, discount);
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Calculate USDC cost with tier discount
     * @param account User account
     * @param ethCost ETH cost in wei
     * @return usdcCost USDC amount to charge (6 decimals)
     * @return discount Discount applied in basis points
     */
    function _calculateUSDCCost(
        address account,
        uint256 ethCost
    ) internal view returns (uint256 usdcCost, uint256 discount) {
        // Get user's discount tier (0-10000 basis points)
        discount = staking.getDiscount(account);

        // Get ETH price in USDC (mock: $3000/ETH = 3000 USDC)
        // In production, use Chainlink price feed
        uint256 ethPriceUSDC = 3000 * 1e6; // $3000 with 6 decimals

        // Calculate base USDC cost
        uint256 baseCost = (ethCost * ethPriceUSDC) / 1 ether;

        // Apply price markup (protocol fee)
        baseCost = (baseCost * priceMarkup) / 10000;

        // Apply tier discount
        if (discount > 0) {
            uint256 discountAmount = (baseCost * discount) / 10000;
            usdcCost = baseCost - discountAmount;
        } else {
            usdcCost = baseCost;
        }

        return (usdcCost, discount);
    }

    /**
     * @notice Swap USDC for exact ETH amount
     * @param ethAmount Exact ETH needed
     */
    function _swapUSDCForETH(uint256 ethAmount) internal {
        // Get USDC amount needed for exact ETH
        address[] memory path = new address[](2);
        path[0] = address(USDC);
        path[1] = WETH;

        uint256[] memory amountsIn = dexRouter.getAmountsIn(ethAmount, path);
        uint256 usdcNeeded = amountsIn[0];

        // Check slippage
        uint256 usdcBalance = USDC.balanceOf(address(this));
        uint256 maxSlippage = (usdcNeeded * (10000 + MAX_SLIPPAGE)) / 10000;
        if (usdcBalance < maxSlippage) revert SlippageExceeded();

        // Approve router
        USDC.approve(address(dexRouter), maxSlippage);

        // Execute swap
        dexRouter.swapTokensForExactETH(
            ethAmount,
            maxSlippage,
            path,
            address(this),
            block.timestamp + 300 // 5 min deadline
        );
    }

    /**
     * @notice Check and update rate limit
     * @param account User account
     */
    function _checkRateLimit(address account) internal {
        UserStats storage stats = userStats[account];

        // Reset counter if new hour
        if (block.timestamp >= stats.lastHourStart + 1 hours) {
            stats.lastHourStart = block.timestamp;
            stats.transactionsThisHour = 0;
        }

        // Check limit
        if (stats.transactionsThisHour >= rateLimit) {
            revert RateLimitExceeded();
        }

        stats.transactionsThisHour++;
    }

    /**
     * @notice Check weekly gas budget
     * @param gasCost Gas cost to check
     */
    function _checkWeeklyBudget(uint256 gasCost) internal {
        // Reset if new week
        if (block.timestamp >= weekStartTime + 1 weeks) {
            weekStartTime = block.timestamp;
            weeklyGasSpent = 0;
        }

        // Check budget
        if (weeklyGasSpent + gasCost > weeklyGasBudget) {
            emit CircuitBreakerTriggered("Weekly budget exceeded");
            circuitBreakerActive = true;
            revert GasBudgetExceeded();
        }
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Update weekly gas budget
     * @param newBudget New budget in ETH wei
     */
    function setWeeklyGasBudget(uint256 newBudget) external onlyOwner {
        weeklyGasBudget = newBudget;
        emit GasBudgetUpdated(newBudget);
    }

    /**
     * @notice Update rate limit
     * @param newLimit New transaction limit per hour
     */
    function setRateLimit(uint256 newLimit) external onlyOwner {
        rateLimit = newLimit;
        emit RateLimitUpdated(newLimit);
    }

    /**
     * @notice Update price markup
     * @param newMarkup New markup in basis points (10000 = 100%)
     */
    function setPriceMarkup(uint256 newMarkup) external onlyOwner {
        require(newMarkup >= 10000 && newMarkup <= 15000, "Invalid markup");
        priceMarkup = newMarkup;
    }

    /**
     * @notice Update minimum trade size
     * @param newMinSize New minimum in USDC (6 decimals)
     */
    function setMinTradeSize(uint256 newMinSize) external onlyOwner {
        minTradeSize = newMinSize;
    }

    /**
     * @notice Toggle circuit breaker
     * @param active True to activate, false to deactivate
     */
    function setCircuitBreaker(bool active) external onlyOwner {
        circuitBreakerActive = active;
        if (active) {
            emit CircuitBreakerTriggered("Manual activation");
        }
    }

    /**
     * @notice Refill gas tank with ETH
     */
    function refillGasTank() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit GasTankRefilled(msg.value);
    }

    /**
     * @notice Emergency withdraw tokens
     * @param token Token address (address(0) for ETH)
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        emit EmergencyWithdraw(token, amount);
    }

    /**
     * @notice Withdraw from EntryPoint
     * @param withdrawAddress Address to withdraw to
     * @param amount Amount to withdraw
     */
    function withdrawFromEntryPoint(
        address payable withdrawAddress,
        uint256 amount
    ) external onlyOwner {
        entryPoint.withdrawTo(withdrawAddress, amount);
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get USDC cost estimate for a transaction
     * @param account User account
     * @param gasAmount Estimated gas
     * @return usdcCost USDC cost
     * @return discount Applied discount
     */
    function getUSDCCostEstimate(
        address account,
        uint256 gasAmount,
        uint256 gasPriceWei
    ) external view returns (uint256 usdcCost, uint256 discount) {
        uint256 ethCost = gasAmount * gasPriceWei;
        return _calculateUSDCCost(account, ethCost);
    }

    /**
     * @notice Get user's transaction count this hour
     * @param account User account
     * @return count Transaction count
     */
    function getUserTransactionCount(address account) external view returns (uint256 count) {
        UserStats memory stats = userStats[account];
        if (block.timestamp >= stats.lastHourStart + 1 hours) {
            return 0;
        }
        return stats.transactionsThisHour;
    }

    /**
     * @notice Get remaining gas budget this week
     * @return remaining Remaining budget in ETH wei
     */
    function getRemainingGasBudget() external view returns (uint256 remaining) {
        if (block.timestamp >= weekStartTime + 1 weeks) {
            return weeklyGasBudget;
        }
        if (weeklyGasSpent >= weeklyGasBudget) {
            return 0;
        }
        return weeklyGasBudget - weeklyGasSpent;
    }

    receive() external payable {}
}
