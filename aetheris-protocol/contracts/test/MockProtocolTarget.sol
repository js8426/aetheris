// Aetheris\aetheris-protocol\contracts\test\MockProtocolTarget.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\test\MockProtocolTarget.sol
// Used only in tests — never deployed to mainnet

contract MockProtocolTarget {
    event EmergencyWithdrawCalled();

    function emergencyWithdraw() external {
        emit EmergencyWithdrawCalled();
        // In real protocols this would transfer funds back to caller
        // Here we just emit the event so tests can verify the call was made
    }

    receive() external payable {}
}
