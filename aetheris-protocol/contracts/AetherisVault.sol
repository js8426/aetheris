// Aetheris\aetheris-protocol\contracts\AetherisVault.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Aetheris\aetheris-protocol\contracts\AetherisVault.sol

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AetherisVault
 * @notice The central capital layer of Aetheris Protocol. Users deposit USDC once
 *         and receive avUSDC shares. Autonomous agents generate yield continuously.
 *         Share price appreciates as agents return profits.
 *
 * @dev ARCHITECTURE:
 *
 *      The vault is the single source of truth for all user capital. It issues
 *      ERC-20 shares (avUSDC) that represent proportional ownership of the vault's
 *      total assets. As agents earn yield and return profits, totalAssets()
 *      increases, and so does the USDC redeemable per share.
 *
 *      SHARE PRICE MODEL (vs accumulator model):
 *        Unlike ProfitDistributor's per-deposit accumulator (used by AgentAlpha
 *        for its own profit sharing), the vault uses pure NAV accounting:
 *
 *          sharePrice = totalAssets() / totalSupply()
 *
 *        When profits return to the vault, USDC.balanceOf(address(this)) increases,
 *        totalAssets() increases, sharePrice increases — all share holders benefit
 *        proportionally with zero on-chain iteration. This scales to any TVL.
 *
 *      CAPITAL FLOW:
 *
 *        User                     Vault                    AgentBeta.sol
 *         │                         │                            │
 *         │── deposit(USDC) ───────▶│                            │
 *         │◀─ avUSDC shares ────────│                            │
 *         │                         │── allocateToAgent() ──────▶│
 *         │                         │   (USDC transferred)       │
 *         │                         │                            │── Synthetix positions
 *         │                         │                            │── collect funding
 *         │                         │◀── returnCapital() ────────│
 *         │                         │   (principal + profit)     │
 *         │                         │   share price goes up      │
 *         │── redeem(shares) ───────▶│                            │
 *         │◀─ USDC (+ yield) ───────│                            │
 *
 *      AgentBeta.returnCapital() sends:
 *        principal  → vault  (USDC.balanceOf increases)
 *        userShare  → vault  (same — vault IS the profit destination)
 *        protocolFee → retained in AgentBeta (swept by governance)
 *
 *      NOTE: Set AgentBeta.profitDistributor = address(vault) so that
 *      userShare profits land here and flow back to share holders via NAV.
 *      The vault's recordProfit() is a no-op — the USDC arriving is already
 *      captured by totalAssets(). The function exists only for ABI compatibility
 *      with the IProfitDistributor interface that AgentBeta calls.
 *
 *      AgentAlpha operates independently of the vault in Phase 1 — it uses
 *      Aave flash loans and distributes profits via the standalone
 *      ProfitDistributor contract, not through this vault.
 *
 *      PHASE 1 GATE:
 *        `depositsEnabled` is false at deployment. Governance enables it at
 *        the start of Phase 2 (after 30 days of agent profitability validation).
 *        The contract can be deployed, audited, and agent-integrated during
 *        Phase 1 without accepting any user capital.
 *
 *      WITHDRAWAL LIQUIDITY:
 *        Withdrawals are limited to idle USDC (capital NOT deployed to agents).
 *        If capital is deployed, users must wait for agents to close positions
 *        and return capital before withdrawing. Governance controls the
 *        allocation ratio — a minimum idle buffer (default 20%) is enforced
 *        to ensure withdrawal availability.
 *
 *      INFLATION ATTACK PROTECTION:
 *        A virtual offset of 1 share and 1 USDC unit is applied at construction.
 *        This eliminates first-deposit share price manipulation without requiring
 *        a governance bootstrap sequence.
 *
 *      ACCESS CONTROL:
 *        VAULT_MANAGER_ROLE → Governance timelock  (allocate, caps, fees)
 *        GUARDIAN_ROLE      → Cold Safe multi-sig  (pause, emergency recall)
 *        DEFAULT_ADMIN_ROLE → Governance timelock  (register agents, admin)
 *
 * @custom:security-contact security@aetheris.io
 */
contract AetherisVault is ERC20, ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                ROLES
    //////////////////////////////////////////////////////////////*/

    bytes32 public constant VAULT_MANAGER_ROLE = keccak256("VAULT_MANAGER_ROLE");
    bytes32 public constant GUARDIAN_ROLE      = keccak256("GUARDIAN_ROLE");

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposit(
        address indexed caller,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares,
        uint256 fee
    );
    event CapitalAllocated(address indexed agent, uint256 amount);
    event CapitalRecalled(address indexed agent, uint256 amount);
    event AgentRegistered(address indexed agent, string name);
    event AgentDeregistered(address indexed agent);
    event DepositsToggled(bool enabled);
    event DepositCapUpdated(uint256 oldCap, uint256 newCap);
    event MinDepositUpdated(uint256 oldMin, uint256 newMin);
    event MaxDepositUpdated(uint256 oldMax, uint256 newMax);
    event WithdrawalFeeUpdated(uint256 oldFee, uint256 newFee);
    event IdleBufferUpdated(uint256 oldBuffer, uint256 newBuffer);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event StakingContractUpdated(address indexed staking);
    event ProfitReceived(address indexed token, uint256 amount);
    event EmergencyRecallExecuted(address indexed guardian, uint256 agentsProcessed);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error DepositsDisabled();
    error BelowMinDeposit(uint256 amount, uint256 min);
    error ExceedsMaxDeposit(uint256 amount, uint256 max);
    error ExceedsDepositCap(uint256 wouldBe, uint256 cap);
    error ZeroShares();
    error ZeroAssets();
    error ZeroAddress();
    error InsufficientShares(uint256 requested, uint256 balance);
    error InsufficientLiquidity(uint256 available, uint256 required);
    error AgentNotRegistered(address agent);
    error AgentAlreadyRegistered(address agent);
    error MaxAgentsReached();
    error AllocationExceedsIdleBuffer(uint256 wouldLeave, uint256 required);
    error InvalidFee();

    /*//////////////////////////////////////////////////////////////
                                STRUCTS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Metadata for a registered agent.
     * @param agent      Contract address (must implement IVaultAgent)
     * @param name       Human-readable identifier (e.g. "AgentBeta")
     * @param registered Block timestamp of registration
     * @param active     True if currently eligible to receive allocations
     */
    struct AgentInfo {
        address agent;
        string  name;
        uint256 registered;
        bool    active;
    }

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @dev Virtual offset for inflation attack protection.
    ///      Pre-mints 1 virtual share and deposits 1 virtual USDC unit so that
    ///      the first real depositor cannot manipulate the share price by donating.
    uint256 private constant VIRTUAL_SHARES = 1;
    uint256 private constant VIRTUAL_ASSETS = 1;

    /// @dev Maximum withdrawal fee governance can set (1% = 100 bps).
    uint256 public constant MAX_WITHDRAWAL_FEE_BPS = 100;

    /// @dev Maximum idle buffer governance can set (50%).
    uint256 public constant MAX_IDLE_BUFFER_BPS = 5_000;

    /// @dev Maximum number of registered agents (gas bound for totalAssets()).
    uint256 public constant MAX_AGENTS = 20;

    /*//////////////////////////////////////////////////////////////
                            IMMUTABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice USDC token on Base.
    IERC20 public immutable USDC;

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    // ── Phase gate ─────────────────────────────────────────────────────────────

    /// @notice Public deposits disabled in Phase 1. Governance enables for Phase 2.
    bool public depositsEnabled;

    // ── Deposit limits ─────────────────────────────────────────────────────────

    /// @notice Global TVL cap — total vault assets cannot exceed this.
    uint256 public depositCap = 10_000_000 * 1e6; // $10M Phase 2 launch cap

    /// @notice Minimum single deposit.
    uint256 public minDeposit = 10 * 1e6;          // $10 USDC

    /// @notice Maximum single deposit per transaction.
    uint256 public maxDeposit = 100_000 * 1e6;     // $100K USDC

    // ── Fee configuration ──────────────────────────────────────────────────────

    /// @notice Withdrawal fee in basis points (default 10 bps = 0.1%).
    /// @dev Discourages rapid deposit/withdraw gaming without penalising
    ///      long-term holders. AX stakers receive a proportional discount.
    uint256 public withdrawalFeeBps = 10;

    /// @notice Recipient of withdrawal fees (protocol treasury multisig).
    address public feeRecipient;

    // ── Idle buffer ────────────────────────────────────────────────────────────

    /// @notice Minimum percentage of totalAssets that must remain idle (not
    ///         deployed to agents) to ensure withdrawal availability.
    ///         Default 2000 bps = 20%.
    uint256 public idleBufferBps = 2_000;

    // ── External integrations ──────────────────────────────────────────────────

    /// @notice AetherisStaking contract for tier-based withdrawal fee discounts.
    address public stakingContract;

    // ── Agent registry ─────────────────────────────────────────────────────────

    /// @notice Ordered list of all registered agent addresses.
    address[] public agentList;

    /// @notice Metadata per agent address.
    mapping(address => AgentInfo) public agentInfo;

    // ── Metrics ────────────────────────────────────────────────────────────────

    /// @notice Cumulative USDC ever deposited (monotonically increasing).
    uint256 public totalDeposited;

    /// @notice Cumulative USDC ever withdrawn (monotonically increasing, gross pre-fee).
    uint256 public totalWithdrawn;

    /// @notice Cumulative withdrawal fees collected.
    uint256 public totalFeesCollected;

    /// @notice Cumulative profit received from agents (for analytics only).
    uint256 public totalProfitReceived;

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @param usdc         USDC token address on Base
     * @param guardian     Cold Safe / guardian (GUARDIAN_ROLE)
     * @param governance   Governance timelock (VAULT_MANAGER_ROLE + DEFAULT_ADMIN_ROLE)
     * @param _feeRecipient Protocol treasury address for withdrawal fee collection
     */
    constructor(
        address usdc,
        address guardian,
        address governance,
        address _feeRecipient
    ) ERC20("Aetheris Vault Shares", "avUSDC") {
        if (usdc         == address(0)) revert ZeroAddress();
        if (guardian     == address(0)) revert ZeroAddress();
        if (governance   == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();

        USDC         = IERC20(usdc);
        feeRecipient = _feeRecipient;

        _grantRole(DEFAULT_ADMIN_ROLE,  governance);
        _grantRole(VAULT_MANAGER_ROLE,  governance);
        _grantRole(GUARDIAN_ROLE,       guardian);

        // Virtual share mint for inflation attack protection.
        // Burns VIRTUAL_SHARES to address(1) so they are permanently unclaimable.
        // This costs 1 USDC unit (negligible) and permanently protects the vault.
        _mint(address(1), VIRTUAL_SHARES);
    }

    /*//////////////////////////////////////////////////////////////
                        ERC20 OVERRIDES
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice avUSDC uses 6 decimals to match USDC, making 1 share ≈ 1 USDC at launch.
     * @dev Deviates from the ERC-4626 convention of 18 decimals because USDC has
     *      6 decimals. Using 18 would create a confusing 1e12 initial share price.
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /*//////////////////////////////////////////////////////////////
                    CORE ACCOUNTING (VIEW)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Total USDC controlled by the vault — idle + deployed to agents.
     * @dev This is the NAV denominator. Every registered active agent's
     *      deployedBalance() is included so NAV is accurate even with open positions.
     *      Virtual offset of VIRTUAL_ASSETS is included to match the virtual share mint.
     */
    function totalAssets() public view returns (uint256) {
        uint256 total = USDC.balanceOf(address(this)) + VIRTUAL_ASSETS;
        uint256 len   = agentList.length;
        for (uint256 i; i < len; ++i) {
            address agent = agentList[i];
            if (agentInfo[agent].active) {
                total += IVaultAgent(agent).deployedBalance();
            }
        }
        return total;
    }

    /**
     * @notice USDC currently sitting idle in this contract (not deployed).
     */
    function idleAssets() public view returns (uint256) {
        return USDC.balanceOf(address(this));
    }

    /**
     * @notice USDC currently deployed across all active agents.
     */
    function deployedAssets() public view returns (uint256) {
        uint256 total;
        uint256 len = agentList.length;
        for (uint256 i; i < len; ++i) {
            address agent = agentList[i];
            if (agentInfo[agent].active) {
                total += IVaultAgent(agent).deployedBalance();
            }
        }
        return total;
    }

    /**
     * @notice Convert a USDC asset amount to vault shares at the current NAV.
     * @dev   shares = assets × totalSupply / totalAssets
     *        At inception (virtualShares only): shares ≈ assets (1:1).
     */
    function convertToShares(uint256 assets) public view returns (uint256) {
        // totalSupply() already includes VIRTUAL_SHARES minted in constructor
        return (assets * totalSupply()) / totalAssets();
    }

    /**
     * @notice Convert vault shares to the USDC amount redeemable at current NAV.
     * @dev   assets = shares × totalAssets / totalSupply
     */
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * totalAssets()) / totalSupply();
    }

    /**
     * @notice Current share price expressed in USDC units (6 decimals).
     * @dev    At launch: 1.000000 (i.e. 1e6). Increases as yield accumulates.
     */
    function sharePrice() external view returns (uint256) {
        return (1e6 * totalAssets()) / totalSupply();
    }

    /**
     * @notice Maximum additional USDC that can be deposited right now.
     * @dev    Returns 0 if deposits are disabled.
     */
    function availableDepositCapacity() external view returns (uint256) {
        if (!depositsEnabled) return 0;
        uint256 assets = totalAssets() - VIRTUAL_ASSETS; // real assets only
        if (assets >= depositCap) return 0;
        return depositCap - assets;
    }

    /*//////////////////////////////////////////////////////////////
                        DEPOSIT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deposit USDC and receive avUSDC vault shares.
     *
     * @dev Reverts if:
     *   - Deposits are disabled (Phase 1 gate)
     *   - Amount is below minDeposit
     *   - Amount exceeds maxDeposit
     *   - Deposit would push totalAssets above depositCap
     *   - Shares minted would round to zero (extremely small deposit edge case)
     *
     * @param assets   USDC amount to deposit (6 decimals)
     * @param receiver Address that receives the avUSDC shares
     * @return shares  Number of avUSDC shares minted
     */
    function deposit(uint256 assets, address receiver)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (!depositsEnabled)               revert DepositsDisabled();
        if (assets < minDeposit)            revert BelowMinDeposit(assets, minDeposit);
        if (assets > maxDeposit)            revert ExceedsMaxDeposit(assets, maxDeposit);
        if (receiver == address(0))         revert ZeroAddress();

        // Check TVL cap against real assets (exclude virtual offset for cap purposes)
        uint256 realAssets = totalAssets() - VIRTUAL_ASSETS;
        if (realAssets + assets > depositCap) {
            revert ExceedsDepositCap(realAssets + assets, depositCap);
        }

        shares = convertToShares(assets);
        if (shares == 0) revert ZeroShares();

        USDC.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, shares);

        totalDeposited += assets;

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /*//////////////////////////////////////////////////////////////
                        WITHDRAW / REDEEM
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Withdraw an exact USDC amount by burning the required shares.
     *
     * @dev Withdrawal is limited to idle capital. If the requested amount
     *      exceeds idleAssets(), the call reverts. Users must wait for agents
     *      to close open positions and return capital before withdrawing more
     *      than the idle buffer. Governance manages the allocation ratio to
     *      ensure the idle buffer (idleBufferBps) is maintained.
     *
     * @param assets    Exact USDC amount to receive (before fee deduction)
     * @param receiver  Address to receive USDC
     * @param owner     Address whose avUSDC shares are burned
     * @return shares   Shares burned
     */
    function withdraw(uint256 assets, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 shares)
    {
        if (assets == 0)            revert ZeroAssets();
        if (receiver == address(0)) revert ZeroAddress();

        shares = convertToShares(assets);
        if (shares == 0) revert ZeroShares();

        _processWithdrawal(shares, assets, receiver, owner);
    }

    /**
     * @notice Redeem an exact number of shares for USDC.
     *
     * @param shares    avUSDC shares to burn
     * @param receiver  Address to receive USDC
     * @param owner     Address whose shares are burned
     * @return assets   Gross USDC returned (before withdrawal fee)
     */
    function redeem(uint256 shares, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 assets)
    {
        if (shares == 0)            revert ZeroShares();
        if (receiver == address(0)) revert ZeroAddress();

        assets = convertToAssets(shares);
        if (assets == 0) revert ZeroAssets();

        _processWithdrawal(shares, assets, receiver, owner);
    }

    /**
     * @dev Internal withdrawal logic shared by withdraw() and redeem().
     *
     *      Fee calculation:
     *        effectiveFee = withdrawalFeeBps × (1 − stakerDiscountBps / 10_000)
     *        fee          = grossAssets × effectiveFee / 10_000
     *        netAssets    = grossAssets − fee
     *
     *      Fee flows to feeRecipient (protocol treasury).
     *      Net USDC flows to receiver.
     */
    function _processWithdrawal(
        uint256 shares,
        uint256 grossAssets,
        address receiver,
        address owner
    ) internal {
        if (balanceOf(owner) < shares) {
            revert InsufficientShares(shares, balanceOf(owner));
        }

        // Third-party redemption allowance check
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            if (allowed != type(uint256).max) {
                _approve(owner, msg.sender, allowed - shares, false);
            }
        }

        // Withdrawal is restricted to idle capital only
        uint256 idle = USDC.balanceOf(address(this));
        if (idle < grossAssets) {
            revert InsufficientLiquidity(idle, grossAssets);
        }

        // Calculate fee with AX staker discount
        uint256 feeBps   = _effectiveWithdrawalFeeBps(owner);
        uint256 fee      = (grossAssets * feeBps) / 10_000;
        uint256 netAssets = grossAssets - fee;

        // Burn shares before transferring (checks-effects-interactions)
        _burn(owner, shares);

        // Transfer fee to protocol treasury
        if (fee > 0) {
            USDC.safeTransfer(feeRecipient, fee);
            totalFeesCollected += fee;
        }

        // Transfer net USDC to receiver
        USDC.safeTransfer(receiver, netAssets);
        totalWithdrawn += grossAssets;

        emit Withdraw(msg.sender, receiver, owner, netAssets, shares, fee);
    }

    /**
     * @dev Returns the effective withdrawal fee for a user after AX staker discount.
     *      Falls back to full fee if the staking contract is unset or the call reverts.
     */
    function _effectiveWithdrawalFeeBps(address user) internal view returns (uint256) {
        if (withdrawalFeeBps == 0)            return 0;
        if (stakingContract == address(0))    return withdrawalFeeBps;

        try IAetherisStaking(stakingContract).getUserFeeDiscountBps(user)
            returns (uint256 discountBps)
        {
            if (discountBps >= 10_000) return 0; // Platinum: 100% discount = zero fee
            return withdrawalFeeBps * (10_000 - discountBps) / 10_000;
        } catch {
            return withdrawalFeeBps;
        }
    }

    /*//////////////////////////////////////////////////////////////
                    AGENT CAPITAL MANAGEMENT
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Allocate idle USDC from this vault to a registered agent.
     *
     * @dev Only registered + active agents can receive allocations.
     *      Enforces the idle buffer: after allocation, idle capital must
     *      remain ≥ idleBufferBps% of totalAssets to preserve withdrawal
     *      availability.
     *
     *      AgentAlpha does NOT receive allocations — it uses Aave flash loans
     *      and never holds vault capital. Only AgentBeta (and future agents
     *      that hold capital) should be registered here.
     *
     * @param agent   Registered agent contract address
     * @param amount  USDC to allocate (6 decimals)
     */
    function allocateToAgent(address agent, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyRole(VAULT_MANAGER_ROLE)
    {
        AgentInfo storage info = agentInfo[agent];
        if (!info.active) revert AgentNotRegistered(agent);
        if (amount == 0)  revert ZeroAssets();

        uint256 idle = USDC.balanceOf(address(this));
        if (idle < amount) revert InsufficientLiquidity(idle, amount);

        // Enforce idle buffer post-allocation
        uint256 idleAfter     = idle - amount;
        uint256 _totalAssets  = totalAssets() - amount; // assets after transfer
        uint256 requiredIdle  = (_totalAssets * idleBufferBps) / 10_000;
        if (idleAfter < requiredIdle) {
            revert AllocationExceedsIdleBuffer(idleAfter, requiredIdle);
        }

        USDC.safeIncreaseAllowance(agent, amount);
        IVaultAgent(agent).allocateCapital(amount);

        emit CapitalAllocated(agent, amount);
    }

    /**
     * @notice Recall idle capital from an agent back to this vault.
     *
     * @dev Only affects capital currently sitting idle in the agent contract.
     *      Capital in open Synthetix positions cannot be recalled — the agent's
     *      executor must close those positions first.
     *
     * @param agent   Registered agent contract address
     * @param amount  USDC to recall (0 = all available in agent)
     */
    function recallFromAgent(address agent, uint256 amount)
        external
        nonReentrant
        onlyRole(VAULT_MANAGER_ROLE)
    {
        if (!agentInfo[agent].active && agentInfo[agent].agent == address(0)) {
            revert AgentNotRegistered(agent);
        }

        IVaultAgent(agent).recallCapital(amount);

        emit CapitalRecalled(agent, amount);
    }

    /*//////////////////////////////////////////////////////////////
                    PROFIT RECEIVER (IProfitDistributor compat)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Called by agents after transferring profit USDC to this contract.
     *
     * @dev This function is intentionally a no-op beyond event emission.
     *      The USDC has already arrived in this contract before this call
     *      (agents call safeTransfer then recordProfit in sequence). Because
     *      USDC.balanceOf(address(this)) is already higher, totalAssets() is
     *      already higher, and the share price has already appreciated — no
     *      additional accounting is required.
     *
     *      This function exists solely for ABI compatibility with the
     *      IProfitDistributor interface that AgentBeta.sol calls. When
     *      deploying AgentBeta, set profitDistributor = address(this vault).
     *
     * @param token   Token address (must be USDC — other tokens are accepted
     *                but not reflected in share price until governance swaps)
     * @param amount  Profit amount received
     */
    function recordProfit(address token, uint256 amount) external {
        totalProfitReceived += amount;
        emit ProfitReceived(token, amount);
    }

    /*//////////////////////////////////////////////////////////////
                    GUARDIAN — EMERGENCY
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Pause deposits. Withdrawals remain active.
     * @dev    Withdrawals are intentionally NOT paused when the vault is paused —
     *         users must always be able to exit. Only new deposits are blocked.
     */
    function pause()   external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    /**
     * @notice Emergency: attempt to recall all idle capital from all registered agents.
     *
     * @dev Uses try/catch on each agent so a single failing recall does not
     *      block the others. Called by guardian on threat detection (e.g.
     *      Agent V triggers a ProofOfExit scenario).
     *
     *      Capital in open agent positions cannot be recalled this way —
     *      the Python bots must close those positions first.
     */
    function emergencyRecallAll()
        external
        nonReentrant
        onlyRole(GUARDIAN_ROLE)
    {
        uint256 len = agentList.length;
        for (uint256 i; i < len; ++i) {
            address agent = agentList[i];
            if (agentInfo[agent].active) {
                try IVaultAgent(agent).recallCapital(0) {} catch {}
            }
        }
        emit EmergencyRecallExecuted(msg.sender, len);
    }

    /*//////////////////////////////////////////////////////////////
                    AGENT REGISTRY (ADMIN)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Register a new agent contract that the vault can allocate capital to.
     *
     * @dev The agent must implement IVaultAgent. Governance calls this once
     *      per agent after the agent contract is deployed and audited.
     *      AgentAlpha should NOT be registered here — it uses flash loans,
     *      not vault capital.
     *
     * @param agent  Agent contract address
     * @param name   Human-readable label (e.g. "AgentBeta")
     */
    function registerAgent(address agent, string calldata name)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (agent == address(0))             revert ZeroAddress();
        if (agentInfo[agent].agent != address(0)) revert AgentAlreadyRegistered(agent);
        if (agentList.length >= MAX_AGENTS)  revert MaxAgentsReached();

        agentInfo[agent] = AgentInfo({
            agent:      agent,
            name:       name,
            registered: block.timestamp,
            active:     true
        });
        agentList.push(agent);

        emit AgentRegistered(agent, name);
    }

    /**
     * @notice Deactivate an agent so it can no longer receive allocations.
     * @dev    Does not remove from agentList (preserves totalAssets() accounting
     *         while positions are still open). Use once the agent has returned
     *         all capital and is permanently retired.
     */
    function deactivateAgent(address agent)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (agentInfo[agent].agent == address(0)) revert AgentNotRegistered(agent);
        agentInfo[agent].active = false;
        emit AgentDeregistered(agent);
    }

    /*//////////////////////////////////////////////////////////////
                    CONFIGURATION (VAULT_MANAGER)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Enable or disable public deposits.
     * @dev    Set to true at Phase 2 launch after 30-day profitability gate.
     */
    function setDepositsEnabled(bool enabled)
        external
        onlyRole(VAULT_MANAGER_ROLE)
    {
        depositsEnabled = enabled;
        emit DepositsToggled(enabled);
    }

    /**
     * @notice Update the global TVL deposit cap.
     * @dev    Raised gradually as TVL grows and audits are completed.
     *         Phase 2 launch: $10M → $25M → $50M → uncapped.
     */
    function setDepositCap(uint256 cap) external onlyRole(VAULT_MANAGER_ROLE) {
        emit DepositCapUpdated(depositCap, cap);
        depositCap = cap;
    }

    /// @notice Update minimum deposit.
    function setMinDeposit(uint256 amount) external onlyRole(VAULT_MANAGER_ROLE) {
        emit MinDepositUpdated(minDeposit, amount);
        minDeposit = amount;
    }

    /// @notice Update maximum single deposit.
    function setMaxDeposit(uint256 amount) external onlyRole(VAULT_MANAGER_ROLE) {
        emit MaxDepositUpdated(maxDeposit, amount);
        maxDeposit = amount;
    }

    /**
     * @notice Update the withdrawal fee.
     * @dev    Hard-capped at MAX_WITHDRAWAL_FEE_BPS (100 bps = 1%).
     *         Set to 0 to remove withdrawal fees entirely.
     */
    function setWithdrawalFee(uint256 feeBps) external onlyRole(VAULT_MANAGER_ROLE) {
        if (feeBps > MAX_WITHDRAWAL_FEE_BPS) revert InvalidFee();
        emit WithdrawalFeeUpdated(withdrawalFeeBps, feeBps);
        withdrawalFeeBps = feeBps;
    }

    /**
     * @notice Update the minimum idle buffer percentage.
     * @dev    A higher buffer means fewer deployable assets but better withdrawal
     *         availability. Hard-capped at 50%.
     * @param bufferBps  Idle buffer in basis points (e.g. 2000 = 20%)
     */
    function setIdleBuffer(uint256 bufferBps) external onlyRole(VAULT_MANAGER_ROLE) {
        if (bufferBps > MAX_IDLE_BUFFER_BPS) revert InvalidFee();
        emit IdleBufferUpdated(idleBufferBps, bufferBps);
        idleBufferBps = bufferBps;
    }

    /*//////////////////////////////////////////////////////////////
                    CONFIGURATION (ADMIN)
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set the AetherisStaking contract for tier-based fee discounts.
     * @dev    Must implement IAetherisStaking.getUserFeeDiscountBps().
     */
    function setStakingContract(address staking) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingContract = staking;
        emit StakingContractUpdated(staking);
    }

    /**
     * @notice Update the protocol treasury address that receives withdrawal fees.
     */
    function setFeeRecipient(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (recipient == address(0)) revert ZeroAddress();
        emit FeeRecipientUpdated(feeRecipient, recipient);
        feeRecipient = recipient;
    }

    /*//////////////////////////////////////////////////////////////
                        VIEW — FRONTEND
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice All vault stats in a single call for the frontend dashboard.
     */
    function getStats()
        external
        view
        returns (
            uint256 _totalAssets,
            uint256 _idleAssets,
            uint256 _deployedAssets,
            uint256 _totalShares,
            uint256 _sharePrice,
            uint256 _totalDeposited,
            uint256 _totalWithdrawn,
            uint256 _totalFeesCollected,
            uint256 _totalProfitReceived,
            bool    _depositsEnabled,
            uint256 _depositCap,
            uint256 _agentCount
        )
    {
        uint256 idle     = USDC.balanceOf(address(this));
        uint256 deployed = deployedAssets();
        uint256 assets   = idle + deployed + VIRTUAL_ASSETS;
        uint256 supply   = totalSupply();

        return (
            assets,
            idle,
            deployed,
            supply,
            supply > 0 ? (1e6 * assets) / supply : 1e6,
            totalDeposited,
            totalWithdrawn,
            totalFeesCollected,
            totalProfitReceived,
            depositsEnabled,
            depositCap,
            agentList.length
        );
    }

    /**
     * @notice Per-user stats for the frontend account page.
     * @param user  Wallet address of the vault depositor
     */
    function getUserStats(address user)
        external
        view
        returns (
            uint256 _shares,
            uint256 _redeemableUsdc,
            uint256 _shareOfVaultBps,
            uint256 _effectiveFeeBps
        )
    {
        uint256 shares      = balanceOf(user);
        uint256 redeemable  = convertToAssets(shares);
        uint256 supply      = totalSupply();
        uint256 shareOfVault = supply > 0 ? (shares * 10_000) / supply : 0;

        return (
            shares,
            redeemable,
            shareOfVault,
            _effectiveWithdrawalFeeBps(user)
        );
    }

    /**
     * @notice Returns the full AgentInfo array for the frontend agent dashboard.
     */
    function getAgents() external view returns (AgentInfo[] memory) {
        uint256 len    = agentList.length;
        AgentInfo[] memory infos = new AgentInfo[](len);
        for (uint256 i; i < len; ++i) {
            infos[i] = agentInfo[agentList[i]];
        }
        return infos;
    }

    /**
     * @notice Per-agent capital breakdown for the frontend.
     * @return agents       Addresses of all registered agents
     * @return names        Human-readable names
     * @return balances     Deployed USDC per agent (from deployedBalance())
     * @return activeFlags  Whether each agent is currently active
     */
    function getAgentCapitalBreakdown()
        external
        view
        returns (
            address[] memory agents,
            string[]  memory names,
            uint256[] memory balances,
            bool[]    memory activeFlags
        )
    {
        uint256 len = agentList.length;
        agents      = new address[](len);
        names       = new string[](len);
        balances    = new uint256[](len);
        activeFlags = new bool[](len);

        for (uint256 i; i < len; ++i) {
            address a    = agentList[i];
            AgentInfo storage info = agentInfo[a];
            agents[i]      = a;
            names[i]       = info.name;
            activeFlags[i] = info.active;
            if (info.active) {
                try IVaultAgent(a).deployedBalance() returns (uint256 bal) {
                    balances[i] = bal;
                } catch {}
            }
        }
    }
}

/*//////////////////////////////////////////////////////////////
                    EXTERNAL INTERFACES
//////////////////////////////////////////////////////////////*/

/**
 * @notice Interface that all Aetheris vault-integrated agents must implement.
 * @dev    AgentBeta.sol implements this. AgentAlpha does NOT (flash loan only).
 *         Future agents (LP, Restake, etc.) must implement this to receive
 *         vault capital allocations.
 */
interface IVaultAgent {
    /// @notice Vault calls this to allocate USDC capital to the agent.
    function allocateCapital(uint256 amount) external;

    /// @notice Vault calls this to recall idle USDC from the agent.
    ///         amount = 0 means recall all available.
    function recallCapital(uint256 amount) external;

    /// @notice Returns total USDC controlled by this agent
    ///         (idle in contract + deployed in open positions).
    ///         Used by vault.totalAssets() for NAV calculation.
    function deployedBalance() external view returns (uint256);
}

/**
 * @notice Minimal interface for AetherisStaking fee discount queries.
 * @dev    AetherisStaking.sol must expose this function.
 *         Returns the user's withdrawal fee discount in basis points:
 *           Bronze (1K AX)   → 1000 bps (10% discount)
 *           Silver (10K AX)  → 2500 bps (25% discount)
 *           Gold   (100K AX) → 5000 bps (50% discount)
 *           Platinum (1M AX) → 10000 bps (100% discount → zero fee)
 */
interface IAetherisStaking {
    function getUserFeeDiscountBps(address user) external view returns (uint256);
}
