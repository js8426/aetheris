// Aetheris\aetheris-backend\src\routes\agent.ts


import { Router, Request, Response, NextFunction } from 'express';
import { publicClient, CONTRACTS } from '../lib/viemClient';
import { isAddress, formatUnits } from 'viem';
import { AppError } from '../middleware/errorHandler';

export const agentRouter = Router();

// ─── ABI ─────────────────────────────────────────────────────────────────────
// All function signatures here must exactly match the deployed AgentAlpha.sol.

const AGENT_ALPHA_ABI = [
  /**
   * paused() → bool
   * Inherited from OpenZeppelin Pausable. True when the circuit breaker is active.
   */
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  /**
   * isActive() → bool
   * Returns !paused(). Used by the frontend for the LIVE / OFFLINE badge.
   * BUG FIX: Previously the backend derived active = !paused() itself using the
   * `paused` function. We now call `isActive()` directly so both derivation
   * logic and source of truth live in the contract, not in the backend.
   */
  {
    name: 'isActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  /**
   * getTotalArbitrageProfit() → uint256
   * BUG FIX: The previous ABI called `getTotalProfit` with no arguments.
   * The actual contract function `getTotalProfit` requires a `token` address
   * parameter, so every call to /agents/status was throwing a contract read
   * error. The contract now exposes `getTotalArbitrageProfit()` (no args)
   * which returns the aggregate across all tokens.
   */
  {
    name: 'getTotalArbitrageProfit',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  /**
   * isUserActive(address user) → bool
   * BUG FIX: The per-user status endpoint previously mirrored the global paused
   * flag for every user, meaning all users always showed identical activation
   * state. We now read each user's opt-in from the contract directly.
   */
  {
    name: 'isUserActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safe contract read — returns a fallback value instead of throwing so that
 * a single RPC failure does not break the entire status response.
 */
async function safeRead<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/agents/status
 *
 * Returns the global operational status of all Aetheris agents.
 * Agent Alpha is considered "active" when isActive() returns true
 * (i.e. the contract is not paused).
 */
agentRouter.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let agentActive  = false;
    let totalProfit  = '0';

    if (CONTRACTS.AGENT_ALPHA) {
      // Read both values in parallel — neither depends on the other
      const [active, profit] = await Promise.all([
        safeRead(
          () =>
            publicClient.readContract({
              address: CONTRACTS.AGENT_ALPHA as `0x${string}`,
              abi: AGENT_ALPHA_ABI,
              functionName: 'isActive',
            }) as Promise<boolean>,
          false,
        ),
        safeRead(
          () =>
            publicClient.readContract({
              address: CONTRACTS.AGENT_ALPHA as `0x${string}`,
              abi: AGENT_ALPHA_ABI,
              functionName: 'getTotalArbitrageProfit',
            }) as Promise<bigint>,
          0n,
        ),
      ]);

      agentActive = active;
      totalProfit = formatUnits(profit, 6); // USDC — 6 decimals
    }

    res.json({
      agentAlpha: {
        active:          agentActive,
        totalProfitUSDC: totalProfit,
        strategy:        'Multi-hop arbitrage on Base L2',
        supportedDexs:   ['Uniswap V3', 'Aerodrome', 'Balancer V2', 'Curve Finance'],
      },
      agentV: {
        active:              true,
        monitoredContracts:  0,
        lastScanTimestamp:   new Date().toISOString(),
        threatLevel:         'LOW',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/agents/:address/status
 *
 * Returns the per-user activation state for a given wallet address.
 *
 * BUG FIX: Previously this endpoint read `paused()` from the contract and
 * mirrored it as the user's `active` flag — every user had the same value
 * regardless of whether they had called activateForUser(). Now we call
 * `isUserActive(address)` to get each user's individual opt-in state, and
 * separately read `isActive()` for the global agent liveness.
 */
agentRouter.get('/:address/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;
    if (!isAddress(address)) throw new AppError(400, 'Invalid Ethereum address');

    const addr = address as `0x${string}`;

    let globalActive = false;
    let userActive   = false;

    if (CONTRACTS.AGENT_ALPHA) {
      // Read global liveness and per-user activation in parallel
      const [global, perUser] = await Promise.all([
        safeRead(
          () =>
            publicClient.readContract({
              address: CONTRACTS.AGENT_ALPHA as `0x${string}`,
              abi: AGENT_ALPHA_ABI,
              functionName: 'isActive',
            }) as Promise<boolean>,
          false,
        ),
        safeRead(
          () =>
            publicClient.readContract({
              address: CONTRACTS.AGENT_ALPHA as `0x${string}`,
              abi: AGENT_ALPHA_ABI,
              functionName: 'isUserActive',
              args: [addr],
            }) as Promise<boolean>,
          false,
        ),
      ]);

      globalActive = global;
      userActive   = perUser;
    }

    res.json({
      address,
      agentAlpha: {
        // `active` reflects THIS USER'S opt-in state, not the global state.
        // The frontend renders the activation toggle based on this field.
        active:       userActive,
        globalActive: globalActive,
      },
      agentV: {
        active:         true,
        protectedSince: null,
      },
    });
  } catch (err) {
    next(err);
  }
});