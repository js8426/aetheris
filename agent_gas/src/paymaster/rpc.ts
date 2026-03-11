// Aetheris\agent_gas\src\paymaster\rpc.ts

/**
 * paymaster/rpc.ts — Paymaster JSON-RPC endpoint
 *
 * Implements the pm_sponsorUserOperation method.
 * Called by the frontend (or SDK) before submitting a UserOperation
 * to request paymaster sponsorship.
 *
 * Flow:
 *   1. Validate the UserOperation fields
 *   2. Evaluate sponsorship policy
 *   3. Estimate gas cost in USDC
 *   4. If approved: sign paymasterAndData and return it
 *   5. If rejected: return error with reason
 */

import { Router, Request, Response } from 'express';
import { Hex } from 'viem';
import { Config } from '../config';
import { SponsorshipPolicy } from './policy';
import { PaymasterSigner } from './signer';
import { GasEstimator } from '../gas/estimator';
import { GasPricer } from '../gas/pricer';
import { AgentGasDB } from '../db';

export function createPaymasterRouter(
  config: Config,
  db: AgentGasDB,
  policy: SponsorshipPolicy,
  signer: PaymasterSigner,
  estimator: GasEstimator,
  pricer: GasPricer
): Router {
  const router = Router();

  /**
   * pm_sponsorUserOperation
   *
   * Params: [userOp, entryPoint]
   * Returns: { paymasterAndData, maxFeePerGas, maxPriorityFeePerGas, ... }
   *          or JSON-RPC error
   */
  router.post('/', async (req: Request, res: Response) => {
    const { method, params, id, jsonrpc } = req.body;

    if (method !== 'pm_sponsorUserOperation') {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not supported: ${method}` },
      });
    }

    if (!params || params.length < 1) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Missing params: expected [userOp, entryPoint]' },
      });
    }

    const userOp = params[0];
    const requestedEntryPoint = params[1]?.toLowerCase() ?? config.entryPointAddr;

    // Verify the entryPoint is the one we support
    if (requestedEntryPoint !== config.entryPointAddr.toLowerCase()) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: `Unsupported entryPoint: ${requestedEntryPoint}. Expected: ${config.entryPointAddr}`,
        },
      });
    }

    try {
      // Estimate gas
      const gasLimits = await estimator.estimateGas(userOp);
      const gasPrices = await pricer.getCurrentPrices();

      // Estimate gas cost in USDC (approximate: totalGas * gasPrice / ETH_USDC_PRICE)
      // For Phase 1, we use a conservative static ETH price ($3000) for the estimate.
      // TODO Phase 2: read from Chainlink oracle for accurate USDC cost
      const APPROX_ETH_PRICE_USDC = 3_000_000_000n; // $3000 with 6 decimals
      const totalGas = gasLimits.callGasLimit + gasLimits.verificationGasLimit + gasLimits.preVerificationGas;
      const gasCostWei = totalGas * gasPrices.maxFeePerGas;
      // Convert: gasCostWei (18 dec) → USDC (6 dec)
      // USDC cost = gasCostWei * ETH_PRICE_USDC / 1e18
      const gasCostUsdc = (gasCostWei * APPROX_ETH_PRICE_USDC) / (10n ** 18n);

      // Apply sponsorship policy
      const decision = policy.evaluate(userOp, gasCostUsdc);

      if (!decision.shouldSponsor) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32500,
            message: `Sponsorship denied: ${decision.reason}`,
          },
        });
      }

      // Generate paymasterAndData
      // We need the userOpHash to sign. Compute it using the EntryPoint's getUserOpHash.
      // For Phase 1, we sign a hash of the userOp fields directly.
      // The paymaster contract verifies this via ECDSA.recover.
      const userOpWithGas = {
        ...userOp,
        callGasLimit: '0x' + gasLimits.callGasLimit.toString(16),
        verificationGasLimit: '0x' + gasLimits.verificationGasLimit.toString(16),
        preVerificationGas: '0x' + gasLimits.preVerificationGas.toString(16),
        maxFeePerGas: '0x' + gasPrices.maxFeePerGas.toString(16),
        maxPriorityFeePerGas: '0x' + gasPrices.maxPriorityFeePerGas.toString(16),
      };

      // Use sender + nonce + callData hash as userOpHash for signing
      // (EntryPoint.getUserOpHash in production — this is a simplification for Phase 1)
      const { keccak256, encodePacked } = await import('viem');
      const userOpHash = keccak256(
        encodePacked(
          ['address', 'uint256', 'bytes32', 'address', 'uint256'],
          [
            userOp.sender,
            BigInt(userOp.nonce ?? '0x0'),
            keccak256(userOp.callData as Hex),
            config.entryPointAddr,
            BigInt(config.chainId),
          ]
        )
      );

      const paymasterAndData = await signer.sign(userOpHash as Hex);

      console.log(`[Paymaster] Sponsoring op from ${userOp.sender} (cost ~${gasCostUsdc} USDC units)`);

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          paymasterAndData,
          callGasLimit: userOpWithGas.callGasLimit,
          verificationGasLimit: userOpWithGas.verificationGasLimit,
          preVerificationGas: userOpWithGas.preVerificationGas,
          maxFeePerGas: userOpWithGas.maxFeePerGas,
          maxPriorityFeePerGas: userOpWithGas.maxPriorityFeePerGas,
        },
      });
    } catch (err) {
      console.error(`[Paymaster] pm_sponsorUserOperation error:`, err);
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: `Internal error: ${err}` },
      });
    }
  });

  return router;
}
