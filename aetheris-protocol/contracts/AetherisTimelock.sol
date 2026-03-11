// Aetheris\aetheris-protocol\contracts\AetherisTimelock.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title AetherisTimelock
 * @notice Timelock contract for Aetheris governance
 * @dev 48-hour delay before executing governance proposals
 */
contract AetherisTimelock is TimelockController {
    /**
     * @notice Deploy the timelock
     * @param minDelay Minimum delay before execution (48 hours)
     * @param proposers Array of addresses that can propose
     * @param executors Array of addresses that can execute
     * @param admin Address that can manage roles
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    )
        TimelockController(
            minDelay,
            proposers,
            executors,
            admin
        )
    {}
}