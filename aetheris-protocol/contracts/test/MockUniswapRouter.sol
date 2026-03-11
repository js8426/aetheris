// Aetheris\aetheris-protocol\contracts\test\MockUniswapRouter.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockUniswapRouter
 * @notice Deterministic mock of IUniswapV2Router for paymaster unit tests.
 * @dev Returns predictable amounts so tests don't depend on real DEX pricing.
 *      Rate: 1 ETH = 3,000 USDC — matches the hardcoded price in AetherisPaymaster.
 *      Never deployed to mainnet or testnet.
 */
contract MockUniswapRouter {

    /// @notice Returns the USDC input needed to receive a given ETH output.
    function getAmountsIn(
        uint256 amountOut,       // ETH wei needed
        address[] calldata       // path (ignored in mock)
    ) external pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        // amountOut is in wei (18 decimals), USDC has 6 decimals
        // usdcNeeded = amountOut * 3000 * 1e6 / 1e18
        amounts[0] = (amountOut * 3_000 * 1e6) / 1 ether;
        amounts[1] = amountOut;
    }

    /// @notice Simulates USDC → ETH swap. No-op in tests — _postOp is not
    ///         called directly in unit tests (requires a live EntryPoint flow).
    function swapTokensForExactETH(
        uint256,        // amountOut
        uint256,        // amountInMax
        address[] calldata, // path
        address,        // to
        uint256         // deadline
    ) external pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
    }
}
