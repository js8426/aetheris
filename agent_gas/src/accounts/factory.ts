// Aetherisgent_gas\src\accounts\factory.ts

/**
 * accounts/factory.ts — AetherisAccountFactory interaction
 *
 * Provides utilities for:
 *   - Computing counterfactual smart account addresses (before deployment)
 *   - Checking if an account has been deployed
 *   - Building initCode for first-time account creation
 *
 * ERC-4337 account creation flow:
 *   1. Frontend calls getCounterfactualAddress(owner) to get the account address
 *   2. User signs a UserOperation with initCode = factory.address + factory.createAccount(owner, salt)
 *   3. EntryPoint calls factory.createAccount() during verification if account not deployed
 *   4. Account is deployed and the UserOp executes atomically
 *
 * AetherisAccountFactory.createAccount(address owner, uint256 salt)
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  Address,
  Hex,
  concat,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { Config } from '../config';

const FACTORY_ABI = parseAbi([
  'function createAccount(address owner, uint256 salt) returns (address)',
  'function getAddress(address owner, uint256 salt) view returns (address)',
]);

export class AccountFactory {
  private client: any;

  constructor(private readonly config: Config) {
    const chain = config.chainId === 8453 ? base : baseSepolia;
    this.client = createPublicClient({
      chain,
      transport: http(config.rpcHttpUrl),
    });
  }

  /**
   * Compute the counterfactual address for a smart account.
   * This is the address the account will have once deployed, before deployment.
   *
   * @param owner The EOA that owns the smart account
   * @param salt Deployment salt (default: 0 for the first account)
   */
  async getCounterfactualAddress(owner: Address, salt = 0n): Promise<Address> {
    return await this.client.readContract({
      address: this.config.accountFactoryAddr,
      abi: FACTORY_ABI,
      functionName: 'getAddress',
      args: [owner, salt],
    });
  }

  /**
   * Check if a smart account has been deployed.
   * Returns true if there is bytecode at the address.
   */
  async isDeployed(accountAddress: Address): Promise<boolean> {
    const code = await this.client.getBytecode({ address: accountAddress });
    return !!(code && code.length > 2); // '0x' = not deployed
  }

  /**
   * Build the initCode for a UserOperation that creates a new smart account.
   * initCode = factory address (20 bytes) + factory.createAccount(owner, salt) calldata
   *
   * @param owner The EOA that will own the smart account
   * @param salt Deployment salt (default: 0)
   */
  buildInitCode(owner: Address, salt = 0n): Hex {
    const callData = encodeFunctionData({
      abi: FACTORY_ABI,
      functionName: 'createAccount',
      args: [owner, salt],
    });

    // initCode = factoryAddress (no 0x prefix) + createAccount calldata (no 0x prefix)
    return concat([this.config.accountFactoryAddr, callData]) as Hex;
  }

  /**
   * Resolve the smart account address for a given owner.
   * If the account is already deployed, returns the existing address.
   * If not deployed, returns the counterfactual address.
   *
   * @param owner The EOA owner address
   */
  async resolveAccountAddress(owner: Address, salt = 0n): Promise<{
    address: Address;
    deployed: boolean;
    initCode: Hex;
  }> {
    const address = await this.getCounterfactualAddress(owner, salt);
    const deployed = await this.isDeployed(address);

    return {
      address,
      deployed,
      // initCode is '0x' if already deployed, otherwise the creation calldata
      initCode: deployed ? '0x' : this.buildInitCode(owner, salt),
    };
  }
}
