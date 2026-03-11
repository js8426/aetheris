// Aetheris\aetheris-protocol\contracts\ProofOfExit.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\ProofOfExit.sol

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ProofOfExit
 * @notice Atomic emergency exit system for the Aetheris Protocol
 *
 * @dev The Proof of Exit is Aetheris's "kill switch" — an atomic, all-or-nothing
 *      transaction that executes in a single block via Flashbots private mempool
 *      to prevent front-running.
 *
 *      Execution sequence (atomic — all succeed or all revert):
 *        Step 1: Validate threat score from Security Oracle
 *        Step 2: Revoke all token approvals to monitored contracts
 *        Step 3: Emergency withdraw from all registered protocol positions
 *        Step 4: Transfer rescued funds to Cold Safe (5-of-7 Gnosis multi-sig)
 *        Step 5: Blacklist the malicious contract address
 *        Step 6: Emit events for indexers and notification system
 *
 *      Access Control:
 *        EXECUTOR_ROLE   → Security Agent V (automated, triggers exit)
 *        GUARDIAN_ROLE   → Cold Safe multi-sig (can pause/unpause execution)
 *        ORACLE_ROLE     → Threat Analysis Engine (posts threat scores on-chain)
 *        DEFAULT_ADMIN   → Governance timelock (parameter changes only)
 *
 *      Security Properties:
 *        - Requires threat score ≥ threshold (default 75/100) OR guardian override
 *        - 60-second cooldown between exits (prevents griefing)
 *        - Blacklisted contracts cannot be whitelisted again without governance vote
 *        - All rescued funds go directly to immutable Cold Safe address
 *        - Cold Safe address cannot be changed post-deployment
 *
 * @custom:security-contact security@aetheris.io
 */
contract ProofOfExit is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                            ROLES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant EXECUTOR_ROLE  = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE  = keccak256("GUARDIAN_ROLE");
    bytes32 public constant ORACLE_ROLE    = keccak256("ORACLE_ROLE");

    /*//////////////////////////////////////////////////////////////
                            EVENTS
    //////////////////////////////////////////////////////////////*/

    event ExitExecuted(
        address indexed maliciousContract,
        uint256 threatScore,
        uint256 fundsRescued,
        uint256 timestamp,
        bytes32 indexed exitId
    );

    event ApprovalRevoked(
        address indexed token,
        address indexed spender,
        uint256 timestamp
    );

    event FundsWithdrawn(
        address indexed protocol,
        address indexed token,
        uint256 amount
    );

    event FundsTransferredToColdSafe(
        address indexed token,
        uint256 amount
    );

    event ContractBlacklisted(
        address indexed maliciousContract,
        uint256 threatScore,
        uint256 timestamp
    );

    event ThreatScoreUpdated(
        address indexed monitoredContract,
        uint256 oldScore,
        uint256 newScore,
        uint256 timestamp
    );

    event ContractRegistered(address indexed protocol, string name);
    event ContractDeregistered(address indexed protocol);
    event TokenRegistered(address indexed token);
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event GuardianExitTriggered(address indexed guardian, address indexed target, string reason);

    /*//////////////////////////////////////////////////////////////
                            ERRORS
    //////////////////////////////////////////////////////////////*/

    error ThreatScoreBelowThreshold(uint256 score, uint256 threshold);
    error ContractAlreadyBlacklisted(address maliciousContract);
    error ContractNotRegistered(address protocol);
    error CooldownNotExpired(uint256 nextAllowed);
    error InvalidColdSafe();
    error InvalidThreshold();
    error ZeroAddress();
    event ExitFailed(address indexed protocol, bytes reason);
    error BlacklistedContractOperation(address maliciousContract);

    /*//////////////////////////////////////////////////////////////
                            STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice A registered protocol position that Proof of Exit can withdraw from
     * @param protocol    The protocol contract address
     * @param name        Human-readable name (e.g., "Aave USDC Lending")
     * @param withdrawFn  ABI-encoded function selector + args for emergency withdrawal
     * @param isActive    Whether this position is currently active
     */
    struct RegisteredProtocol {
        address protocol;
        string name;
        bytes withdrawCalldata;  // Pre-encoded: abi.encodeCall(protocol.emergencyWithdraw, (...))
        bool isActive;
    }

    /**
     * @notice Threat intelligence record for a monitored contract
     * @param score       Current threat score (0-100)
     * @param lastUpdated Block timestamp of last oracle update
     * @param updateCount Total number of oracle updates received
     */
    struct ThreatRecord {
        uint256 score;
        uint256 lastUpdated;
        uint256 updateCount;
    }

    /**
     * @notice Immutable record of every exit execution
     */
    struct ExitRecord {
        bytes32 exitId;
        address maliciousContract;
        uint256 threatScore;
        uint256 fundsRescued;
        uint256 timestamp;
        uint256 blockNumber;
    }

    /*//////////////////////////////////////////////////////////////
                        STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Cold Safe address — immutable, set at deployment, cannot be changed
    /// @dev 5-of-7 Gnosis Safe — the only destination for rescued funds
    address public immutable COLD_SAFE;

    /// @notice Threat score threshold to trigger autonomous exit (default 75/100)
    uint256 public threatThreshold = 75;

    /// @notice Minimum seconds between exit executions (prevents griefing)
    uint256 public constant EXIT_COOLDOWN = 60;

    /// @notice Timestamp of last exit execution
    uint256 public lastExitTimestamp;

    /// @notice Registered protocols that Proof of Exit can withdraw from
    mapping(address => RegisteredProtocol) public registeredProtocols;
    address[] public protocolList;

    /// @notice Registered tokens to track and revoke approvals for
    address[] public registeredTokens;
    mapping(address => bool) public isTokenRegistered;

    /// @notice Threat scores per monitored contract from the Security Oracle
    mapping(address => ThreatRecord) public threatRecords;

    /// @notice Contracts permanently blacklisted after a confirmed attack
    mapping(address => bool) public blacklisted;
    address[] public blacklistedContracts;

    /// @notice Historical exit records (immutable audit trail)
    ExitRecord[] public exitHistory;
    mapping(bytes32 => bool) public exitIdUsed;

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param coldSafe       Address of the 5-of-7 Gnosis Safe (immutable)
     * @param executor       Security Agent V address (EXECUTOR_ROLE)
     * @param guardian       Initial guardian address (GUARDIAN_ROLE)
     * @param oracle         Threat Analysis Engine address (ORACLE_ROLE)
     * @param governance     Governance timelock address (DEFAULT_ADMIN_ROLE)
     */
    constructor(
        address coldSafe,
        address executor,
        address guardian,
        address oracle,
        address governance
    ) {
        if (coldSafe  == address(0)) revert InvalidColdSafe();
        if (executor  == address(0)) revert ZeroAddress();
        if (guardian  == address(0)) revert ZeroAddress();
        if (oracle    == address(0)) revert ZeroAddress();
        if (governance == address(0)) revert ZeroAddress();

        COLD_SAFE = coldSafe;

        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(EXECUTOR_ROLE,      executor);
        _grantRole(GUARDIAN_ROLE,      guardian);
        _grantRole(ORACLE_ROLE,        oracle);
    }

    /*//////////////////////////////////////////////////////////////
                        PRIMARY ENTRY POINTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Execute Proof of Exit against a malicious contract (autonomous path)
     * @dev Called by Security Agent V when threat score crosses threshold.
     *      Executes atomically via Flashbots private mempool.
     *
     * @param maliciousContract  The contract identified as malicious
     * @param threatScore        Current threat score from oracle (must match on-chain record)
     */
    function executeExit(
        address maliciousContract,
        uint256 threatScore
    )
        external
        nonReentrant
        whenNotPaused
        onlyRole(EXECUTOR_ROLE)
    {
        // Validate threat score meets threshold
        ThreatRecord memory record = threatRecords[maliciousContract];
        if (record.score < threatThreshold) {
            revert ThreatScoreBelowThreshold(record.score, threatThreshold);
        }

        // Validate threat score parameter matches on-chain record (prevents stale data)
        if (threatScore != record.score) {
            revert ThreatScoreBelowThreshold(threatScore, record.score);
        }

        // Enforce cooldown
        if (block.timestamp < lastExitTimestamp + EXIT_COOLDOWN) {
            revert CooldownNotExpired(lastExitTimestamp + EXIT_COOLDOWN);
        }

        _executeExitSequence(maliciousContract, threatScore);
    }

    /**
     * @notice Execute Proof of Exit as a guardian override (manual path)
     * @dev Used when human review confirms threat before oracle threshold is reached.
     *      Bypasses threat score requirement but requires GUARDIAN_ROLE.
     *
     * @param maliciousContract  The contract to exit from
     * @param reason             Human-readable reason for guardian override
     */
    function guardianExit(
        address maliciousContract,
        string calldata reason
    )
        external
        nonReentrant
        onlyRole(GUARDIAN_ROLE)
    {
        uint256 score = threatRecords[maliciousContract].score;

        emit GuardianExitTriggered(msg.sender, maliciousContract, reason);

        _executeExitSequence(maliciousContract, score);
    }

    /*//////////////////////////////////////////////////////////////
                        INTERNAL EXIT SEQUENCE
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Atomic exit sequence — all steps execute or all revert
     * @dev Steps execute in order. If any critical step reverts, the entire
     *      transaction reverts. No partial exits.
     */
    function _executeExitSequence(
        address maliciousContract,
        uint256 threatScore
    ) internal {
        if (blacklisted[maliciousContract]) {
            revert ContractAlreadyBlacklisted(maliciousContract);
        }

        // Generate unique exit ID for audit trail
        bytes32 exitId = keccak256(abi.encodePacked(
            maliciousContract,
            threatScore,
            block.timestamp,
            block.number,
            msg.sender
        ));

        uint256 totalRescued = 0;

        // ── STEP 1: Revoke all token approvals ─────────────────────────────
        _revokeAllApprovals(maliciousContract);

        // ── STEP 2: Emergency withdraw from all registered protocols ────────
        totalRescued = _withdrawAllPositions();

        // ── STEP 3: Transfer all rescued funds to Cold Safe ─────────────────
        _transferAllToColdSafe();

        // ── STEP 4: Blacklist the malicious contract ─────────────────────────
        _blacklistContract(maliciousContract, threatScore);

        // ── STEP 5: Record exit in immutable history ─────────────────────────
        exitHistory.push(ExitRecord({
            exitId:             exitId,
            maliciousContract:  maliciousContract,
            threatScore:        threatScore,
            fundsRescued:       totalRescued,
            timestamp:          block.timestamp,
            blockNumber:        block.number
        }));

        lastExitTimestamp = block.timestamp;

        // ── STEP 6: Emit canonical exit event ────────────────────────────────
        emit ExitExecuted(
            maliciousContract,
            threatScore,
            totalRescued,
            block.timestamp,
            exitId
        );
    }

    /*//////////////////////////////////////////////////////////////
                        EXIT STEP IMPLEMENTATIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Step 1 — Revoke all token approvals granted to the malicious contract
     * @dev Sets allowance to 0 for every registered token
     */
    function _revokeAllApprovals(address maliciousContract) internal {
        for (uint256 i = 0; i < registeredTokens.length; i++) {
            address token = registeredTokens[i];
            IERC20 erc20 = IERC20(token);

            uint256 currentAllowance = erc20.allowance(address(this), maliciousContract);
            if (currentAllowance > 0) {
                erc20.forceApprove(maliciousContract, 0);
                emit ApprovalRevoked(token, maliciousContract, block.timestamp);
            }
        }
    }

    /**
     * @notice Step 2 — Emergency withdraw from all registered protocol positions
     * @return totalRescued Total ETH-equivalent value withdrawn (in wei)
     * @dev Each protocol's withdrawal is attempted. Individual failures are caught
     *      and emitted as events but do NOT revert the entire exit — some funds
     *      rescued is always better than none.
     */
    function _withdrawAllPositions() internal returns (uint256 totalRescued) {
        for (uint256 i = 0; i < protocolList.length; i++) {
            address protocolAddr = protocolList[i];
            RegisteredProtocol storage protocol = registeredProtocols[protocolAddr];

            if (!protocol.isActive) continue;
            if (blacklisted[protocolAddr]) continue;

            // Capture balances before
            uint256 ethBefore = address(this).balance;

            // Execute the pre-encoded withdrawal calldata
            (bool success, bytes memory returnData) = protocolAddr.call(protocol.withdrawCalldata);

            if (!success) {
                // Emit failure event but continue — partial rescue is better than none
                emit FundsWithdrawn(protocolAddr, address(0), 0);
                continue;
            }

            totalRescued += address(this).balance - ethBefore;

            // Record per-token withdrawals for token positions
            for (uint256 j = 0; j < registeredTokens.length; j++) {
                address token = registeredTokens[j];
                uint256 balance = IERC20(token).balanceOf(address(this));
                if (balance > 0) {
                    emit FundsWithdrawn(protocolAddr, token, balance);
                }
            }
        }
    }

    /**
     * @notice Step 3 — Transfer all rescued funds to the immutable Cold Safe
     * @dev Transfers ETH + all registered ERC20 tokens
     */
    function _transferAllToColdSafe() internal {
        // Transfer ETH
        uint256 ethBalance = address(this).balance;
        if (ethBalance > 0) {
            (bool sent, ) = COLD_SAFE.call{value: ethBalance}("");
            if (sent) {
                emit FundsTransferredToColdSafe(address(0), ethBalance);
            }
        }

        // Transfer all registered ERC20 tokens
        for (uint256 i = 0; i < registeredTokens.length; i++) {
            address token = registeredTokens[i];
            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                IERC20(token).safeTransfer(COLD_SAFE, balance);
                emit FundsTransferredToColdSafe(token, balance);
            }
        }
    }

    /**
     * @notice Step 4 — Permanently blacklist a malicious contract
     * @dev Blacklisting is permanent. Re-whitelisting requires governance vote
     *      with a 48-hour timelock. No function in this contract can undo it.
     */
    function _blacklistContract(address maliciousContract, uint256 score) internal {
        blacklisted[maliciousContract] = true;
        blacklistedContracts.push(maliciousContract);

        // Deregister if it was a registered protocol
        if (registeredProtocols[maliciousContract].isActive) {
            registeredProtocols[maliciousContract].isActive = false;
        }

        emit ContractBlacklisted(maliciousContract, score, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                        ORACLE — THREAT SCORING
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Update the on-chain threat score for a monitored contract
     * @dev Called by the Threat Analysis Engine. Score range: 0-100.
     *      Score ≥ threatThreshold triggers autonomous exit eligibility.
     *
     * @param monitoredContract  Contract being scored
     * @param score              New threat score (0-100, higher = more dangerous)
     */
    function updateThreatScore(
        address monitoredContract,
        uint256 score
    )
        external
        onlyRole(ORACLE_ROLE)
    {
        require(score <= 100, "ProofOfExit: score out of range");
        require(monitoredContract != address(0), "ProofOfExit: zero address");

        uint256 oldScore = threatRecords[monitoredContract].score;

        threatRecords[monitoredContract] = ThreatRecord({
            score:       score,
            lastUpdated: block.timestamp,
            updateCount: threatRecords[monitoredContract].updateCount + 1
        });

        emit ThreatScoreUpdated(monitoredContract, oldScore, score, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN — PROTOCOL REGISTRY
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Register a protocol position that Proof of Exit can withdraw from
     * @param protocol         Protocol contract address
     * @param name             Human-readable name
     * @param withdrawCalldata Pre-ABI-encoded emergency withdrawal call
     */
    function registerProtocol(
        address protocol,
        string calldata name,
        bytes calldata withdrawCalldata
    )
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (protocol == address(0)) revert ZeroAddress();
        if (blacklisted[protocol]) revert BlacklistedContractOperation(protocol);

        registeredProtocols[protocol] = RegisteredProtocol({
            protocol:         protocol,
            name:             name,
            withdrawCalldata: withdrawCalldata,
            isActive:         true
        });

        // Add to list if new
        bool found = false;
        for (uint256 i = 0; i < protocolList.length; i++) {
            if (protocolList[i] == protocol) { found = true; break; }
        }
        if (!found) protocolList.push(protocol);

        emit ContractRegistered(protocol, name);
    }

    /**
     * @notice Deregister a protocol (e.g., after legitimate upgrade)
     * @param protocol Protocol to deregister
     */
    function deregisterProtocol(address protocol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!registeredProtocols[protocol].isActive) revert ContractNotRegistered(protocol);
        registeredProtocols[protocol].isActive = false;
        emit ContractDeregistered(protocol);
    }

    /**
     * @notice Register a token to track approvals and balances for
     * @param token ERC20 token address
     */
    function registerToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (!isTokenRegistered[token]) {
            isTokenRegistered[token] = true;
            registeredTokens.push(token);
            emit TokenRegistered(token);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN — PARAMETERS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Update the threat score threshold for autonomous exit
     * @dev Range: 50-95. Setting below 50 risks false positives.
     *      Setting above 95 risks missing real attacks.
     * @param newThreshold New threshold (50-95)
     */
    function setThreatThreshold(uint256 newThreshold)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (newThreshold < 50 || newThreshold > 95) revert InvalidThreshold();
        uint256 old = threatThreshold;
        threatThreshold = newThreshold;
        emit ThresholdUpdated(old, newThreshold);
    }

    /**
     * @notice Pause the autonomous executor (guardian emergency brake)
     * @dev Guardian can pause to prevent false-positive exits during an incident.
     *      Manual guardianExit() still works while paused.
     */
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /**
     * @notice Resume autonomous execution
     */
    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Get current threat score for a contract
    function getThreatScore(address monitoredContract) external view returns (uint256) {
        return threatRecords[monitoredContract].score;
    }

    /// @notice Check if exit is currently possible for a contract
    function canExit(address monitoredContract) external view returns (bool eligible, string memory reason) {
        if (paused()) return (false, "Executor paused");
        if (blacklisted[monitoredContract]) return (false, "Already blacklisted");
        if (block.timestamp < lastExitTimestamp + EXIT_COOLDOWN) return (false, "Cooldown active");
        if (threatRecords[monitoredContract].score < threatThreshold) return (false, "Score below threshold");
        return (true, "Exit eligible");
    }

    /// @notice Total number of exits executed
    function exitCount() external view returns (uint256) {
        return exitHistory.length;
    }

    /// @notice Get exit record by index
    function getExitRecord(uint256 index) external view returns (ExitRecord memory) {
        return exitHistory[index];
    }

    /// @notice Get all blacklisted contracts
    function getBlacklistedContracts() external view returns (address[] memory) {
        return blacklistedContracts;
    }

    /// @notice Get all registered tokens
    function getRegisteredTokens() external view returns (address[] memory) {
        return registeredTokens;
    }

    /// @notice Get all registered protocols
    function getProtocolList() external view returns (address[] memory) {
        return protocolList;
    }

    /// @notice Seconds remaining on exit cooldown (0 if ready)
    function cooldownRemaining() external view returns (uint256) {
        uint256 nextAllowed = lastExitTimestamp + EXIT_COOLDOWN;
        if (block.timestamp >= nextAllowed) return 0;
        return nextAllowed - block.timestamp;
    }

    receive() external payable {}
}
