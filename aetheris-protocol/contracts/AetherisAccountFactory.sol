// Aetheris\aetheris-protocol\contracts\AetherisAccountFactory.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "./AetherisAccount.sol";

/**
 * @title AetherisAccountFactory
 * @notice Factory for deploying Aetheris Smart Accounts
 * @dev Uses CREATE2 for deterministic addresses.
 *      Allows counterfactual deployment (address known before deployment).
 *
 * NOTE: The counterfactual address function is named `getAccountAddress`
 * (not `getAddress`) to avoid collision with ethers.js v6's built-in
 * `Contract.getAddress()` method, which ignores arguments and returns
 * the factory's own deployed address.
 */
contract AetherisAccountFactory {
    /// @notice Account implementation contract (deployed once, proxied many times)
    AetherisAccount public immutable accountImplementation;

    event AccountCreated(address indexed account, address indexed owner);

    constructor(IEntryPoint _entryPoint) {
        accountImplementation = new AetherisAccount(_entryPoint);
    }

    /**
     * @notice Deploy a smart account for owner, or return existing one
     * @param owner  EOA that will own this smart account
     * @param salt   CREATE2 salt — change to deploy multiple accounts per owner
     * @return account The deployed (or already existing) smart account
     */
    function createAccount(
        address owner,
        uint256 salt
    ) external returns (AetherisAccount account) {
        address addr = getAccountAddress(owner, salt);

        if (addr.code.length > 0) {
            return AetherisAccount(payable(addr));
        }

        account = AetherisAccount(
            payable(
                new ERC1967Proxy{salt: bytes32(salt)}(
                    address(accountImplementation),
                    abi.encodeCall(AetherisAccount.initialize, (owner))
                )
            )
        );

        emit AccountCreated(address(account), owner);
    }

    /**
     * @notice Compute the counterfactual address of a smart account
     * @dev Named `getAccountAddress` to avoid collision with ethers.js v6's
     *      built-in `Contract.getAddress()` which ignores all arguments.
     * @param owner  EOA that will own the smart account
     * @param salt   CREATE2 salt
     * @return The address where the account will be (or already is) deployed
     */
    function getAccountAddress(
        address owner,
        uint256 salt
    ) public view returns (address) {
        return Create2.computeAddress(
            bytes32(salt),
            keccak256(
                abi.encodePacked(
                    type(ERC1967Proxy).creationCode,
                    abi.encode(
                        address(accountImplementation),
                        abi.encodeCall(AetherisAccount.initialize, (owner))
                    )
                )
            )
        );
    }
}
