// Aetheris\agent_gas\src\bundler\submitter.ts

/**
 * bundler/submitter.ts — Bundle submitter
 *
 * Takes a list of validated UserOperations and submits them to the EntryPoint
 * via handleOps(). The bundler wallet pays the gas cost upfront and is
 * reimbursed by the EntryPoint after successful execution.
 *
 * handleOps(UserOperation[] ops, address payable beneficiary)
 *   ops         — array of validated UserOperations
 *   beneficiary — address that receives the gas reimbursement (= bundler wallet)
 *
 * Reference: ERC-4337 section 4 — EntryPoint Contract
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  Hex,
  Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { Config } from '../config';
import { UserOperation } from './mempool';
import { GasPricer } from '../gas/pricer';

/** ABI for EntryPoint.handleOps */
const HANDLE_OPS_ABI = parseAbi([
  'function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature)[] calldata ops, address payable beneficiary) external',
]);

export interface SubmitResult {
  success: boolean;
  txHash?: string;
  error?: string;
  gasUsed?: bigint;
}

export class BundleSubmitter {
  private walletClient: ReturnType<typeof createWalletClient>;
  private publicClient: ReturnType<typeof createPublicClient>;
  private bundlerAccount: ReturnType<typeof privateKeyToAccount>;

  constructor(
    private readonly config: Config,
    private readonly pricer: GasPricer
  ) {
    this.bundlerAccount = privateKeyToAccount(config.bundlerPrivateKey);

    this.walletClient = createWalletClient({
      account: this.bundlerAccount,
      chain: base,
      transport: http(config.rpcHttpUrl),
    });

    this.publicClient = createPublicClient({
      chain: base,
      transport: http(config.rpcHttpUrl),
    });
  }

  /**
   * Submit a bundle of UserOperations to the EntryPoint.
   *
   * @param ops Validated UserOperations to bundle
   * @returns Transaction hash and success status
   */
  async submit(ops: UserOperation[]): Promise<SubmitResult> {
    if (ops.length === 0) {
      return { success: false, error: 'Empty bundle' };
    }

    try {
      const gasPrices = await this.pricer.getCurrentPrices();

      // Encode the handleOps calldata
      const callData = encodeFunctionData({
        abi: HANDLE_OPS_ABI,
        functionName: 'handleOps',
        args: [
          ops.map(op => ({
            sender: op.sender,
            nonce: BigInt(op.nonce),
            initCode: op.initCode,
            callData: op.callData,
            callGasLimit: BigInt(op.callGasLimit),
            verificationGasLimit: BigInt(op.verificationGasLimit),
            preVerificationGas: BigInt(op.preVerificationGas),
            maxFeePerGas: BigInt(op.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(op.maxPriorityFeePerGas),
            paymasterAndData: op.paymasterAndData,
            signature: op.signature,
          })),
          this.bundlerAccount.address as Address, // beneficiary = bundler wallet
        ],
      });

      // Estimate gas for the bundle transaction
      let bundleGasLimit: bigint;
      try {
        const estimated = await this.publicClient.estimateGas({
          account: this.bundlerAccount.address,
          to: this.config.entryPointAddr,
          data: callData,
        });
        // Apply overhead buffer
        bundleGasLimit = estimated + (estimated * BigInt(this.config.gasOverheadPct)) / 100n;
      } catch {
        // Fallback: rough estimate based on op count
        // ~200k per op + 50k base
        bundleGasLimit = BigInt(200_000 * ops.length + 50_000);
        console.warn(`[Submitter] Gas estimation failed, using fallback: ${bundleGasLimit}`);
      }

      // Submit the transaction
      const txHash = await this.walletClient.sendTransaction({
        to: this.config.entryPointAddr,
        data: callData,
        gas: bundleGasLimit,
        maxFeePerGas: gasPrices.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
        chain: base,
      });

      console.log(`[Submitter] Bundle submitted: hash=${txHash} ops=${ops.length}`);

      // Wait for confirmation (non-blocking — return hash immediately, confirm async)
      this.waitForConfirmation(txHash).catch(err =>
        console.warn(`[Submitter] Confirmation wait failed for ${txHash}: ${err}`)
      );

      return { success: true, txHash };
    } catch (err: any) {
      const msg = err?.shortMessage ?? err?.message ?? String(err);
      console.error(`[Submitter] Bundle submission failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Wait for a bundle transaction to be confirmed on-chain.
   * Called asynchronously after submission.
   */
  private async waitForConfirmation(txHash: Hex): Promise<{ gasUsed: bigint; success: boolean }> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000, // 60 second timeout
    });

    console.log(
      `[Submitter] Bundle confirmed: hash=${txHash} gasUsed=${receipt.gasUsed} status=${receipt.status}`
    );

    return {
      gasUsed: receipt.gasUsed,
      success: receipt.status === 'success',
    };
  }
}
