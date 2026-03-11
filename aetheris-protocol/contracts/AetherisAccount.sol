// Aetheris\aetheris-protocol\contracts\AetherisAccount.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/core/BaseAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AetherisAccount
 * @notice ERC-4337 compliant Smart Account for gasless USDC transactions
 * @dev Production-grade implementation with:
 * - USDC gas payment via Paymaster
 * - Session keys for dApp integrations
 * - Social recovery via guardians
 * - Batch transaction execution
 * - UUPS upgradeable pattern
 *
 * @custom:security-contact security@aetheris.io
 */
contract AetherisAccount is BaseAccount, Initializable, UUPSUpgradeable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SessionKeyAdded(address indexed sessionKey, uint256 validUntil);
    event SessionKeyRevoked(address indexed sessionKey);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event RecoveryInitiated(address indexed newOwner, uint256 executeAfter);
    event RecoveryExecuted(address indexed newOwner);
    event RecoveryCancelled();
    event Executed(address indexed target, uint256 value, bytes data);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidOwner();
    error InvalidSignature();
    error SessionKeyExpired();
    error SessionKeyNotFound();
    error NotAuthorized();
    error InvalidGuardian();
    error RecoveryAlreadyPending();
    error RecoveryNotReady();
    error NoRecoveryPending();
    error InsufficientGuardians();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice EntryPoint contract
    IEntryPoint private immutable _entryPoint;

    /// @notice Account owner
    address public owner;

    /// @notice Session key data
    struct SessionKey {
        uint256 validUntil;
        bool isActive;
    }
    mapping(address => SessionKey) public sessionKeys;

    /// @notice Guardians for social recovery
    mapping(address => bool) public guardians;
    address[] public guardianList;

    // ---------------------------------------------------------------
    // Recovery state — the mapping is stored SEPARATELY from the
    // struct because Solidity forbids mappings inside public structs
    // (the compiler cannot generate a getter for them).
    // ---------------------------------------------------------------

    /// @notice Viewable recovery fields (no mapping inside)
    struct RecoveryInfo {
        address newOwner;
        uint256 executeAfter;
        uint256 guardiansApproved;
    }

    /// @notice Current pending recovery (readable by tests and front-end)
    RecoveryInfo public pendingRecovery;

    /// @notice Tracks which guardian has already approved the current recovery
    mapping(address => bool) private _recoveryApprovals;

    /// @notice Recovery timelock (48 hours)
    uint256 public constant RECOVERY_DELAY = 48 hours;

    /// @notice Minimum guardians required to execute recovery
    uint256 public constant MIN_GUARDIANS = 2;

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyEntryPointOrOwner() {
        if (msg.sender != address(entryPoint()) && msg.sender != owner) {
            revert NotAuthorized();
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    function initialize(address anOwner) public virtual initializer {
        if (anOwner == address(0)) revert InvalidOwner();
        _initialize(anOwner);
    }

    function _initialize(address anOwner) internal virtual {
        owner = anOwner;
        emit OwnershipTransferred(address(0), anOwner);
    }

    /*//////////////////////////////////////////////////////////////
                        ACCOUNT ABSTRACTION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Validate user operation signature
     * @param userOp  The packed user operation
     * @param userOpHash  Hash of the user operation (signed by owner or session key)
     * @return validationData 0 = valid, 1 = invalid, or packed time-range data
     */
    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal virtual override returns (uint256 validationData) {
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        address signer = ECDSA.recover(hash, userOp.signature);

        if (signer == owner) {
            return 0;
        }

        SessionKey memory sessionKey = sessionKeys[signer];
        if (sessionKey.isActive) {
            if (block.timestamp > sessionKey.validUntil) {
                return 1;
            }
            uint256 validUntil = sessionKey.validUntil;
            return (validUntil << 160);
        }

        return 1;
    }

    function entryPoint() public view virtual override returns (IEntryPoint) {
        return _entryPoint;
    }

    function execute(
        address dest,
        uint256 value,
        bytes calldata func
    ) external override onlyEntryPointOrOwner {
        _call(dest, value, func);
        emit Executed(dest, value, func);
    }

    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external onlyEntryPointOrOwner {
        require(
            dest.length == value.length && value.length == func.length,
            "AetherisAccount: length mismatch"
        );
        for (uint256 i = 0; i < dest.length; i++) {
            _call(dest[i], value[i], func[i]);
            emit Executed(dest[i], value[i], func[i]);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        SESSION KEY MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    function addSessionKey(address sessionKey, uint256 validUntil) external onlyOwner {
        require(sessionKey != address(0), "Invalid session key");
        require(validUntil > block.timestamp, "Invalid expiry");

        sessionKeys[sessionKey] = SessionKey({
            validUntil: validUntil,
            isActive: true
        });

        emit SessionKeyAdded(sessionKey, validUntil);
    }

    function revokeSessionKey(address sessionKey) external onlyOwner {
        if (!sessionKeys[sessionKey].isActive) revert SessionKeyNotFound();
        sessionKeys[sessionKey].isActive = false;
        emit SessionKeyRevoked(sessionKey);
    }

    /*//////////////////////////////////////////////////////////////
                        SOCIAL RECOVERY
    //////////////////////////////////////////////////////////////*/

    function addGuardian(address guardian) external onlyOwner {
        if (guardian == address(0) || guardian == owner) revert InvalidGuardian();
        if (guardians[guardian]) revert InvalidGuardian();

        guardians[guardian] = true;
        guardianList.push(guardian);
        emit GuardianAdded(guardian);
    }

    function removeGuardian(address guardian) external onlyOwner {
        if (!guardians[guardian]) revert InvalidGuardian();

        guardians[guardian] = false;

        for (uint256 i = 0; i < guardianList.length; i++) {
            if (guardianList[i] == guardian) {
                guardianList[i] = guardianList[guardianList.length - 1];
                guardianList.pop();
                break;
            }
        }

        emit GuardianRemoved(guardian);
    }

    function approveRecovery(address newOwner) external {
        if (!guardians[msg.sender]) revert NotAuthorized();
        if (newOwner == address(0)) revert InvalidOwner();

        // Start a new recovery if none is pending
        if (pendingRecovery.executeAfter == 0) {
            pendingRecovery.newOwner = newOwner;
            pendingRecovery.executeAfter = block.timestamp + RECOVERY_DELAY;
            pendingRecovery.guardiansApproved = 0;
            emit RecoveryInitiated(newOwner, pendingRecovery.executeAfter);
        }

        // Count each guardian once
        if (!_recoveryApprovals[msg.sender]) {
            _recoveryApprovals[msg.sender] = true;
            pendingRecovery.guardiansApproved++;
        }
    }

    function executeRecovery() external {
        if (pendingRecovery.executeAfter == 0) revert NoRecoveryPending();
        if (block.timestamp < pendingRecovery.executeAfter) revert RecoveryNotReady();
        if (pendingRecovery.guardiansApproved < MIN_GUARDIANS) revert InsufficientGuardians();

        address newOwner = pendingRecovery.newOwner;

        // Clear recovery state (mapping entries cleared manually)
        _clearRecoveryApprovals();
        delete pendingRecovery;

        _transferOwnership(newOwner);
        emit RecoveryExecuted(newOwner);
    }

    function cancelRecovery() external onlyOwner {
        if (pendingRecovery.executeAfter == 0) revert NoRecoveryPending();
        _clearRecoveryApprovals();
        delete pendingRecovery;
        emit RecoveryCancelled();
    }

    /// @dev Clears approval flags for all current guardians
    function _clearRecoveryApprovals() internal {
        for (uint256 i = 0; i < guardianList.length; i++) {
            delete _recoveryApprovals[guardianList[i]];
        }
    }

    /*//////////////////////////////////////////////////////////////
                            OWNERSHIP
    //////////////////////////////////////////////////////////////*/

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal {
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /*//////////////////////////////////////////////////////////////
                        DEPOSIT & WITHDRAWAL
    //////////////////////////////////////////////////////////////*/

    function addDeposit() public payable {
        entryPoint().depositTo{value: msg.value}(address(this));
    }

    function withdrawDepositTo(address payable withdrawAddress, uint256 amount) external onlyOwner {
        entryPoint().withdrawTo(withdrawAddress, amount);
    }

    function getDeposit() public view returns (uint256) {
        return entryPoint().balanceOf(address(this));
    }

    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /*//////////////////////////////////////////////////////////////
                            UPGRADE
    //////////////////////////////////////////////////////////////*/

    function _authorizeUpgrade(address newImplementation) internal view override onlyOwner {
        (newImplementation);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _call(address target, uint256 value, bytes memory data) internal {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    receive() external payable {}
}
