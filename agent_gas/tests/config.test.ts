// Aetheris\agent_gas\tests\config.test.ts
//
// Tests for loadConfig() — validates required env vars, RPC resolution
// by chain ID, address normalisation, and numeric field parsing.

import { loadConfig } from '../src/config';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setValidSepoliaEnv(): void {
  process.env.BASE_SEPOLIA_RPC_URL  = 'https://base-sepolia.g.alchemy.com/v2/TEST';
  process.env.BASE_SEPOLIA_WS_URL   = 'wss://base-sepolia.g.alchemy.com/v2/TEST';
  process.env.CHAIN_ID              = '84532';
  process.env.BUNDLER_PRIVATE_KEY   = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  process.env.PAYMASTER_SIGNER_KEY  = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  process.env.PAYMASTER_ADDR        = '0xPaymaster000000000000000000000000000001';
  process.env.ACCOUNT_FACTORY_ADDR  = '0xFactory0000000000000000000000000000001';
  process.env.VAULT_ADDR            = '0xVault00000000000000000000000000000001';
  process.env.STAKING_ADDR          = '0xStaking0000000000000000000000000000001';
}

function clearEnv(): void {
  const keys = [
    'BASE_SEPOLIA_RPC_URL', 'BASE_SEPOLIA_WS_URL',
    'BASE_MAINNET_RPC_URL', 'BASE_MAINNET_WS_URL',
    'QUICKNODE_SEPOLIA_RPC_URL',
    'RPC_HTTP_URL', 'RPC_WS_URL',
    'CHAIN_ID', 'BUNDLER_PRIVATE_KEY', 'PAYMASTER_SIGNER_KEY',
    'ENTRY_POINT_ADDR', 'PAYMASTER_ADDR', 'ACCOUNT_FACTORY_ADDR',
    'VAULT_ADDR', 'STAKING_ADDR',
    'PORT', 'DB_PATH', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
    'DISCORD_WEBHOOK_URL', 'BUNDLE_INTERVAL_MS', 'MAX_BUNDLE_SIZE',
    'MAX_SPONSORED_GAS_USDC', 'GAS_OVERHEAD_PCT',
  ];
  keys.forEach(k => delete process.env[k]);
}

beforeEach(() => clearEnv());
afterEach(() => clearEnv());

// ─── Sepolia happy path ───────────────────────────────────────────────────────

describe('loadConfig — Sepolia (default)', () => {
  it('loads successfully with BASE_SEPOLIA_* vars set', () => {
    setValidSepoliaEnv();
    expect(() => loadConfig()).not.toThrow();
  });

  it('defaults CHAIN_ID to 84532 (Base Sepolia) when not set', () => {
    setValidSepoliaEnv();
    delete process.env.CHAIN_ID;
    const config = loadConfig();
    expect(config.chainId).toBe(84532);
  });

  it('uses BASE_SEPOLIA_RPC_URL as rpcHttpUrl on Sepolia', () => {
    setValidSepoliaEnv();
    const config = loadConfig();
    expect(config.rpcHttpUrl).toBe('https://base-sepolia.g.alchemy.com/v2/TEST');
  });

  it('uses BASE_SEPOLIA_WS_URL as rpcWsUrl on Sepolia', () => {
    setValidSepoliaEnv();
    const config = loadConfig();
    expect(config.rpcWsUrl).toBe('wss://base-sepolia.g.alchemy.com/v2/TEST');
  });

  it('sets rpcHttpFallback from QUICKNODE_SEPOLIA_RPC_URL when provided', () => {
    setValidSepoliaEnv();
    process.env.QUICKNODE_SEPOLIA_RPC_URL = 'https://quicknode-sepolia.example.com';
    const config = loadConfig();
    expect(config.rpcHttpFallback).toBe('https://quicknode-sepolia.example.com');
  });

  it('sets rpcHttpFallback to null when QUICKNODE_SEPOLIA_RPC_URL is empty', () => {
    setValidSepoliaEnv();
    process.env.QUICKNODE_SEPOLIA_RPC_URL = '';
    const config = loadConfig();
    expect(config.rpcHttpFallback).toBeNull();
  });
});

// ─── Mainnet happy path ───────────────────────────────────────────────────────

describe('loadConfig — Mainnet', () => {
  it('loads successfully with BASE_MAINNET_* vars and CHAIN_ID=8453', () => {
    setValidSepoliaEnv(); // provides wallet + contract vars
    process.env.CHAIN_ID = '8453';
    process.env.BASE_MAINNET_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/TEST';
    process.env.BASE_MAINNET_WS_URL  = 'wss://base-mainnet.g.alchemy.com/v2/TEST';
    expect(() => loadConfig()).not.toThrow();
  });

  it('uses BASE_MAINNET_RPC_URL when CHAIN_ID=8453', () => {
    setValidSepoliaEnv();
    process.env.CHAIN_ID = '8453';
    process.env.BASE_MAINNET_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/MAINNET';
    process.env.BASE_MAINNET_WS_URL  = 'wss://base-mainnet.g.alchemy.com/v2/MAINNET';
    const config = loadConfig();
    expect(config.rpcHttpUrl).toBe('https://base-mainnet.g.alchemy.com/v2/MAINNET');
  });

  it('throws a clear error when BASE_MAINNET_RPC_URL is missing on mainnet', () => {
    setValidSepoliaEnv();
    process.env.CHAIN_ID = '8453';
    // BASE_MAINNET_RPC_URL not set
    expect(() => loadConfig()).toThrow('BASE_MAINNET_RPC_URL');
  });
});

// ─── Required wallet fields ───────────────────────────────────────────────────

describe('loadConfig — required wallet fields', () => {
  it('throws when BUNDLER_PRIVATE_KEY is missing', () => {
    setValidSepoliaEnv();
    delete process.env.BUNDLER_PRIVATE_KEY;
    expect(() => loadConfig()).toThrow('BUNDLER_PRIVATE_KEY');
  });

  it('throws when PAYMASTER_SIGNER_KEY is missing', () => {
    setValidSepoliaEnv();
    delete process.env.PAYMASTER_SIGNER_KEY;
    expect(() => loadConfig()).toThrow('PAYMASTER_SIGNER_KEY');
  });
});

// ─── Required contract fields ─────────────────────────────────────────────────

describe('loadConfig — required contract fields', () => {
  const contractVars = [
    'PAYMASTER_ADDR',
    'ACCOUNT_FACTORY_ADDR',
    'VAULT_ADDR',
    'STAKING_ADDR',
  ];

  test.each(contractVars)('throws when %s is missing', (varName) => {
    setValidSepoliaEnv();
    delete process.env[varName];
    expect(() => loadConfig()).toThrow(varName);
  });
});

// ─── Address normalisation ────────────────────────────────────────────────────

describe('loadConfig — address normalisation', () => {
  it('lowercases VAULT_ADDR', () => {
    setValidSepoliaEnv();
    process.env.VAULT_ADDR = '0xAABBCCDD00000000000000000000000000000001';
    expect(loadConfig().vaultAddr).toBe('0xaabbccdd00000000000000000000000000000001');
  });

  it('lowercases STAKING_ADDR', () => {
    setValidSepoliaEnv();
    process.env.STAKING_ADDR = '0xAABBCCDD00000000000000000000000000000002';
    expect(loadConfig().stakingAddr).toBe('0xaabbccdd00000000000000000000000000000002');
  });

  it('uses canonical EntryPoint address when ENTRY_POINT_ADDR not set', () => {
    setValidSepoliaEnv();
    expect(loadConfig().entryPointAddr.toLowerCase()).toBe(
      '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789'
    );
  });
});

// ─── Numeric field parsing ────────────────────────────────────────────────────

describe('loadConfig — numeric field parsing', () => {
  it('parses PORT as number, defaults to 3000', () => {
    setValidSepoliaEnv();
    expect(loadConfig().port).toBe(3000);
    process.env.PORT = '4000';
    expect(loadConfig().port).toBe(4000);
  });

  it('parses BUNDLE_INTERVAL_MS, defaults to 2000', () => {
    setValidSepoliaEnv();
    expect(loadConfig().bundleIntervalMs).toBe(2000);
    process.env.BUNDLE_INTERVAL_MS = '5000';
    expect(loadConfig().bundleIntervalMs).toBe(5000);
  });

  it('parses MAX_SPONSORED_GAS_USDC as bigint, defaults to 5000000n', () => {
    setValidSepoliaEnv();
    expect(loadConfig().maxSponsoredGasUsdc).toBe(5_000_000n);
    process.env.MAX_SPONSORED_GAS_USDC = '10000000';
    expect(loadConfig().maxSponsoredGasUsdc).toBe(10_000_000n);
  });

  it('parses GAS_OVERHEAD_PCT, defaults to 10', () => {
    setValidSepoliaEnv();
    expect(loadConfig().gasOverheadPct).toBe(10);
  });
});

// ─── Optional fields ─────────────────────────────────────────────────────────

describe('loadConfig — optional fields', () => {
  it('sets alert fields to null when not provided', () => {
    setValidSepoliaEnv();
    const config = loadConfig();
    expect(config.telegramBotToken).toBeNull();
    expect(config.telegramChatId).toBeNull();
    expect(config.discordWebhookUrl).toBeNull();
  });

  it('captures TELEGRAM_BOT_TOKEN when provided', () => {
    setValidSepoliaEnv();
    process.env.TELEGRAM_BOT_TOKEN = 'bot12345:ABC-test';
    expect(loadConfig().telegramBotToken).toBe('bot12345:ABC-test');
  });

  it('defaults DB_PATH to ./data/agent_gas.db', () => {
    setValidSepoliaEnv();
    expect(loadConfig().dbPath).toBe('./data/agent_gas.db');
  });
});

// ─── Derived wallet address ───────────────────────────────────────────────────

describe('loadConfig — derived addresses', () => {
  it('derives bundlerAddress from BUNDLER_PRIVATE_KEY (Hardhat key #0)', () => {
    setValidSepoliaEnv();
    expect(loadConfig().bundlerAddress.toLowerCase()).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
    );
  });
});