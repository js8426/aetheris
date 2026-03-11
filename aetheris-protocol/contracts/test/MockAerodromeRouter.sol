// Aetheris\aetheris-protocol\contracts\test\MockAerodromeRouter.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\test\MockAerodromeRouter.sol
// Test helper only — never deployed to mainnet

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * MockAerodromeRouter — simulates a profitable Aerodrome swap.
 * Returns 100.15% of input (0.15% profit) to simulate the second
 * leg of a triangular arbitrage that ends up profitable overall.
 */
contract MockAerodromeRouter {
    uint256 public constant PROFIT_BPS = 10015;

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
        uint256
    ) external returns (uint256[] memory amounts) {
        uint256 amountOut = (amountIn * PROFIT_BPS) / 10_000;
        require(amountOut >= amountOutMin, "MockAero: slippage");
        IERC20(routes[0].from).transferFrom(msg.sender, address(this), amountIn);
        IERC20(routes[0].to).transfer(to, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;
    }
}
