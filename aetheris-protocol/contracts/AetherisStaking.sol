// Aetheris\aetheris-protocol\contracts\AetherisStaking.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AetherisStaking
 * @notice Stake $AX tokens to earn fee discounts and USDC rewards
 * @dev Implements tiered staking with revenue sharing (30% of protocol fees)
 */
contract AetherisStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The $AX token
    IERC20 public immutable AX;
    
    /// @notice The USDC token (for rewards)
    IERC20 public immutable USDC;

    /// @notice Staking tier thresholds (in wei)
    uint256 public constant BRONZE_TIER = 1_000 * 1e18;
    uint256 public constant SILVER_TIER = 10_000 * 1e18;
    uint256 public constant GOLD_TIER = 100_000 * 1e18;
    uint256 public constant PLATINUM_TIER = 1_000_000 * 1e18;

    /// @notice User staking information
    struct UserInfo {
        uint256 amount;        // Amount of $AX staked
        uint256 rewardDebt;    // Reward debt for accounting
    }

    /// @notice Mapping of user address to staking info
    mapping(address => UserInfo) public userInfo;

    /// @notice Total $AX staked in contract
    uint256 public totalStaked;

    /// @notice Accumulated rewards per share (scaled by 1e18)
    uint256 public accRewardPerShare;

    /// @notice Last recorded USDC balance for reward calculation
    uint256 public lastRewardBalance;

    /// @notice Emitted when user stakes tokens
    event Staked(address indexed user, uint256 amount);

    /// @notice Emitted when user unstakes tokens
    event Unstaked(address indexed user, uint256 amount);

    /// @notice Emitted when rewards are claimed
    event RewardsClaimed(address indexed user, uint256 amount);

    /// @notice Emitted when protocol distributes rewards
    event RewardsDistributed(uint256 amount);

    enum Tier { None, Bronze, Silver, Gold, Platinum }

    uint256 public constant BRONZE_DISCOUNT_BPS   =  1_000;
    uint256 public constant SILVER_DISCOUNT_BPS   =  2_500;
    uint256 public constant GOLD_DISCOUNT_BPS     =  5_000;
    uint256 public constant PLATINUM_DISCOUNT_BPS = 10_000;

    /**
     * @notice Deploy the staking contract
     * @param _ax Address of the $AX token
     * @param _usdc Address of the USDC token
     */
    constructor(address _ax, address _usdc) Ownable(msg.sender) {
        require(_ax != address(0), "AetherisStaking: zero AX address");
        require(_usdc != address(0), "AetherisStaking: zero USDC address");
        
        AX = IERC20(_ax);
        USDC = IERC20(_usdc);
    }

    function getUserTier(address user) public view returns (Tier) {
        uint256 staked = userInfo[user].amount;
        if (staked >= PLATINUM_TIER) return Tier.Platinum;
        if (staked >= GOLD_TIER)     return Tier.Gold;
        if (staked >= SILVER_TIER)   return Tier.Silver;
        if (staked >= BRONZE_TIER)   return Tier.Bronze;
        return Tier.None;
    }

    function getUserFeeDiscountBps(address user) external view returns (uint256) {
        Tier tier = getUserTier(user);
        if (tier == Tier.Platinum) return PLATINUM_DISCOUNT_BPS;
        if (tier == Tier.Gold)     return GOLD_DISCOUNT_BPS;
        if (tier == Tier.Silver)   return SILVER_DISCOUNT_BPS;
        if (tier == Tier.Bronze)   return BRONZE_DISCOUNT_BPS;
        return 0;
    }

    /**
     * @notice Stake $AX tokens
     * @param amount Amount of $AX to stake
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "AetherisStaking: cannot stake 0");

        UserInfo storage user = userInfo[msg.sender];

        // Update rewards before changing stake
        _updateRewards();

        // Claim any pending rewards
        if (user.amount > 0) {
            uint256 pending = (user.amount * accRewardPerShare / 1e18) - user.rewardDebt;
            if (pending > 0) {
                _safeRewardTransfer(msg.sender, pending);
                emit RewardsClaimed(msg.sender, pending);
            }
        }

        // Transfer $AX from user to contract
        AX.safeTransferFrom(msg.sender, address(this), amount);

        // Update user info
        user.amount += amount;
        totalStaked += amount;
        user.rewardDebt = user.amount * accRewardPerShare / 1e18;

        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Unstake $AX tokens
     * @param amount Amount of $AX to unstake
     */
    function unstake(uint256 amount) external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= amount, "AetherisStaking: insufficient stake");
        require(amount > 0, "AetherisStaking: cannot unstake 0");

        // Update rewards before changing stake
        _updateRewards();

        // Claim any pending rewards
        uint256 pending = (user.amount * accRewardPerShare / 1e18) - user.rewardDebt;
        if (pending > 0) {
            _safeRewardTransfer(msg.sender, pending);
            emit RewardsClaimed(msg.sender, pending);
        }

        // Update user info
        user.amount -= amount;
        totalStaked -= amount;
        user.rewardDebt = user.amount * accRewardPerShare / 1e18;

        // Transfer $AX back to user
        AX.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /**
     * @notice Claim pending USDC rewards
     */
    function claimRewards() external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount > 0, "AetherisStaking: no stake");

        _updateRewards();

        uint256 pending = (user.amount * accRewardPerShare / 1e18) - user.rewardDebt;
        require(pending > 0, "AetherisStaking: no rewards");

        user.rewardDebt = user.amount * accRewardPerShare / 1e18;

        _safeRewardTransfer(msg.sender, pending);

        emit RewardsClaimed(msg.sender, pending);
    }

    /**
     * @notice Protocol distributes USDC rewards (30% of fees)
     * @param amount Amount of USDC to distribute
     * @dev Called by Paymaster or protocol treasury
     */
    function distributeRewards(uint256 amount) external {
        require(amount > 0, "AetherisStaking: zero amount");
        
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        
        emit RewardsDistributed(amount);
    }

    /**
     * @notice Calculate pending USDC rewards for a user
     * @param _user Address to check
     * @return Pending reward amount
     */
    function pendingRewards(address _user) external view returns (uint256) {
        UserInfo memory user = userInfo[_user];
        
        if (user.amount == 0) {
            return 0;
        }

        uint256 _accRewardPerShare = accRewardPerShare;

        // Calculate any new rewards since last update
        uint256 currentBalance = USDC.balanceOf(address(this));
        if (currentBalance > lastRewardBalance && totalStaked > 0) {
            uint256 newRewards = currentBalance - lastRewardBalance;
            _accRewardPerShare += (newRewards * 1e18) / totalStaked;
        }

        return (user.amount * _accRewardPerShare / 1e18) - user.rewardDebt;
    }

    /**
     * @notice Get user's staked amount
     * @param user Address to check
     * @return Staked amount
     */
    function stakedBalance(address user) external view returns (uint256) {
        return userInfo[user].amount;
    }

    /**
     * @notice Update reward accounting
     * @dev Internal function to update accumulated rewards per share
     */
    function _updateRewards() internal {
        if (totalStaked == 0) {
            return;
        }

        uint256 currentBalance = USDC.balanceOf(address(this));
        
        if (currentBalance > lastRewardBalance) {
            uint256 newRewards = currentBalance - lastRewardBalance;
            accRewardPerShare += (newRewards * 1e18) / totalStaked;
            lastRewardBalance = currentBalance;
        }
    }

    /**
     * @notice Safely transfer USDC rewards
     * @dev Updates lastRewardBalance to prevent double-counting
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function _safeRewardTransfer(address to, uint256 amount) internal {
        uint256 balance = USDC.balanceOf(address(this));
        
        if (amount > balance) {
            USDC.safeTransfer(to, balance);
            lastRewardBalance -= balance;
        } else {
            USDC.safeTransfer(to, amount);
            lastRewardBalance -= amount;
        }
    }

    /**
     * @notice Emergency withdraw function
     * @dev Only owner, only for tokens not supposed to be in contract
     * @param token Token address
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        require(
            token != address(AX) && token != address(USDC),
            "AetherisStaking: cannot withdraw AX or USDC"
        );
        IERC20(token).safeTransfer(owner(), amount);
    }
}
