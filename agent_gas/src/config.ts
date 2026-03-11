// Aetheris\agent_gas\src\config.ts

/**
 * config.ts — Agent Gas configuration
 *
 * Loads all config from environment variables (via dotenv).
 * Validates required fields at startup with clear error messages.
 * All addresses are normalised to lowercase.
 *
 * RPC resolution priority:
 *   Sepolia:  BASE_SEPOLIA_RPC_URL → QUICKNODE_SEPOLIA_RPC_URL
 *   Mainnet:  BASE_MAINNET_RPC_URL
 *   CHAIN_ID: 84532 = Base Sepolia (default) | 8453 = Base Mainnet
 */

import { privateKeyToAccount } from 'viem/accounts';
import { Address, Hex } from 'viem';

export interface Config {
  // RPC
  rpcHttpUrl: string;
  rpcWsUrl: string;
  rpcHttpFallback: string | null;   // QuickNode failover, if set
  chainId: number;

  // Wallets
  bundlerPrivateKey: Hex;
  bundlerAddress: Address;
  paymasterSignerKey: Hex;
  paymasterSignerAddress: Address;

  // Contract addresses
  entryPointAddr: Address;
  paymasterAddr: Address;
  accountFactoryAddr: Address;
  vaultAddr: Address;
  stakingAddr: Address;

  // Bundler settings
  bundleIntervalMs: number;
  maxBundleSize: number;
  maxSponsoredGasUsdc: bigint;
  gasOverheadPct: number;

  // Server
  port: number;

  // Database
  dbPath: string;

  // Alerts
  telegramBotToken: string | null;
  telegramChatId: string | null;
  discordWebhookUrl: string | null;
}

/**
 * Load and validate all configuration from process.env.
 * Throws a descriptive error if any required variable is missing.
 */
export function loadConfig(): Config {
  const chainId = parseInt(process.env.CHAIN_ID ?? '84532', 10);
  const isSepolia = chainId === 84532;

  // ── RPC resolution ──────────────────────────────────────────────────────────
  // Use BASE_SEPOLIA_* or BASE_MAINNET_* depending on CHAIN_ID,
  // falling back to the bare RPC_HTTP_URL / RPC_WS_URL names if set.
  const rpcHttpUrl =
    (isSepolia
      ? process.env.BASE_SEPOLIA_RPC_URL
      : process.env.BASE_MAINNET_RPC_URL) ??
    process.env.RPC_HTTP_URL;

  const rpcWsUrl =
    (isSepolia
      ? process.env.BASE_SEPOLIA_WS_URL
      : process.env.BASE_MAINNET_WS_URL) ??
    process.env.RPC_WS_URL;

  if (!rpcHttpUrl) {
    throw new Error(
      isSepolia
        ? "Required env var 'BASE_SEPOLIA_RPC_URL' is not set. Check your .env file."
        : "Required env var 'BASE_MAINNET_RPC_URL' is not set. Check your .env file."
    );
  }
  if (!rpcWsUrl) {
    throw new Error(
      isSepolia
        ? "Required env var 'BASE_SEPOLIA_WS_URL' is not set. Check your .env file."
        : "Required env var 'BASE_MAINNET_WS_URL' is not set. Check your .env file."
    );
  }

  const rpcHttpFallback = process.env.QUICKNODE_SEPOLIA_RPC_URL || null;

  // ── Wallet keys ─────────────────────────────────────────────────────────────
  const bundlerPrivateKey = requireEnv('BUNDLER_PRIVATE_KEY') as Hex;
  const paymasterSignerKey = requireEnv('PAYMASTER_SIGNER_KEY') as Hex;

  // Derive addresses from private keys so we never have a mismatch
  const bundlerAccount = privateKeyToAccount(bundlerPrivateKey);
  const paymasterSignerAccount = privateKeyToAccount(paymasterSignerKey);

  return {
    rpcHttpUrl,
    rpcWsUrl,
    rpcHttpFallback,
    chainId,

    bundlerPrivateKey,
    bundlerAddress: bundlerAccount.address,
    paymasterSignerKey,
    paymasterSignerAddress: paymasterSignerAccount.address,

    entryPointAddr: (
      process.env.ENTRY_POINT_ADDR ?? '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
    ).toLowerCase() as Address,
    paymasterAddr:      requireEnv('PAYMASTER_ADDR').toLowerCase() as Address,
    accountFactoryAddr: requireEnv('ACCOUNT_FACTORY_ADDR').toLowerCase() as Address,
    vaultAddr:          requireEnv('VAULT_ADDR').toLowerCase() as Address,
    stakingAddr:        requireEnv('STAKING_ADDR').toLowerCase() as Address,

    bundleIntervalMs:     parseInt(process.env.BUNDLE_INTERVAL_MS   ?? '2000', 10),
    maxBundleSize:        parseInt(process.env.MAX_BUNDLE_SIZE       ?? '10',   10),
    maxSponsoredGasUsdc:  BigInt(process.env.MAX_SPONSORED_GAS_USDC  ?? '5000000'),
    gasOverheadPct:       parseInt(process.env.GAS_OVERHEAD_PCT      ?? '10',   10),

    port:   parseInt(process.env.PORT ?? '3000', 10),
    dbPath: process.env.DB_PATH ?? './data/agent_gas.db',

    telegramBotToken:  process.env.TELEGRAM_BOT_TOKEN  || null,
    telegramChatId:    process.env.TELEGRAM_CHAT_ID    || null,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
  };
}

/** Get a required environment variable or throw a clear error. */
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `Required environment variable '${key}' is not set. Check your .env file.`
    );
  }
  return val;
}