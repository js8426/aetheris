// Aetheris\aetheris-protocol\contracts\ColdSafeClaim.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\ColdSafeClaim.sol

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ColdSafeClaim
 * @notice User claim interface for funds rescued by Proof of Exit
 *
 * @dev WHAT THIS CONTRACT DOES:
 *
 *      When Proof of Exit fires, it transfers all rescued funds to the
 *      Cold Safe (a 5-of-7 Gnosis multi-sig wallet controlled by
 *      3 team members + 2 community members + 2 auditors).
 *
 *      The Cold Safe then sends those funds to this contract so that
 *      affected users can claim their proportional share.
 *
 *      HOW USER CLAIMS WORK:
 *
 *      Step 1: An exit fires. ProofOfExit sends all rescued funds to Cold Safe.
 *      Step 2: The Cold Safe signers (5-of-7 agreement required) call
 *              createClaimEvent() on this contract, specifying:
 *                - Which tokens were rescued
 *                - How much of each token
 *                - A snapshot of user balances at the time of the attack
 *                  (recorded as a Merkle root — a cryptographic fingerprint
 *                   of the entire user balance table)
 *      Step 3: Users visit the Aetheris frontend, which shows them their
 *              claimable amount based on their balance at the time of the exit.
 *      Step 4: Users submit a claim with a Merkle proof (a piece of data that
 *              proves they were in the snapshot without revealing everyone else's
 *              balances). The contract verifies the proof and pays them out.
 *
 *      WHY MERKLE PROOFS:
 *
 *      We cannot store every user's balance on-chain — that would cost
 *      enormous amounts of gas. Instead, we store a single 32-byte hash
 *      (the Merkle root) that mathematically commits to the entire balance
 *      table. A user can prove their specific entry is in that table by
 *      providing a short list of sibling hashes (the Merkle proof).
 *      The contract verifies this proof in O(log n) time on-chain.
 *
 *      ACCESS CONTROL:
 *        COLD_SAFE_ROLE  → Gnosis Safe (5-of-7) — creates claim events, deposits funds
 *        ADMIN_ROLE      → Governance timelock — parameter changes only
 *
 * @custom:security-contact security@aetheris.io
 */
contract ColdSafeClaim is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                ROLES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant COLD_SAFE_ROLE = keccak256("COLD_SAFE_ROLE");

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event ClaimEventCreated(
        uint256 indexed eventId,
        bytes32 merkleRoot,
        address[] tokens,
        uint256[] amounts,
        uint256 snapshotBlock,
        uint256 claimDeadline
    );

    event ClaimPaid(
        uint256 indexed eventId,
        address indexed user,
        address indexed token,
        uint256 amount
    );

    event FundsDeposited(
        uint256 indexed eventId,
        address indexed token,
        uint256 amount
    );

    event ClaimEventClosed(uint256 indexed eventId, uint256 unclaimedReturned);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error EventDoesNotExist(uint256 eventId);
    error ClaimDeadlinePassed(uint256 eventId, uint256 deadline);
    error ClaimDeadlineNotPassed(uint256 eventId, uint256 deadline);
    error AlreadyClaimed(uint256 eventId, address user, address token);
    error InvalidMerkleProof();
    error ZeroAmount();
    error ZeroAddress();
    error ArrayLengthMismatch();
    error InsufficientContractBalance(address token, uint256 available, uint256 required);

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice A single rescue event — one Proof of Exit execution
     * @param eventId       Sequential ID starting from 1
     * @param merkleRoot    Cryptographic root of the user balance snapshot
     * @param tokens        List of token addresses that were rescued
     * @param amounts       Total amount of each token available to claim
     * @param snapshotBlock Block number at which balances were snapshotted
     * @param claimDeadline Unix timestamp after which unclaimed funds return to Cold Safe
     * @param isActive      Whether this event is open for claims
     * @param totalClaimed  Total amount claimed per token so far
     */
    struct ClaimEvent {
        uint256 eventId;
        bytes32 merkleRoot;
        address[] tokens;
        uint256[] amounts;
        uint256 snapshotBlock;
        uint256 claimDeadline;
        bool isActive;
        mapping(address => uint256) totalClaimed; // token => total claimed
    }

    /**
     * @notice A user's claim entry — what is stored in the Merkle tree off-chain
     * @dev The leaf hash = keccak256(abi.encodePacked(user, token, amount))
     *      The frontend computes this from the snapshot and generates the proof.
     */
    struct ClaimLeaf {
        address user;
        address token;
        uint256 amount;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Address of the 5-of-7 Gnosis Safe
    address public immutable COLD_SAFE;

    /// @notice Sequential event counter
    uint256 public eventCount;

    /// @notice Default claim window — 90 days after event creation
    uint256 public constant CLAIM_WINDOW = 90 days;

    /// @notice Claim events by ID
    mapping(uint256 => ClaimEvent) private _claimEvents;

    /// @notice eventId => user => token => has claimed
    mapping(uint256 => mapping(address => mapping(address => bool))) public hasClaimed;

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param coldSafe   Address of the 5-of-7 Gnosis Safe
     * @param governance Governance timelock address
     */
    constructor(address coldSafe, address governance) {
        if (coldSafe   == address(0)) revert ZeroAddress();
        if (governance == address(0)) revert ZeroAddress();

        COLD_SAFE = coldSafe;

        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(COLD_SAFE_ROLE,     coldSafe);
    }

    /*//////////////////////////////////////////////////////////////
                    COLD SAFE — EVENT MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Create a new claim event after a Proof of Exit fires
     * @dev Called by the Cold Safe (5-of-7 signatures required on the Safe itself).
     *      The Cold Safe must send the rescued funds to this contract before
     *      or immediately after calling this function.
     *
     * @param merkleRoot    Keccak256 root of the user balance Merkle tree
     * @param tokens        Addresses of rescued tokens (use address(0) for ETH)
     * @param amounts       Total rescuable amount per token
     * @param snapshotBlock Block at which user balances were captured
     */
    function createClaimEvent(
        bytes32 merkleRoot,
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256 snapshotBlock
    )
        external
        onlyRole(COLD_SAFE_ROLE)
        returns (uint256 eventId)
    {
        if (tokens.length != amounts.length) revert ArrayLengthMismatch();
        if (tokens.length == 0)              revert ZeroAmount();
        if (merkleRoot == bytes32(0))        revert InvalidMerkleProof();

        eventCount++;
        eventId = eventCount;

        ClaimEvent storage ev = _claimEvents[eventId];
        ev.eventId       = eventId;
        ev.merkleRoot    = merkleRoot;
        ev.tokens        = tokens;
        ev.amounts       = amounts;
        ev.snapshotBlock = snapshotBlock;
        ev.claimDeadline = block.timestamp + CLAIM_WINDOW;
        ev.isActive      = true;

        emit ClaimEventCreated(
            eventId,
            merkleRoot,
            tokens,
            amounts,
            snapshotBlock,
            ev.claimDeadline
        );
    }

    /**
     * @notice Deposit rescued funds into this contract for a specific event
     * @dev Cold Safe calls this after transferring funds here.
     *      For ETH, send value with the call. For ERC20, approve first.
     *
     * @param eventId  The claim event to fund
     * @param token    Token address (address(0) for ETH)
     * @param amount   Amount being deposited
     */
    function depositFunds(
        uint256 eventId,
        address token,
        uint256 amount
    )
        external
        payable
        onlyRole(COLD_SAFE_ROLE)
    {
        if (!_claimEvents[eventId].isActive) revert EventDoesNotExist(eventId);
        if (amount == 0) revert ZeroAmount();

        if (token == address(0)) {
            require(msg.value == amount, "ColdSafeClaim: ETH amount mismatch");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        emit FundsDeposited(eventId, token, amount);
    }

    /**
     * @notice Close a claim event after deadline and return unclaimed funds to Cold Safe
     * @param eventId The event to close
     */
    function closeClaimEvent(uint256 eventId) external onlyRole(COLD_SAFE_ROLE) {
        ClaimEvent storage ev = _claimEvents[eventId];
        if (!ev.isActive) revert EventDoesNotExist(eventId);
        if (block.timestamp < ev.claimDeadline) {
            revert ClaimDeadlineNotPassed(eventId, ev.claimDeadline);
        }

        ev.isActive = false;

        // Return unclaimed funds to Cold Safe
        uint256 totalUnclaimed = 0;
        for (uint256 i = 0; i < ev.tokens.length; i++) {
            address token  = ev.tokens[i];
            uint256 claimed = ev.totalClaimed[token];
            uint256 remaining = ev.amounts[i] > claimed ? ev.amounts[i] - claimed : 0;

            if (remaining > 0) {
                totalUnclaimed += remaining;
                if (token == address(0)) {
                    (bool sent, ) = COLD_SAFE.call{value: remaining}("");
                    require(sent, "ColdSafeClaim: ETH return failed");
                } else {
                    IERC20(token).safeTransfer(COLD_SAFE, remaining);
                }
            }
        }

        emit ClaimEventClosed(eventId, totalUnclaimed);
    }

    /*//////////////////////////////////////////////////////////////
                        USER — CLAIM FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Claim rescued funds for a single token in a specific event
     * @dev The user provides a Merkle proof generated by the frontend.
     *      The contract verifies the proof against the stored Merkle root,
     *      then transfers the claimable amount to the user.
     *
     * @param eventId    The claim event ID
     * @param token      The token to claim (address(0) for ETH)
     * @param amount     The user's claimable amount (from the snapshot)
     * @param proof      Merkle proof — array of sibling hashes from leaf to root
     */
    function claim(
        uint256 eventId,
        address token,
        uint256 amount,
        bytes32[] calldata proof
    )
        external
        nonReentrant
        whenNotPaused
    {
        ClaimEvent storage ev = _claimEvents[eventId];

        if (!ev.isActive)                         revert EventDoesNotExist(eventId);
        if (block.timestamp > ev.claimDeadline)   revert ClaimDeadlinePassed(eventId, ev.claimDeadline);
        if (hasClaimed[eventId][msg.sender][token]) revert AlreadyClaimed(eventId, msg.sender, token);
        if (amount == 0)                          revert ZeroAmount();

        // Verify the Merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, token, amount));
        if (!_verifyProof(proof, ev.merkleRoot, leaf)) revert InvalidMerkleProof();

        // Mark as claimed before transfer (reentrancy protection)
        hasClaimed[eventId][msg.sender][token] = true;
        ev.totalClaimed[token] += amount;

        // Transfer funds to user
        if (token == address(0)) {
            (bool sent, ) = msg.sender.call{value: amount}("");
            require(sent, "ColdSafeClaim: ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }

        emit ClaimPaid(eventId, msg.sender, token, amount);
    }

    /**
     * @notice Claim all tokens in a single event in one transaction
     * @dev Convenience function — calls claim() for each token in the event.
     *
     * @param eventId  The claim event ID
     * @param tokens   Tokens to claim (must match event tokens)
     * @param amounts  Claimable amounts per token
     * @param proofs   Merkle proofs per token
     */
    function claimAll(
        uint256 eventId,
        address[] calldata tokens,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    )
        external
        nonReentrant
        whenNotPaused
    {
        if (tokens.length != amounts.length || tokens.length != proofs.length) {
            revert ArrayLengthMismatch();
        }

        ClaimEvent storage ev = _claimEvents[eventId];
        if (!ev.isActive)                        revert EventDoesNotExist(eventId);
        if (block.timestamp > ev.claimDeadline)  revert ClaimDeadlinePassed(eventId, ev.claimDeadline);

        for (uint256 i = 0; i < tokens.length; i++) {
            address token  = tokens[i];
            uint256 amount = amounts[i];

            if (hasClaimed[eventId][msg.sender][token]) continue; // Skip already claimed
            if (amount == 0) continue;

            bytes32 leaf = keccak256(abi.encodePacked(msg.sender, token, amount));
            if (!_verifyProof(proofs[i], ev.merkleRoot, leaf)) revert InvalidMerkleProof();

            hasClaimed[eventId][msg.sender][token] = true;
            ev.totalClaimed[token] += amount;

            if (token == address(0)) {
                (bool sent, ) = msg.sender.call{value: amount}("");
                require(sent, "ColdSafeClaim: ETH transfer failed");
            } else {
                IERC20(token).safeTransfer(msg.sender, amount);
            }

            emit ClaimPaid(eventId, msg.sender, token, amount);
        }
    }

    /*//////////////////////////////////////////////////////////////
                        MERKLE PROOF VERIFICATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Verify a Merkle proof
     * @dev Standard binary Merkle tree verification.
     *      Hashes the leaf up through the tree using the provided sibling
     *      hashes (proof), comparing the result to the stored root.
     *
     * @param proof  Array of sibling hashes from leaf to root
     * @param root   The stored Merkle root for this claim event
     * @param leaf   Hash of the claim: keccak256(user, token, amount)
     * @return       True if the proof is valid
     */
    function _verifyProof(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];
            // Sort pair to ensure consistent ordering regardless of tree direction
            if (computed <= sibling) {
                computed = keccak256(abi.encodePacked(computed, sibling));
            } else {
                computed = keccak256(abi.encodePacked(sibling, computed));
            }
        }
        return computed == root;
    }

    /*//////////////////////////////////////////////////////////////
                            VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get public details of a claim event (excludes mapping)
     */
    function getClaimEvent(uint256 eventId)
        external
        view
        returns (
            bytes32 merkleRoot,
            address[] memory tokens,
            uint256[] memory amounts,
            uint256 snapshotBlock,
            uint256 claimDeadline,
            bool isActive
        )
    {
        ClaimEvent storage ev = _claimEvents[eventId];
        if (ev.eventId == 0) revert EventDoesNotExist(eventId);
        return (
            ev.merkleRoot,
            ev.tokens,
            ev.amounts,
            ev.snapshotBlock,
            ev.claimDeadline,
            ev.isActive
        );
    }

    /**
     * @notice Check how much of a token has been claimed in an event
     */
    function totalClaimed(uint256 eventId, address token) external view returns (uint256) {
        return _claimEvents[eventId].totalClaimed[token];
    }

    /**
     * @notice Days remaining to claim in an event (0 if deadline passed)
     */
    function daysRemaining(uint256 eventId) external view returns (uint256) {
        uint256 deadline = _claimEvents[eventId].claimDeadline;
        if (block.timestamp >= deadline) return 0;
        return (deadline - block.timestamp) / 1 days;
    }

    /**
     * @notice Verify a proof without executing a claim (for frontend validation)
     */
    function verifyClaimProof(
        uint256 eventId,
        address user,
        address token,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool valid) {
        bytes32 leaf = keccak256(abi.encodePacked(user, token, amount));
        return _verifyProof(proof, _claimEvents[eventId].merkleRoot, leaf);
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN
    //////////////////////////////////////////////////////////////*/

    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    receive() external payable {}
}
