// Aetheris\agent_gas\tests\estimator.test.ts
//
// Tests for GasEstimator — UserOperation gas limit estimation.
//
// createPublicClient is mocked so no real HTTP connection is made.
// Tests verify overhead buffer math, fallback-on-failure, and return types.

import { GasEstimator } from '../src/gas/estimator';
import { Config } from '../src/config';

// ─── Mock viem so no real HTTP calls are made ────────────────────────────────

const mockRequest = jest.fn();

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      request: mockRequest,
    })),
    http: jest.fn(),
  };
});

jest.mock('viem/chains', () => ({
  base: { id: 8453, name: 'Base' },
  baseSepolia: { id: 84532, name: 'Base Sepolia' },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(gasOverheadPct = 10): Config {
  return {
    rpcHttpUrl: 'https://test-rpc',
    rpcWsUrl: 'wss://test',
    rpcHttpFallback: null,
    chainId: 84532,
    gasOverheadPct,
    entryPointAddr: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as any,
    bundlerPrivateKey: '0x' as any,
    bundlerAddress: '0x' as any,
    paymasterSignerKey: '0x' as any,
    paymasterSignerAddress: '0x' as any,
    paymasterAddr: '0x' as any,
    accountFactoryAddr: '0x' as any,
    vaultAddr: '0x' as any,
    stakingAddr: '0x' as any,
    bundleIntervalMs: 2000,
    maxBundleSize: 10,
    maxSponsoredGasUsdc: 5_000_000n,
    port: 3000,
    dbPath: './test.db',
    telegramBotToken: null,
    telegramChatId: null,
    discordWebhookUrl: null,
  } as Config;
}

const SAMPLE_OP = {
  sender: '0x0000000000000000000000000000000000000001' as any,
  nonce: '0x1' as any,
  callData: '0xdeadbeef' as any,
};

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  mockRequest.mockReset();
  // Suppress expected fallback warn noise in test output
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ─── RPC success path ─────────────────────────────────────────────────────────

describe('GasEstimator — RPC success', () => {
  it('uses values from RPC response when available', async () => {
    mockRequest.mockResolvedValue({
      callGasLimit: '0x186a0',
      verificationGasLimit: '0x249f0',
      preVerificationGas: '0xc350',
    });
    const estimator = new GasEstimator(makeConfig(0));
    const limits = await estimator.estimateGas(SAMPLE_OP);
    expect(limits.callGasLimit).toBe(100_000n);
    expect(limits.verificationGasLimit).toBe(150_000n);
    expect(limits.preVerificationGas).toBe(50_000n);
  });

  it('applies overhead buffer to RPC values', async () => {
    mockRequest.mockResolvedValue({
      callGasLimit: '0x186a0',
      verificationGasLimit: '0x249f0',
      preVerificationGas: '0xc350',
    });
    const estimator = new GasEstimator(makeConfig(10));
    const limits = await estimator.estimateGas(SAMPLE_OP);
    expect(limits.callGasLimit).toBe(110_000n);
    expect(limits.verificationGasLimit).toBe(165_000n);
    expect(limits.preVerificationGas).toBe(55_000n);
  });
});

// ─── RPC failure → static fallback ───────────────────────────────────────────

describe('GasEstimator — overhead buffer (static fallback)', () => {
  it('applies 10% overhead buffer to static fallback values', async () => {
    mockRequest.mockRejectedValue(new Error('RPC unavailable'));
    const estimator = new GasEstimator(makeConfig(10));
    const limits = await estimator.estimateGas(SAMPLE_OP);
    expect(limits.callGasLimit).toBe(110_000n);
    expect(limits.verificationGasLimit).toBe(165_000n);
    expect(limits.preVerificationGas).toBe(55_000n);
  });

  it('applies 0% overhead when gasOverheadPct is 0', async () => {
    mockRequest.mockRejectedValue(new Error('RPC unavailable'));
    const estimator = new GasEstimator(makeConfig(0));
    const limits = await estimator.estimateGas(SAMPLE_OP);
    expect(limits.callGasLimit).toBe(100_000n);
    expect(limits.verificationGasLimit).toBe(150_000n);
    expect(limits.preVerificationGas).toBe(50_000n);
  });

  it('applies 50% overhead when gasOverheadPct is 50', async () => {
    mockRequest.mockRejectedValue(new Error('RPC unavailable'));
    const estimator = new GasEstimator(makeConfig(50));
    const limits = await estimator.estimateGas(SAMPLE_OP);
    expect(limits.callGasLimit).toBe(150_000n);
    expect(limits.verificationGasLimit).toBe(225_000n);
    expect(limits.preVerificationGas).toBe(75_000n);
  });
});

// ─── Return types ─────────────────────────────────────────────────────────────

describe('GasEstimator — return types', () => {
  it('all returned values are bigints', async () => {
    mockRequest.mockRejectedValue(new Error('RPC unavailable'));
    const estimator = new GasEstimator(makeConfig());
    const limits = await estimator.estimateGas(SAMPLE_OP);
    expect(typeof limits.callGasLimit).toBe('bigint');
    expect(typeof limits.verificationGasLimit).toBe('bigint');
    expect(typeof limits.preVerificationGas).toBe('bigint');
  });

  it('all returned values are positive', async () => {
    mockRequest.mockRejectedValue(new Error('RPC unavailable'));
    const estimator = new GasEstimator(makeConfig());
    const limits = await estimator.estimateGas(SAMPLE_OP);
    expect(limits.callGasLimit).toBeGreaterThan(0n);
    expect(limits.verificationGasLimit).toBeGreaterThan(0n);
    expect(limits.preVerificationGas).toBeGreaterThan(0n);
  });
});

// ─── Buffer math unit tests (pure, no RPC) ───────────────────────────────────

describe('Buffer math', () => {
  function applyBuffer(value: bigint, pct: number): bigint {
    return value + (value * BigInt(pct)) / 100n;
  }

  it('10% buffer on 100k = 110k', () => {
    expect(applyBuffer(100_000n, 10)).toBe(110_000n);
  });

  it('0% buffer leaves value unchanged', () => {
    expect(applyBuffer(123_456n, 0)).toBe(123_456n);
  });

  it('100% buffer doubles the value', () => {
    expect(applyBuffer(50_000n, 100)).toBe(100_000n);
  });

  it('rounds down on non-integer result', () => {
    expect(applyBuffer(3n, 10)).toBe(3n);
  });
});
