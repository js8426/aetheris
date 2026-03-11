// Aetheris\aetheris-protocol\contracts\AetherisVesting.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AetherisVesting
 * @notice Token vesting contract for team, advisors, and investors
 * @dev Supports multiple vesting schedules with cliff and linear vesting
 */
contract AetherisVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Vesting schedule structure
    struct VestingSchedule {
        uint256 totalAmount;     // Total tokens to vest
        uint256 released;        // Tokens already released
        uint256 startTime;       // Vesting start timestamp
        uint256 cliffDuration;   // Cliff period (no tokens released)
        uint256 duration;        // Total vesting duration
        bool revocable;          // Can owner revoke this schedule?
        bool revoked;            // Has this schedule been revoked?
    }

    /// @notice The AX token
    IERC20 public immutable AX;

    /// @notice Mapping of beneficiary address to vesting schedule
    mapping(address => VestingSchedule) public vestingSchedules;

    /// @notice Total tokens held by this contract for vesting
    uint256 public totalVestingTokens;

    /// @notice Emitted when a vesting schedule is created
    event VestingScheduleCreated(
        address indexed beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 duration,
        bool revocable
    );

    /// @notice Emitted when tokens are released
    event TokensReleased(address indexed beneficiary, uint256 amount);

    /// @notice Emitted when a vesting schedule is revoked
    event VestingScheduleRevoked(address indexed beneficiary, uint256 refundAmount);

    /**
     * @notice Deploy the vesting contract
     * @param _ax Address of the AX token
     */
    constructor(address _ax) Ownable(msg.sender) {
        require(_ax != address(0), "AetherisVesting: zero address");
        AX = IERC20(_ax);
    }

    /**
     * @notice Create a vesting schedule for a beneficiary
     * @param beneficiary Address that will receive vested tokens
     * @param amount Total amount of tokens to vest
     * @param startTime Timestamp when vesting starts
     * @param cliffDuration Duration of cliff period (seconds)
     * @param duration Total vesting duration (seconds)
     * @param revocable Whether owner can revoke this schedule
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 duration,
        bool revocable
    ) external onlyOwner {
        require(beneficiary != address(0), "AetherisVesting: zero address");
        require(vestingSchedules[beneficiary].totalAmount == 0, "AetherisVesting: schedule exists");
        require(amount > 0, "AetherisVesting: zero amount");
        require(duration > 0, "AetherisVesting: zero duration");
        require(duration >= cliffDuration, "AetherisVesting: cliff > duration");
        require(startTime > 0, "AetherisVesting: zero start time");

        // Transfer tokens to this contract
        AX.safeTransferFrom(msg.sender, address(this), amount);

        vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: amount,
            released: 0,
            startTime: startTime,
            cliffDuration: cliffDuration,
            duration: duration,
            revocable: revocable,
            revoked: false
        });

        totalVestingTokens += amount;

        emit VestingScheduleCreated(
            beneficiary,
            amount,
            startTime,
            cliffDuration,
            duration,
            revocable
        );
    }

    /**
     * @notice Release vested tokens to beneficiary
     * @dev Anyone can call this for any beneficiary
     */
    function release(address beneficiary) external nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        
        require(schedule.totalAmount > 0, "AetherisVesting: no schedule");
        require(!schedule.revoked, "AetherisVesting: revoked");

        uint256 vested = _vestedAmount(schedule);
        uint256 unreleased = vested - schedule.released;
        
        require(unreleased > 0, "AetherisVesting: no tokens to release");

        schedule.released += unreleased;
        totalVestingTokens -= unreleased;

        AX.safeTransfer(beneficiary, unreleased);

        emit TokensReleased(beneficiary, unreleased);
    }

    /**
     * @notice Revoke a vesting schedule (if revocable)
     * @param beneficiary Address whose schedule to revoke
     * @dev Only owner can revoke, and only if schedule is revocable
     */
    function revoke(address beneficiary) external onlyOwner {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        
        require(schedule.totalAmount > 0, "AetherisVesting: no schedule");
        require(schedule.revocable, "AetherisVesting: not revocable");
        require(!schedule.revoked, "AetherisVesting: already revoked");

        uint256 vested = _vestedAmount(schedule);
        uint256 unreleased = vested - schedule.released;
        uint256 refund = schedule.totalAmount - vested;

        schedule.revoked = true;
        
        // Release any vested tokens to beneficiary
        if (unreleased > 0) {
            schedule.released += unreleased;
            totalVestingTokens -= unreleased;
            AX.safeTransfer(beneficiary, unreleased);
        }

        // Refund unvested tokens to owner
        if (refund > 0) {
            totalVestingTokens -= refund;
            AX.safeTransfer(owner(), refund);
        }

        emit VestingScheduleRevoked(beneficiary, refund);
    }

    /**
     * @notice Get vesting schedule for a beneficiary
     * @param beneficiary Address to check
     * @return Vesting schedule struct
     */
    function getVestingSchedule(address beneficiary) 
        external 
        view 
        returns (VestingSchedule memory) 
    {
        return vestingSchedules[beneficiary];
    }

    /**
     * @notice Calculate releasable amount for a beneficiary
     * @param beneficiary Address to check
     * @return Amount of tokens that can be released
     */
    function releasableAmount(address beneficiary) 
        external 
        view 
        returns (uint256) 
    {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        
        if (schedule.totalAmount == 0 || schedule.revoked) {
            return 0;
        }
        
        uint256 vested = _vestedAmount(schedule);
        return vested - schedule.released;
    }

    /**
     * @notice Calculate total vested amount (released + releasable)
     * @param beneficiary Address to check
     * @return Total vested amount
     */
    function vestedAmount(address beneficiary) 
        external 
        view 
        returns (uint256) 
    {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        
        if (schedule.totalAmount == 0) {
            return 0;
        }
        
        return _vestedAmount(schedule);
    }

    /**
     * @notice Internal function to calculate vested amount
     * @param schedule Vesting schedule
     * @return Vested amount
     */
    function _vestedAmount(VestingSchedule memory schedule) 
        private 
        view 
        returns (uint256) 
    {
        if (block.timestamp < schedule.startTime + schedule.cliffDuration) {
            // Before cliff: nothing vested
            return 0;
        } else if (block.timestamp >= schedule.startTime + schedule.duration) {
            // After full duration: everything vested
            return schedule.totalAmount;
        } else {
            // During vesting: linear vesting
            uint256 timeFromStart = block.timestamp - schedule.startTime;
            return (schedule.totalAmount * timeFromStart) / schedule.duration;
        }
    }

    /**
     * @notice Emergency withdraw function (only for non-vesting tokens)
     * @param token Token address
     * @param amount Amount to withdraw
     * @dev Can only withdraw tokens not allocated to vesting
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        
        if (token == address(AX)) {
            require(
                balance - totalVestingTokens >= amount,
                "AetherisVesting: insufficient non-vesting balance"
            );
        }
        
        tokenContract.safeTransfer(owner(), amount);
    }
}
