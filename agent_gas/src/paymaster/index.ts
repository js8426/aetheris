// Aetheris\agent_gas\src\paymaster\index.ts

/**
 * paymaster/index.ts — Paymaster service
 *
 * Wires together the policy, signer, and RPC endpoint into
 * a cohesive paymaster service. Exported for use in index.ts.
 */

export { SponsorshipPolicy } from './policy';
export { PaymasterSigner } from './signer';
export { createPaymasterRouter } from './rpc';
