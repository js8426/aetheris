// Aetheris\agent_gas\tests\factory.test.ts
//
// Tests for AccountFactory — counterfactual address computation and initCode builder.
// createPublicClient is mocked so no live Base node is required.
//
// NOTE: jest.mock() is hoisted by Jest before imports at runtime,
// so all imports stay at the top even though mocks are declared after them.

import { Address } from 'viem';
import { AccountFactory } from '../src/accounts/factory';
import { Config } from '../src/config';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockReadContract = jest.fn();
const mockGetBytecode  = jest.fn();

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(() => ({
      readContract: mockReadContract,
      getBytecode:  mockGetBytecode,
    })),
    http: jest.fn(),
  };
});

jest.mock('viem/chains', () => ({
  base:        { id: 8453,  name: 'Base' },
  baseSepolia: { id: 84532, name: 'Base Sepolia' },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FACTORY_ADDR  = '0x0000000000000000000000000000000000000001' as Address;
const OWNER_ADDR    = '0x0000000000000000000000000000000000000002' as Address;
const DEPLOYED_ADDR = '0x0000000000000000000000000000000000000003' as Address;

function makeConfig(): Config {
  return {
    rpcHttpUrl: 'https://test',
    rpcWsUrl: 'wss://test',
    rpcHttpFallback: null,
    chainId: 84532,
    accountFactoryAddr: FACTORY_ADDR,
    bundlerPrivateKey: '0x' as any,
    bundlerAddress: '0x' as any,
    paymasterSignerKey: '0x' as any,
    paymasterSignerAddress: '0x' as any,
    entryPointAddr: '0x' as any,
    paymasterAddr: '0x' as any,
    vaultAddr: '0x' as any,
    stakingAddr: '0x' as any,
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

beforeEach(() => {
  mockReadContract.mockReset();
  mockGetBytecode.mockReset();
});

// ─── getCounterfactualAddress ─────────────────────────────────────────────────

describe('AccountFactory.getCounterfactualAddress', () => {
  it('calls readContract with getAddress and returns the result', async () => {
    mockReadContract.mockResolvedValue(DEPLOYED_ADDR);
    const factory = new AccountFactory(makeConfig());
    const addr = await factory.getCounterfactualAddress(OWNER_ADDR);
    expect(addr).toBe(DEPLOYED_ADDR);
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'getAddress' })
    );
  });

  it('passes owner and salt=0 by default', async () => {
    mockReadContract.mockResolvedValue(DEPLOYED_ADDR);
    const factory = new AccountFactory(makeConfig());
    await factory.getCounterfactualAddress(OWNER_ADDR);
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [OWNER_ADDR, 0n] })
    );
  });

  it('passes custom salt when provided', async () => {
    mockReadContract.mockResolvedValue(DEPLOYED_ADDR);
    const factory = new AccountFactory(makeConfig());
    await factory.getCounterfactualAddress(OWNER_ADDR, 42n);
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({ args: [OWNER_ADDR, 42n] })
    );
  });
});

// ─── isDeployed ───────────────────────────────────────────────────────────────

describe('AccountFactory.isDeployed', () => {
  it('returns true when bytecode is present', async () => {
    mockGetBytecode.mockResolvedValue('0x6080604052');
    const factory = new AccountFactory(makeConfig());
    expect(await factory.isDeployed(DEPLOYED_ADDR)).toBe(true);
  });

  it('returns false when bytecode is just 0x', async () => {
    mockGetBytecode.mockResolvedValue('0x');
    const factory = new AccountFactory(makeConfig());
    expect(await factory.isDeployed(DEPLOYED_ADDR)).toBe(false);
  });

  it('returns false when bytecode is undefined', async () => {
    mockGetBytecode.mockResolvedValue(undefined);
    const factory = new AccountFactory(makeConfig());
    expect(await factory.isDeployed(DEPLOYED_ADDR)).toBe(false);
  });
});

// ─── buildInitCode ────────────────────────────────────────────────────────────

describe('AccountFactory.buildInitCode', () => {
  it('returns a hex string starting with 0x', () => {
    const factory = new AccountFactory(makeConfig());
    expect(factory.buildInitCode(OWNER_ADDR)).toMatch(/^0x/);
  });

  it('initCode starts with the factory address bytes', () => {
    const factory = new AccountFactory(makeConfig());
    const initCode = factory.buildInitCode(OWNER_ADDR);
    const factoryBytes = initCode.slice(2, 42).toLowerCase();
    expect(factoryBytes).toBe(FACTORY_ADDR.replace('0x', '').toLowerCase());
  });

  it('initCode is longer than factory address alone', () => {
    const factory = new AccountFactory(makeConfig());
    expect(factory.buildInitCode(OWNER_ADDR).length).toBeGreaterThan(42);
  });

  it('initCode differs for different owners', () => {
    const factory = new AccountFactory(makeConfig());
    const owner2 = '0x0000000000000000000000000000000000000099' as Address;
    expect(factory.buildInitCode(OWNER_ADDR)).not.toBe(factory.buildInitCode(owner2));
  });

  it('initCode differs for different salts', () => {
    const factory = new AccountFactory(makeConfig());
    expect(factory.buildInitCode(OWNER_ADDR, 0n)).not.toBe(factory.buildInitCode(OWNER_ADDR, 1n));
  });
});

// ─── resolveAccountAddress ────────────────────────────────────────────────────

describe('AccountFactory.resolveAccountAddress', () => {
  it('returns deployed=true and initCode=0x when account exists', async () => {
    mockReadContract.mockResolvedValue(DEPLOYED_ADDR);
    mockGetBytecode.mockResolvedValue('0x6080604052');

    const factory = new AccountFactory(makeConfig());
    const result = await factory.resolveAccountAddress(OWNER_ADDR);

    expect(result.address).toBe(DEPLOYED_ADDR);
    expect(result.deployed).toBe(true);
    expect(result.initCode).toBe('0x');
  });

  it('returns deployed=false and non-empty initCode when not deployed', async () => {
    mockReadContract.mockResolvedValue(DEPLOYED_ADDR);
    mockGetBytecode.mockResolvedValue(undefined);

    const factory = new AccountFactory(makeConfig());
    const result = await factory.resolveAccountAddress(OWNER_ADDR);

    expect(result.address).toBe(DEPLOYED_ADDR);
    expect(result.deployed).toBe(false);
    expect(result.initCode).not.toBe('0x');
    expect(result.initCode).toMatch(/^0x/);
  });
});
