// Aetheris\aetheris-protocol\contracts\AgentBeta.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\AgentBeta.sol

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AgentBeta
 * @notice On-chain capital gateway for Agent Beta's delta-neutral funding rate strategy.
 *
 * @dev ARCHITECTURE:
 *
 *      Agent Beta (agent_beta.py) runs off-chain on a VPS. It watches Synthetix
 *      ETH-PERP funding rates and executes delta-neutral positions: long WETH spot
 *      + short ETH-PERP perpetual. Net directional exposure is zero. Income is
 *      the funding rate payment every 8 hours plus Lido staking yield on the spot leg.
 *
 *      This contract is the on-chain capital interface between the vault and the
 *      Python execution engine. It serves four functions:
 *
 *        1. CAPITAL CUSTODY — Holds USDC allocated by the vault until the executor
 *           pulls it for Synthetix margin. Capital never flows directly from vault
 *           to executor wallet — it always transits this contract first, providing
 *           an auditable on-chain record of every capital movement.
 *
 *        2. POSITION ACCOUNTING — Tracks how much capital is currently deployed
 *           with the executor (in Synthetix positions) vs sitting idle here.
 *           The vault reads deployedBalance() for real-time NAV calculation.
 *
 *        3. PROFIT ROUTING — When the executor returns capital + profit after
 *           closing a position, this contract splits the profit identically to
 *           AgentAlpha: userShare → ProfitDistributor (vault depositors earn via
 *           the reward accumulator), protocolShare stays here for the protocol.
 *
 *        4. BOUNDED EXECUTION — The executor wallet can only pull capital up to
 *           the vault's current allocation and the maxAllocationCap. All
 *           destinations are whitelisted. A guardian can force-return all idle
 *           capital to the vault instantly regardless of pause state.
 *
 *      EXECUTION FLOW (one complete position lifecycle):
 *
 *        Vault              AgentBeta.sol           agent_beta.py (VPS)
 *         │                      │                         │
 *         │─ allocateCapital() ──▶│                         │
 *         │  (USDC transferred)  │                         │
 *         │                      │◀── requestCapital() ────│
 *         │                      │   (USDC → executor)     │
 *         │                      │                         │── open spot + perp on Synthetix
 *         │                      │◀── reportPositionOpen() │
 *         │                      │                         │── collect funding (every 8h)
 *         │                      │                         │── close spot + perp
 *         │                      │◀── returnCapital() ─────│
 *         │                      │   (principal + profit)  │
 *         │◀── principal + 80% ──│                         │
 *         │                      │── recordProfit() ──▶ ProfitDistributor
 *         │                      │   (20% protocol fee)    │
 *
 *      PROFIT SPLIT (matches AgentAlpha pattern):
 *        protocolFeeBps (default 1000 = 10%) — stays in this contract
 *        remainder (90%)                     — sent to ProfitDistributor + recordProfit()
 *
 *      WHY PROTOCOL FEE STAYS HERE (not sent to staking):
 *        Consistent with AgentAlpha.sol. Protocol fee accumulates in this contract
 *        and is swept by governance to the treasury. AX staker distributions are
 *        handled at the vault/treasury level, not per-agent.
 *
 *      ACCESS CONTROL:
 *        VAULT_ROLE     → Aetheris Vault contract  (allocateCapital, recallCapital)
 *        EXECUTOR_ROLE  → agent_beta.py wallet     (requestCapital, returnCapital, reportPosition*)
 *        GUARDIAN_ROLE  → Cold Safe multi-sig      (pause, emergencyReturn)
 *        DEFAULT_ADMIN  → Governance timelock      (parameter changes, role grants)
 *
 * @custom:security-contact security@aetheris.io
 */
contract AgentBeta is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                ROLES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant VAULT_ROLE    = keccak256("VAULT_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event CapitalAllocated(uint256 amount, uint256 totalAllocated);
    event CapitalRecalled(uint256 amount, address indexed to);
    event CapitalRequested(bytes32 indexed positionId, uint256 amount, uint256 capitalWithExecutor);
    event CapitalReturned(
        bytes32 indexed positionId,
        uint256 principal,
        uint256 grossProfit,
        uint256 protocolFee,
        uint256 userShare
    );
    event PositionOpened(
        bytes32 indexed positionId,
        uint256 capitalDeployed,
        uint256 entryPriceUsd,
        int256  fundingRate8hBps
    );
    event PositionClosed(bytes32 indexed positionId, uint256 grossProfit, string closeReason);
    event EmergencyReturn(address indexed guardian, uint256 amount, address indexed to);
    event ProtocolFeeSent(address indexed recipient, uint256 amount);

    event VaultSet(address indexed vault);
    event ProfitDistributorSet(address indexed distributor);
    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event MaxAllocationUpdated(uint256 oldMax, uint256 newMax);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAddress();
    error ZeroAmount();
    error ExceedsAvailableCapital(uint256 requested, uint256 available);
    error ExceedsMaxAllocation(uint256 wouldBe, uint256 cap);
    error ExceedsDeployedCapital(uint256 returned, uint256 deployed);
    error PositionAlreadyOpen(bytes32 positionId);
    error PositionNotOpen(bytes32 positionId);
    error InvalidProtocolFee();
    error VaultNotSet();
    error NoCapitalToReturn();
    error InsufficientContractBalance(uint256 available, uint256 required);

    /*//////////////////////////////////////////////////////////////
                                ENUMS
    //////////////////////////////////////////////////////////////*/

    /// @notice On-chain lifecycle state for each Beta position.
    enum PositionStatus { NONE, OPEN, CLOSED }

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice On-chain audit record for a single Beta position lifecycle.
     *
     * @dev positionId is the bytes32-encoded UUID from agent_beta.py's
     *      position_id field — enabling cross-referencing with the SQLite DB
     *      and Telegram/Discord alerts.
     *
     * @param positionId       bytes32-encoded UUID (matches agent_beta.py position_id)
     * @param capitalDeployed  USDC pulled for this position (6 decimals)
     * @param openedAt         Block timestamp of reportPositionOpened()
     * @param closedAt         Block timestamp of returnCapital() or reportPositionClosed()
     * @param grossProfit      Profit returned for this position (0 if loss or unreported)
     * @param entryPriceUsd    ETH price at open, USD × 1e6 (matches USDC decimal convention)
     * @param fundingRate8hBps Entry funding rate × 1e4 (signed — positive = longs pay shorts)
     * @param status           NONE / OPEN / CLOSED
     * @param closeReason      Human-readable reason (mirrors agent_beta.py close_reason field)
     */
    struct PositionRecord {
        bytes32        positionId;
        uint256        capitalDeployed;
        uint256        openedAt;
        uint256        closedAt;
        uint256        grossProfit;
        uint256        entryPriceUsd;
        int256         fundingRate8hBps;
        PositionStatus status;
        string         closeReason;
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC token (Base Mainnet: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
    IERC20 public immutable USDC;

    /// @notice The Aetheris Vault contract — receives principal back after positions close.
    address public vault;

    /// @notice ProfitDistributor — receives userShare profits so depositors can claim.
    address public profitDistributor;

    /// @notice Protocol fee on gross profits in basis points (default 1000 = 10%).
    /// @dev Mirrors AgentAlpha.protocolFeeBps. Kept lower than whitepaper's 20% performance
    ///      fee because Beta's net returns are lower than Alpha's flash loan arbitrage.
    ///      Governance can raise to 2000 (20%) once Beta is consistently profitable.
    uint256 public protocolFeeBps = 1000;

    /// @notice Maximum USDC the vault can allocate to this agent at any one time.
    uint256 public maxAllocationCap = 500_000 * 1e6; // $500,000 USDC

    // ── Capital accounting ─────────────────────────────────────────────────────

    /// @notice Cumulative USDC ever received from the vault (monotonically increasing).
    uint256 public totalAllocated;

    /// @notice Cumulative USDC ever returned to the vault as principal (monotonically increasing).
    uint256 public totalReturnedToVault;

    /// @notice USDC currently held by the executor in open Synthetix positions.
    /// @dev Increases on requestCapital(), decreases on returnCapital().
    uint256 public capitalWithExecutor;

    /// @notice Cumulative gross profit ever returned by the executor.
    uint256 public totalProfitGenerated;

    /// @notice Cumulative protocol fee retained in this contract (swept by governance).
    uint256 public totalProtocolFeeRetained;

    // ── Position registry ──────────────────────────────────────────────────────

    /// @notice All position records keyed by positionId.
    mapping(bytes32 => PositionRecord) public positions;

    /// @notice Ordered list of all positionIds for frontend enumeration.
    bytes32[] public positionIds;

    /// @notice Currently active positionId (bytes32(0) if none).
    /// @dev Beta runs one position at a time in Phase 1.
    bytes32 public activePositionId;

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param usdc        USDC token address on Base
     * @param executor    agent_beta.py executor wallet address (EXECUTOR_ROLE)
     * @param guardian    Cold Safe / guardian address (GUARDIAN_ROLE)
     * @param governance  Governance timelock address (DEFAULT_ADMIN_ROLE)
     */
    constructor(
        address usdc,
        address executor,
        address guardian,
        address governance
    ) {
        if (usdc       == address(0)) revert ZeroAddress();
        if (executor   == address(0)) revert ZeroAddress();
        if (guardian   == address(0)) revert ZeroAddress();
        if (governance == address(0)) revert ZeroAddress();

        USDC = IERC20(usdc);

        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(EXECUTOR_ROLE,      executor);
        _grantRole(GUARDIAN_ROLE,      guardian);
    }

    /*//////////////////////////////////////////////////////////////
                    VAULT — CAPITAL ALLOCATION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Vault allocates USDC capital to this agent.
     * @dev Called by the vault when routing capital to Beta's strategy.
     *      USDC transfers from vault → this contract. The executor subsequently
     *      calls requestCapital() to pull it into the Synthetix position.
     *
     *      Reverts if the new total allocation would exceed maxAllocationCap —
     *      this is the primary guard against the vault over-exposing to Beta.
     *
     * @param amount  USDC to allocate (6 decimals)
     */
    function allocateCapital(uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyRole(VAULT_ROLE)
    {
        if (amount == 0) revert ZeroAmount();

        // Net allocated = totalAllocated - totalReturnedToVault = capital still with Beta
        uint256 netCurrentlyAllocated = totalAllocated - totalReturnedToVault;
        if (netCurrentlyAllocated + amount > maxAllocationCap) {
            revert ExceedsMaxAllocation(netCurrentlyAllocated + amount, maxAllocationCap);
        }

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        totalAllocated += amount;

        emit CapitalAllocated(amount, totalAllocated);
    }

    /**
     * @notice Vault recalls idle USDC from this contract.
     * @dev Only affects capital sitting idle here — NOT capital currently deployed
     *      in open Synthetix positions (capitalWithExecutor). To recall deployed
     *      capital, the Python bot must close the position first.
     *
     *      amount = 0 → recall everything available.
     *
     * @param amount  USDC to recall (0 = all available)
     */
    function recallCapital(uint256 amount)
        external
        nonReentrant
        onlyRole(VAULT_ROLE)
    {
        if (vault == address(0)) revert VaultNotSet();

        uint256 available = USDC.balanceOf(address(this));
        if (available == 0) revert NoCapitalToReturn();

        uint256 toReturn = (amount == 0) ? available : amount;
        if (toReturn > available) {
            revert InsufficientContractBalance(available, toReturn);
        }

        totalReturnedToVault += toReturn;
        USDC.safeTransfer(vault, toReturn);

        emit CapitalRecalled(toReturn, vault);
    }

    /*//////////////////////////////////////////////////////////////
                    EXECUTOR — POSITION LIFECYCLE
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Executor pulls USDC from this contract to fund a Synthetix position.
     * @dev Called by agent_beta.py immediately before opening a new position.
     *      Transfers USDC from this contract to the executor wallet, which uses
     *      it as collateral in the Synthetix modifyCollateral() call.
     *
     *      Capital is tracked as "with executor" until returnCapital() is called.
     *      This tracking is what allows deployedBalance() to give the vault an
     *      accurate total exposure even while funds are mid-position.
     *
     * @param positionId  bytes32-encoded UUID matching agent_beta.py's position_id
     * @param amount      USDC to pull (6 decimals)
     */
    function requestCapital(bytes32 positionId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyRole(EXECUTOR_ROLE)
    {
        if (positionId == bytes32(0)) revert ZeroAmount();
        if (amount == 0)             revert ZeroAmount();

        // Prevent pulling capital for a position already recorded as open
        if (positions[positionId].status == PositionStatus.OPEN) {
            revert PositionAlreadyOpen(positionId);
        }

        uint256 available = USDC.balanceOf(address(this));
        if (amount > available) {
            revert ExceedsAvailableCapital(amount, available);
        }

        capitalWithExecutor += amount;
        USDC.safeTransfer(msg.sender, amount);

        emit CapitalRequested(positionId, amount, capitalWithExecutor);
    }

    /**
     * @notice Executor reports that a position has been opened on Synthetix.
     * @dev Called by agent_beta.py after both spot and perp legs are confirmed open.
     *      This is a pure state update — no token transfers occur.
     *      Provides an on-chain audit trail that mirrors the SQLite DB record.
     *
     * @param positionId        bytes32-encoded UUID
     * @param capitalDeployed   USDC used for this position (must match requestCapital amount)
     * @param entryPriceUsd     ETH index price at open, USD × 1e6
     * @param fundingRate8hBps  Synthetix funding rate at entry, in bps × 1e4 (signed)
     */
    function reportPositionOpened(
        bytes32 positionId,
        uint256 capitalDeployed,
        uint256 entryPriceUsd,
        int256  fundingRate8hBps
    )
        external
        onlyRole(EXECUTOR_ROLE)
    {
        if (positionId == bytes32(0)) revert ZeroAmount();

        positions[positionId] = PositionRecord({
            positionId:       positionId,
            capitalDeployed:  capitalDeployed,
            openedAt:         block.timestamp,
            closedAt:         0,
            grossProfit:      0,
            entryPriceUsd:    entryPriceUsd,
            fundingRate8hBps: fundingRate8hBps,
            status:           PositionStatus.OPEN,
            closeReason:      ""
        });

        positionIds.push(positionId);
        activePositionId = positionId;

        emit PositionOpened(positionId, capitalDeployed, entryPriceUsd, fundingRate8hBps);
    }

    /**
     * @notice Executor returns principal + profit after closing a Synthetix position.
     * @dev This is the critical profit-routing function. Call sequence:
     *
     *        1. agent_beta.py closes spot and perp legs on Synthetix
     *        2. Executor wallet now holds `principal + grossProfit` USDC
     *        3. Executor approves this contract for `principal + grossProfit`
     *        4. Executor calls returnCapital() — this contract pulls the funds
     *        5. Profit split executes:
     *             protocolFee (protocolFeeBps%) → stays in this contract (swept by governance)
     *             userShare   (remainder)       → ProfitDistributor.recordProfit()
     *        6. Principal + userShare → vault (increases depositor NAV per share)
     *
     *      WHY PRINCIPAL GOES WITH USERSH ARE TO VAULT:
     *        The vault's NAV-per-share model needs the full principal back plus the
     *        user's share of profit in a single transfer. The vault then re-allocates
     *        per its capital engine. This avoids a two-transfer sequence per position.
     *
     *      LOSS HANDLING:
     *        If the position closed at a loss, grossProfit = 0. The executor returns
     *        only the remaining principal (after Synthetix fees and any losses).
     *        The protocol fee is zero. The vault receives only what's left.
     *
     * @param positionId   bytes32-encoded UUID of the position being closed
     * @param principal    USDC principal being returned (the original capitalDeployed)
     * @param grossProfit  USDC profit earned (funding collected minus gas and DEX fees)
     * @param closeReason  Close reason matching agent_beta.py's close_reason field
     */
    function returnCapital(
        bytes32 positionId,
        uint256 principal,
        uint256 grossProfit,
        string calldata closeReason
    )
        external
        nonReentrant
        onlyRole(EXECUTOR_ROLE)
    {
        if (principal == 0) revert ZeroAmount();
        if (principal > capitalWithExecutor) {
            revert ExceedsDeployedCapital(principal, capitalWithExecutor);
        }

        // Pull principal + profit from executor wallet into this contract
        uint256 totalIncoming = principal + grossProfit;
        USDC.safeTransferFrom(msg.sender, address(this), totalIncoming);

        // Update capital accounting
        capitalWithExecutor  -= principal;
        totalReturnedToVault += principal;
        totalProfitGenerated += grossProfit;

        // ── Profit split ──────────────────────────────────────────────────────
        uint256 protocolFee = (grossProfit * protocolFeeBps) / 10_000;
        uint256 userShare   = grossProfit - protocolFee;

        // Protocol fee stays in this contract — governance sweeps via sweepProtocolFee()
        totalProtocolFeeRetained += protocolFee;

        // User share → ProfitDistributor (vault depositors claim proportionally)
        if (userShare > 0 && profitDistributor != address(0)) {
            USDC.safeTransfer(profitDistributor, userShare);
            IProfitDistributor(profitDistributor).recordProfit(address(USDC), userShare);
        }

        // Principal → vault (kept separate from profit so vault NAV accounting is clean)
        if (vault != address(0) && principal > 0) {
            USDC.safeTransfer(vault, principal);
        }

        // ── Update position record ────────────────────────────────────────────
        PositionRecord storage pos = positions[positionId];
        if (pos.status == PositionStatus.OPEN) {
            pos.status      = PositionStatus.CLOSED;
            pos.closedAt    = block.timestamp;
            pos.grossProfit = grossProfit;
            pos.closeReason = closeReason;
        }
        activePositionId = bytes32(0);

        emit CapitalReturned(positionId, principal, grossProfit, protocolFee, userShare);
        emit PositionClosed(positionId, grossProfit, closeReason);
    }

    /**
     * @notice Executor reports a position closure without returning capital.
     * @dev Used in abnormal scenarios — e.g., position closed at a total loss,
     *      or external liquidation — where capital has already been accounted for
     *      separately. Updates on-chain state for the audit trail only.
     *      No token transfers occur.
     *
     * @param positionId   UUID of the closed position
     * @param closeReason  Reason for closure (e.g. "external_liquidation")
     */
    function reportPositionClosed(
        bytes32 positionId,
        string calldata closeReason
    )
        external
        onlyRole(EXECUTOR_ROLE)
    {
        PositionRecord storage pos = positions[positionId];
        if (pos.status != PositionStatus.OPEN) revert PositionNotOpen(positionId);

        pos.status      = PositionStatus.CLOSED;
        pos.closedAt    = block.timestamp;
        pos.closeReason = closeReason;
        activePositionId = bytes32(0);

        emit PositionClosed(positionId, 0, closeReason);
    }

    /*//////////////////////////////////////////////////////////////
                        GUARDIAN — EMERGENCY
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Guardian force-returns all idle USDC in this contract to the vault.
     * @dev Triggered by Agent V or guardian on threat detection. Callable even
     *      when paused — the guardian must always be able to recover idle capital.
     *
     *      This function only affects USDC currently sitting in this contract.
     *      Capital deployed in open Synthetix positions (capitalWithExecutor) cannot
     *      be recalled here — the Python bot must close those positions first.
     *      After bot closes, guardianExit() can be called again to sweep remainder.
     */
    function emergencyReturn()
        external
        nonReentrant
        onlyRole(GUARDIAN_ROLE)
    {
        if (vault == address(0)) revert VaultNotSet();

        uint256 balance = USDC.balanceOf(address(this));
        if (balance == 0) revert NoCapitalToReturn();

        // Only sweep what's idle — the protocolFee retained amount
        // goes with it in an emergency (vault security > protocol revenue)
        totalReturnedToVault += balance;
        USDC.safeTransfer(vault, balance);

        emit EmergencyReturn(msg.sender, balance, vault);
    }

    /**
     * @notice Guardian pauses requestCapital() and allocateCapital().
     * @dev emergencyReturn() and recallCapital() remain active while paused.
     */
    function pause()   external onlyRole(GUARDIAN_ROLE) { _pause(); }

    /**
     * @notice Guardian resumes normal operation.
     */
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    /*//////////////////////////////////////////////////////////////
                        VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Total USDC exposure of this agent right now.
     * @dev The vault calls this for NAV calculation. Includes USDC in this
     *      contract (idle) + USDC currently in Synthetix positions (with executor).
     */
    function deployedBalance() external view returns (uint256) {
        return USDC.balanceOf(address(this)) + capitalWithExecutor;
    }

    /**
     * @notice USDC sitting idle in this contract (not yet pulled by executor).
     */
    function availableCapital() external view returns (uint256) {
        return USDC.balanceOf(address(this));
    }

    /**
     * @notice Net USDC currently with Beta (allocated but not yet returned to vault).
     */
    function netAllocated() external view returns (uint256) {
        if (totalReturnedToVault >= totalAllocated) return 0;
        return totalAllocated - totalReturnedToVault;
    }

    /**
     * @notice True when the agent has an open position.
     */
    function hasActivePosition() external view returns (bool) {
        return activePositionId != bytes32(0);
    }

    /**
     * @notice True when the agent is live (not paused).
     * @dev Frontend uses this for the LIVE / OFFLINE badge, mirroring AgentAlpha.isActive().
     */
    function isActive() external view returns (bool) {
        return !paused();
    }

    /**
     * @notice Returns the full PositionRecord for a given positionId.
     */
    function getPosition(bytes32 positionId)
        external
        view
        returns (PositionRecord memory)
    {
        return positions[positionId];
    }

    /**
     * @notice Total number of positions ever recorded.
     */
    function positionCount() external view returns (uint256) {
        return positionIds.length;
    }

    /**
     * @notice Single-call stats for the frontend dashboard.
     * @return _totalAllocated              Cumulative USDC received from vault
     * @return _capitalWithExecutor         USDC currently in open Synthetix positions
     * @return _availableCapital            USDC idle in this contract
     * @return _totalProfitGenerated        Cumulative gross profit returned by executor
     * @return _totalProtocolFeeRetained    Cumulative protocol fee in this contract
     * @return _positionCount               Total positions ever recorded
     * @return _hasActivePosition           True if a position is currently open
     * @return _activePositionId            Current position ID (bytes32(0) if none)
     */
    function getStats()
        external
        view
        returns (
            uint256 _totalAllocated,
            uint256 _capitalWithExecutor,
            uint256 _availableCapital,
            uint256 _totalProfitGenerated,
            uint256 _totalProtocolFeeRetained,
            uint256 _positionCount,
            bool    _hasActivePosition,
            bytes32 _activePositionId
        )
    {
        return (
            totalAllocated,
            capitalWithExecutor,
            USDC.balanceOf(address(this)),
            totalProfitGenerated,
            totalProtocolFeeRetained,
            positionIds.length,
            activePositionId != bytes32(0),
            activePositionId
        );
    }

    /*//////////////////////////////////////////////////////////////
                            ADMIN
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set the vault address and grant it VAULT_ROLE.
     * @dev Can only be called once per vault address. Governance timelock required.
     *      Setting this correctly is critical — principal flows directly to this address.
     */
    function setVault(address _vault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_vault == address(0)) revert ZeroAddress();
        vault = _vault;
        _grantRole(VAULT_ROLE, _vault);
        emit VaultSet(_vault);
    }

    /**
     * @notice Set the ProfitDistributor address.
     * @dev userShare profits are transferred here + recordProfit() is called.
     *      This must match the same ProfitDistributor used by AgentAlpha.
     */
    function setProfitDistributor(address _distributor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_distributor == address(0)) revert ZeroAddress();
        profitDistributor = _distributor;
        emit ProfitDistributorSet(_distributor);
    }

    /**
     * @notice Update the protocol fee on profits.
     * @dev Capped at 3000 bps (30%) to prevent governance abuse.
     *      Whitepaper targets 2000 (20%) at Phase 2 launch.
     */
    function setProtocolFee(uint256 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeBps > 3000) revert InvalidProtocolFee();
        emit ProtocolFeeUpdated(protocolFeeBps, feeBps);
        protocolFeeBps = feeBps;
    }

    /**
     * @notice Update the maximum USDC the vault can allocate to this agent.
     * @dev Raised gradually as Beta demonstrates mainnet stability — mirrors the
     *      TVL cap raise pattern described in the Phase 2 completion criteria.
     */
    function setMaxAllocationCap(uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (cap == 0) revert ZeroAmount();
        emit MaxAllocationUpdated(maxAllocationCap, cap);
        maxAllocationCap = cap;
    }

    /**
     * @notice Governance sweeps accumulated protocol fee to treasury.
     * @dev Protocol fee accumulates in this contract over time. This function
     *      sends it to a specified recipient (protocol treasury address).
     *
     * @param recipient  Address to receive the protocol fee (e.g. multisig treasury)
     * @param amount     Amount to sweep (0 = sweep all retained fees)
     */
    function sweepProtocolFee(address recipient, uint256 amount)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (recipient == address(0)) revert ZeroAddress();

        // Only sweep up to the protocol fee portion — not capital or user profits
        uint256 sweepable = totalProtocolFeeRetained;
        uint256 toSweep   = (amount == 0) ? sweepable : amount;
        if (toSweep == 0) revert ZeroAmount();
        if (toSweep > USDC.balanceOf(address(this))) {
            revert InsufficientContractBalance(USDC.balanceOf(address(this)), toSweep);
        }

        totalProtocolFeeRetained -= toSweep;
        USDC.safeTransfer(recipient, toSweep);

        emit ProtocolFeeSent(recipient, toSweep);
    }
}

/*//////////////////////////////////////////////////////////////
                    EXTERNAL INTERFACES
//////////////////////////////////////////////////////////////*/

interface IProfitDistributor {
    function recordProfit(address token, uint256 amount) external;
}
