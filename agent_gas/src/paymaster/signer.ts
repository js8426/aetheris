// Aetheris\agent_gas\src\paymaster\signer.ts

/**
 * paymaster/signer.ts — Paymaster data signer
 *
 * Generates and signs the paymasterAndData field for sponsored UserOperations.
 *
 * AetherisPaymaster.sol expects paymasterAndData to be:
 *   bytes20 paymasterAddress
 *   bytes32 validUntil    (6 bytes, right-padded to 32)
 *   bytes32 validAfter    (6 bytes, right-padded to 32)
 *   bytes65 signature     (ECDSA sig of the above + userOpHash)
 *
 * The PAYMASTER_SIGNER_KEY must be registered in AetherisPaymaster.sol
 * as the authorised verifying signer.
 *
 * Reference: ERC-4337 section 7.2 — Paymaster Validation
 */

import { Hex, Address, encodeAbiParameters, parseAbiParameters, hashMessage, keccak256, concat, pad, toHex } from 'viem';
import { privateKeyToAccount, sign } from 'viem/accounts';
import { Config } from '../config';

/** Validity window for sponsored UserOps. 5 minutes from now. */
const VALIDITY_WINDOW_SECS = 5 * 60;

export class PaymasterSigner {
  private readonly signerAccount: ReturnType<typeof privateKeyToAccount>;

  constructor(private readonly config: Config) {
    this.signerAccount = privateKeyToAccount(config.paymasterSignerKey);
  }

  /**
   * Generate signed paymasterAndData for a UserOperation.
   *
   * @param userOpHash The EIP-4337 UserOperation hash (from EntryPoint.getUserOpHash())
   * @returns Hex-encoded paymasterAndData ready to include in the UserOperation
   */
  async sign(userOpHash: Hex): Promise<Hex> {
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now - 30;       // Allow 30s clock drift
    const validUntil = now + VALIDITY_WINDOW_SECS;

    // Encode the message that AetherisPaymaster.sol will verify:
    // abi.encode(userOpHash, validUntil, validAfter)
    const message = encodeAbiParameters(
      parseAbiParameters('bytes32, uint48, uint48'),
      [userOpHash, validUntil, validAfter]
    );

    // Sign the keccak256 hash of the message
    // AetherisPaymaster.sol uses ECDSA.recover on keccak256(message)
    const messageHash = keccak256(message);
    const signature = await this.signerAccount.signMessage({
      message: { raw: messageHash },
    });

    // Construct paymasterAndData:
    //   [paymasterAddress (20 bytes)][validUntil (6 bytes)][validAfter (6 bytes)][sig (65 bytes)]
    const paymasterAndData = concat([
      this.config.paymasterAddr as Hex,
      pad(toHex(validUntil), { size: 6 }),
      pad(toHex(validAfter), { size: 6 }),
      signature,
    ]);

    return paymasterAndData;
  }

  /** The address of the signer. Must match the verifyingSigner in AetherisPaymaster.sol. */
  get signerAddress(): Address {
    return this.signerAccount.address;
  }
}
