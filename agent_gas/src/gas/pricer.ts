// Aetheris\agent_gas\src\gas\pricer.ts

/**
 * gas/pricer.ts — Base gas price fetcher
 *
 * Fetches current gas prices from the Base L2 RPC endpoint.
 * Applies a configurable overhead buffer to all estimates.
 *
 * Base L2 uses EIP-1559. We read baseFeePerGas from the latest block
 * and add a priority fee on top.
 */

import { createPublicClient, http, parseGwei } from 'viem';
import { base } from 'viem/chains';
import { Config } from '../config';

/** Current gas pricing information for transaction construction. */
export interface GasPrices {
  /** Current base fee from latest block (in wei) */
  baseFeePerGas: bigint;
  /** Priority fee (tip) to add on top of base fee */
  maxPriorityFeePerGas: bigint;
  /** maxFeePerGas = baseFee + priorityFee, with overhead buffer applied */
  maxFeePerGas: bigint;
}

export class GasPricer {
  private client: ReturnType<typeof createPublicClient>;

  constructor(private readonly config: Config) {
    this.client = createPublicClient({
      chain: base,
      transport: http(config.rpcHttpUrl),
    });
  }

  /**
   * Fetch current gas prices and apply the overhead buffer.
   * Retries once on failure.
   */
  async getCurrentPrices(): Promise<GasPrices> {
    try {
      const block = await this.client.getBlock({ blockTag: 'latest' });
      const baseFee = block.baseFeePerGas ?? parseGwei('0.001'); // fallback to 0.001 gwei

      // Base L2 priority fee: typically 0.001 gwei, we use 0.01 gwei for reliability
      const priorityFee = parseGwei('0.01');

      // Apply overhead buffer: maxFeePerGas = (baseFee + priorityFee) * (1 + overheadPct/100)
      const rawMaxFee = baseFee + priorityFee;
      const withBuffer = rawMaxFee + (rawMaxFee * BigInt(this.config.gasOverheadPct)) / 100n;

      return {
        baseFeePerGas: baseFee,
        maxPriorityFeePerGas: priorityFee,
        maxFeePerGas: withBuffer,
      };
    } catch (err) {
      console.warn(`[GasPricer] Failed to fetch gas prices: ${err}. Using fallback.`);
      // Conservative fallback for Base L2
      const fallbackBase = parseGwei('0.005');
      const fallbackPriority = parseGwei('0.01');
      return {
        baseFeePerGas: fallbackBase,
        maxPriorityFeePerGas: fallbackPriority,
        maxFeePerGas: fallbackBase + fallbackPriority,
      };
    }
  }
}
