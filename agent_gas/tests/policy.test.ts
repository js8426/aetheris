// Aetheris\agent_gas\tests\policy.test.ts
//
// Tests for SponsorshipPolicy — decides which UserOperations get sponsored.
// This is a pure decision-logic class with no network dependencies.
//
// Critical properties tested:
//   - Vault and staking functions are approved
//   - Unknown targets are rejected
//   - Unknown selectors are rejected
//   - Gas cost above $5 cap is rejected
//   - Missing or malformed callData is rejected

import { SponsorshipPolicy } from '../src/paymaster/policy';
import { Config } from '../src/config';

// ─── Mock config ──────────────────────────────────────────────────────────────

const VAULT_ADDR   = '0xcccc000000000000000000000000000000000003';
const STAKING_ADDR = '0xdddd000000000000000000000000000000000004';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    rpcHttpUrl: 'https://test',
    rpcWsUrl: 'wss://test',
    chainId: 8453,
    bundlerPrivateKey: '0xdeadbeef' as any,
    bundlerAddress: '0xbundler' as any,
    paymasterSignerKey: '0xdeadbeef' as any,
    paymasterSignerAddress: '0xsigner' as any,
    entryPointAddr: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as any,
    paymasterAddr: '0xpaymaster' as any,
    accountFactoryAddr: '0xfactory' as any,
    vaultAddr: VAULT_ADDR as any,
    stakingAddr: STAKING_ADDR as any,
    bundleIntervalMs: 2000,
    maxBundleSize: 10,
    maxSponsoredGasUsdc: 5_000_000n, // $5.00
    gasOverheadPct: 10,
    port: 3000,
    dbPath: './test.db',
    telegramBotToken: null,
    telegramChatId: null,
    discordWebhookUrl: null,
    ...overrides,
  } as Config;
}

// ─── Helpers: build ABI-encoded execute() calldata ────────────────────────────
//
// AetherisAccount.execute(address target, uint256 value, bytes callData)
// selector: 0xb61d27f6
// ABI encoding: selector(4) + target(32) + value(32) + offset(32) + length(32) + data
//
// For our tests we just need the selector and target to be recognisable.
// We manually craft the calldata bytes to match what policy.ts parses.

const EXECUTE_SEL = 'b61d27f6'; // execute(address,uint256,bytes)

// Sponsored function selectors (from policy.ts)
const DEPOSIT_SEL   = '47e7ef24'; // deposit(uint256)
const WITHDRAW_SEL  = '2e1a7d4d'; // withdraw(uint256)
const REDEEM_SEL    = 'db006a75'; // redeem(uint256)
const STAKE_SEL     = 'a694fc3a'; // stake(uint256)
const UNSTAKE_SEL   = '2def6620'; // unstake(uint256)
const CLAIM_SEL     = '372500ab'; // claimRewards()

/**
 * Build fake execute() calldata that policy.ts can decode.
 *
 * Layout:
 *   bytes 0–3:   execute selector
 *   bytes 4–35:  target address (right-aligned in 32 bytes)
 *   bytes 36–67: value (zero)
 *   bytes 68–99: calldata offset (0x60 = 96)
 *   bytes 100–131: calldata length (4 bytes)
 *   bytes 132–163: inner selector (left-aligned, zero-padded)
 */
function buildCallData(targetAddr: string, innerSelector: string): string {
  const padAddr = targetAddr.replace('0x', '').padStart(64, '0');
  const padValue = ''.padStart(64, '0');
  const padOffset = '60'.padStart(64, '0');      // offset = 96 bytes
  const padLength = '4'.padStart(64, '0');        // 4 bytes of selector
  const innerPadded = innerSelector.padEnd(64, '0');
  return '0x' + EXECUTE_SEL + padAddr + padValue + padOffset + padLength + innerPadded;
}

// ─── Approved operations ──────────────────────────────────────────────────────

describe('SponsorshipPolicy — approved operations', () => {
  const policy = new SponsorshipPolicy(makeConfig());

  const approvedCases: [string, string, string][] = [
    ['vault.deposit',        VAULT_ADDR,   DEPOSIT_SEL],
    ['vault.withdraw',       VAULT_ADDR,   WITHDRAW_SEL],
    ['vault.redeem',         VAULT_ADDR,   REDEEM_SEL],
    ['staking.stake',        STAKING_ADDR, STAKE_SEL],
    ['staking.unstake',      STAKING_ADDR, UNSTAKE_SEL],
    ['staking.claimRewards', STAKING_ADDR, CLAIM_SEL],
  ];

  test.each(approvedCases)('%s should be approved', (_name, target, selector) => {
    const decision = policy.evaluate(
      { callData: buildCallData(target, selector) as any },
      1_000n // gas cost well below $5 cap
    );
    expect(decision.shouldSponsor).toBe(true);
  });
});

// ─── Rejected: wrong target ───────────────────────────────────────────────────

describe('SponsorshipPolicy — rejected: wrong target', () => {
  it('rejects calls to unknown contract', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const unknown = '0xffff000000000000000000000000000000000099';
    const decision = policy.evaluate(
      { callData: buildCallData(unknown, DEPOSIT_SEL) as any },
      1_000n
    );
    expect(decision.shouldSponsor).toBe(false);
    expect(decision.reason).toContain(unknown.toLowerCase());
  });
});

// ─── Rejected: wrong selector ────────────────────────────────────────────────

describe('SponsorshipPolicy — rejected: unknown function', () => {
  it('rejects arbitrary function on vault', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const unknownSel = 'aabbccdd'; // not in whitelist
    const decision = policy.evaluate(
      { callData: buildCallData(VAULT_ADDR, unknownSel) as any },
      1_000n
    );
    expect(decision.shouldSponsor).toBe(false);
  });

  it('rejects transferOwnership on vault (admin function)', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const transferOwnershipSel = 'f2fde38b';
    const decision = policy.evaluate(
      { callData: buildCallData(VAULT_ADDR, transferOwnershipSel) as any },
      1_000n
    );
    expect(decision.shouldSponsor).toBe(false);
  });
});

// ─── Rejected: gas cap exceeded ──────────────────────────────────────────────

describe('SponsorshipPolicy — rejected: gas cap', () => {
  it('rejects when gas cost exceeds $5 USDC cap', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const decision = policy.evaluate(
      { callData: buildCallData(VAULT_ADDR, DEPOSIT_SEL) as any },
      6_000_000n // $6.00 — over cap
    );
    expect(decision.shouldSponsor).toBe(false);
    expect(decision.reason.toLowerCase()).toContain('exceed');
  });

  it('approves when gas cost exactly equals cap', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const decision = policy.evaluate(
      { callData: buildCallData(VAULT_ADDR, DEPOSIT_SEL) as any },
      5_000_000n // exactly $5.00
    );
    // At the boundary: should approve (≤ not <)
    expect(decision.shouldSponsor).toBe(true);
  });

  it('rejects when gas cost is 1 unit above cap', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const decision = policy.evaluate(
      { callData: buildCallData(VAULT_ADDR, DEPOSIT_SEL) as any },
      5_000_001n
    );
    expect(decision.shouldSponsor).toBe(false);
  });
});

// ─── Rejected: malformed callData ────────────────────────────────────────────

describe('SponsorshipPolicy — rejected: missing or malformed callData', () => {
  it('rejects missing callData', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const decision = policy.evaluate({}, 0n);
    expect(decision.shouldSponsor).toBe(false);
  });

  it('rejects callData that is too short', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    const decision = policy.evaluate({ callData: '0x1234' as any }, 0n);
    expect(decision.shouldSponsor).toBe(false);
  });

  it('rejects callData with wrong outer selector', () => {
    const policy = new SponsorshipPolicy(makeConfig());
    // Not an execute() call
    const decision = policy.evaluate(
      { callData: '0xdeadbeef' + '00'.repeat(100) as any },
      0n
    );
    expect(decision.shouldSponsor).toBe(false);
  });
});

// ─── Custom gas cap ───────────────────────────────────────────────────────────

describe('SponsorshipPolicy — custom gas cap', () => {
  it('respects a lower custom cap', () => {
    const policy = new SponsorshipPolicy(makeConfig({ maxSponsoredGasUsdc: 1_000_000n }));
    const decision = policy.evaluate(
      { callData: buildCallData(VAULT_ADDR, DEPOSIT_SEL) as any },
      1_500_000n // $1.50 — over custom $1.00 cap
    );
    expect(decision.shouldSponsor).toBe(false);
  });
});
