// Aetheris\aetheris-protocol\contracts\test\MockUniswapV3Router.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\test\MockUniswapV3Router.sol
// Test helper only — never deployed to mainnet

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * MockUniswapV3Router — simulates a profitable Uniswap V3 swap.
 * Returns 100.20% of input (0.2% profit) to simulate an arbitrage spread.
 */
contract MockUniswapV3Router {
    uint256 public constant PROFIT_BPS = 10020;

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
        external
        returns (uint256 amountOut)
    {
        amountOut = (params.amountIn * PROFIT_BPS) / 10_000;
        require(amountOut >= params.amountOutMinimum, "MockV3: slippage");
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        IERC20(params.tokenOut).transfer(params.recipient, amountOut);
    }
}
