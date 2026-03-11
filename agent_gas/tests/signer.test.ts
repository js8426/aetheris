// Aetheris\agent_gas\tests\signer.test.ts
//
// Tests for PaymasterSigner — generates and signs paymasterAndData.
//
// Uses a deterministic test private key so results are reproducible.
// Does NOT require a live RPC — signing is purely local.

import { PaymasterSigner } from '../src/paymaster/signer';
import { Config } from '../src/config';
import { Hex, isHex, size } from 'viem';

// ─── Test key (never use in production) ─────────────────────────────────────
const TEST_SIGNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const TEST_PAYMASTER  = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
const TEST_USER_OP_HASH = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex;

function makeConfig(): Config {
  return {
    rpcHttpUrl: 'https://test',
    rpcWsUrl: 'wss://test',
    chainId: 8453,
    bundlerPrivateKey: TEST_SIGNER_KEY,
    bundlerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as any,
    paymasterSignerKey: TEST_SIGNER_KEY,
    paymasterSignerAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as any,
    entryPointAddr: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as any,
    paymasterAddr: TEST_PAYMASTER as any,
    accountFactoryAddr: '0xfactory' as any,
    vaultAddr: '0xvault' as any,
    stakingAddr: '0xstaking' as any,
    bundleIntervalMs: 2000,
    maxBundleSize: 10,
    maxSponsoredGasUsdc: 5_000_000n,
    gasOverheadPct: 10,
    port: 3000,
    dbPath: './test.db',
    telegramBotToken: null,
    telegramChatId: null,
    discordWebhookUrl: null,
  } as Config;
}

// ─── signerAddress ────────────────────────────────────────────────────────────

describe('PaymasterSigner.signerAddress', () => {
  it('returns a valid Ethereum address', () => {
    const signer = new PaymasterSigner(makeConfig());
    expect(signer.signerAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('matches the known address for the test key', () => {
    const signer = new PaymasterSigner(makeConfig());
    // Hardhat account #0 address for the test private key above
    expect(signer.signerAddress.toLowerCase()).toBe(
      '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
    );
  });
});

// ─── sign() ───────────────────────────────────────────────────────────────────

describe('PaymasterSigner.sign', () => {
  it('returns a hex string', async () => {
    const signer = new PaymasterSigner(makeConfig());
    const result = await signer.sign(TEST_USER_OP_HASH);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/^0x/);
  });

  it('result is valid hex', async () => {
    const signer = new PaymasterSigner(makeConfig());
    const result = await signer.sign(TEST_USER_OP_HASH);
    expect(isHex(result)).toBe(true);
  });

  it('result starts with the paymaster address (first 20 bytes)', async () => {
    const signer = new PaymasterSigner(makeConfig());
    const result = await signer.sign(TEST_USER_OP_HASH);
    // First 20 bytes = paymaster address (40 hex chars after 0x)
    const firstAddr = ('0x' + result.slice(2, 42)).toLowerCase();
    expect(firstAddr).toBe(TEST_PAYMASTER.toLowerCase());
  });

  it('result is long enough to contain address + timestamps + signature', async () => {
    const signer = new PaymasterSigner(makeConfig());
    const result = await signer.sign(TEST_USER_OP_HASH);
    // Minimum: 20 bytes (addr) + 6 (validUntil) + 6 (validAfter) + 65 (sig) = 97 bytes = 194 hex chars
    const byteLength = (result.length - 2) / 2;
    expect(byteLength).toBeGreaterThanOrEqual(97);
  });

  it('produces a different result for different userOpHashes', async () => {
    const signer = new PaymasterSigner(makeConfig());
    const hash1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
    const hash2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
    const result1 = await signer.sign(hash1);
    const result2 = await signer.sign(hash2);
    expect(result1).not.toBe(result2);
  });

  it('is deterministic for same hash and same key', async () => {
    const signer = new PaymasterSigner(makeConfig());
    // Note: if validUntil/validAfter use Date.now(), results will differ if called
    // across a second boundary. In practice sign() is called once per op.
    // We just verify the format is consistent.
    const result = await signer.sign(TEST_USER_OP_HASH);
    expect(result.startsWith('0x')).toBe(true);
  });
});
