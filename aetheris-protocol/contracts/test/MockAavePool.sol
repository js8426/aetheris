// Aetheris\aetheris-protocol\contracts\test\MockAavePool.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\test\MockAavePool.sol
// Test helper only — never deployed to mainnet

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract MockAavePool {
    uint256 public constant FLASH_FEE_BPS = 5;

    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata,
        address,
        bytes calldata params,
        uint16
    ) external {
        uint256 fee = (amounts[0] * FLASH_FEE_BPS) / 10_000;
        IERC20(assets[0]).transfer(receiverAddress, amounts[0]);

        uint256[] memory premiums = new uint256[](1);
        premiums[0] = fee;

        bool success = IFlashLoanReceiver(receiverAddress).executeOperation(
            assets, amounts, premiums, receiverAddress, params
        );
        require(success, "MockAavePool: callback failed");

        IERC20(assets[0]).transferFrom(receiverAddress, address(this), amounts[0] + fee);
    }
}
