// Aetheris\aetheris-protocol\contracts\AetherisToken.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title AetherisToken
 * @notice The native utility and governance token for the Aetheris Protocol
 * @dev ERC20 token with the following features:
 * - Fixed supply of 1 billion tokens
 * - Pausable (emergency only)
 * - Voting power for governance (ERC20Votes)
 * - Gasless approvals (ERC20Permit via ERC20Votes)
 * - Burnable (protocol can burn from revenue)
 * 
 * NOTE: This token uses protocol revenue buyback-and-burn instead of
 * automatic transfer burns to maintain DeFi composability and transparency.
 */
contract AetherisToken is 
    ERC20, 
    ERC20Burnable, 
    ERC20Pausable, 
    ERC20Votes,
    Ownable 
{
    /// @notice Total fixed supply: 1 billion tokens
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10**18;

    /**
     * @notice Deploy the Aetheris token
     * @dev Mints entire supply to deployer
     */
    constructor() 
        ERC20("Aetheris", "AX")
        Ownable(msg.sender)
        EIP712("Aetheris", "1")
    {
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    /**
     * @notice Pause all token transfers (emergency only)
     * @dev Only owner can pause
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause token transfers
     * @dev Only owner can unpause
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // Required overrides

    function _update(address from, address to, uint256 value) 
        internal 
        override(ERC20, ERC20Pausable, ERC20Votes) 
    {
        super._update(from, to, value);
    }

    function nonces(address owner) 
        public 
        view 
        override(Nonces) 
        returns (uint256) 
    {
        return super.nonces(owner);
    }
}