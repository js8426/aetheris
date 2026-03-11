// Aetheris\aetheris-frontend\lib\contracts.ts

export const CONTRACT_ADDRESSES = {

  // ── Base Sepolia (84532) ──────────────────────────────────────────────────
  84532: {
    AX_TOKEN: (
      process.env.NEXT_PUBLIC_AX_TOKEN_84532 ||
      '0xaEDc8fAcF794449a4B4Ea23281c21FB3Bac37819'
    ) as `0x${string}`,

    STAKING: (
      process.env.NEXT_PUBLIC_STAKING_84532 ||
      '0xC72c2cbDC4209369bBE00a055c4BC0C26B4BE195'
    ) as `0x${string}`,

    PAYMASTER: (
      process.env.NEXT_PUBLIC_PAYMASTER_84532 ||
      '0x2238196266b1559Cba2E6A632E894B5E86B6743D'
    ) as `0x${string}`,

    ACCOUNT_FACTORY: (
      process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_84532 ||
      '0x5986cC8b32498077d746fCc22251Aa464655Fc98'
    ) as `0x${string}`,

    AGENT_ALPHA: (
      process.env.NEXT_PUBLIC_AGENT_ALPHA_84532 ||
      '0x33c9bF62b3a4f5607B379f533f782040bd13A959'
    ) as `0x${string}`,

    PROFIT_DISTRIBUTOR: (
      process.env.NEXT_PUBLIC_PROFIT_DISTRIBUTOR_84532 ||
      '0xC38A776b958c83482914BdE299c9a6bC846CCb95'
    ) as `0x${string}`,

    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
  },

  // ── Base Mainnet (8453) ───────────────────────────────────────────────────
  8453: {
    AX_TOKEN: (
      process.env.NEXT_PUBLIC_AX_TOKEN_8453 ||
      '0x0000000000000000000000000000000000000000'
    ) as `0x${string}`,

    STAKING: (
      process.env.NEXT_PUBLIC_STAKING_8453 ||
      '0x0000000000000000000000000000000000000000'
    ) as `0x${string}`,

    PAYMASTER: (
      process.env.NEXT_PUBLIC_PAYMASTER_8453 ||
      '0x0000000000000000000000000000000000000000'
    ) as `0x${string}`,

    ACCOUNT_FACTORY: (
      process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_8453 ||
      '0x0000000000000000000000000000000000000000'
    ) as `0x${string}`,

    AGENT_ALPHA: (
      process.env.NEXT_PUBLIC_AGENT_ALPHA_8453 ||
      '0xC3e285162DABC73f420B4b2a49dEF13b45B9b2eA'
    ) as `0x${string}`,

    PROFIT_DISTRIBUTOR: (
      process.env.NEXT_PUBLIC_PROFIT_DISTRIBUTOR_8453 ||
      '0x1b02f37387A79AFFeAC8Ec3aD91717e19A79E1ad'
    ) as `0x${string}`,

    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  },

} as const;

export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;

export function getContracts(chainId: number) {
  const supported = [84532, 8453] as const;
  const id = supported.find((c) => c === chainId) ?? 84532;
  return CONTRACT_ADDRESSES[id];
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────

export const AX_TOKEN_ABI = [
  { name: 'balanceOf',   type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance',   type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',     type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'decimals',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'Transfer',    type: 'event',
    inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
] as const;

export const STAKING_ABI = [
  // Write functions
  { name: 'stake',        type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'unstake',      type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'claimRewards', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },

  // View functions — these are the ACTUAL function names on the contract
  { name: 'stakedBalance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'getUserTier', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint8' }] },
  { name: 'pendingRewards', type: 'function', stateMutability: 'view',
    inputs: [{ name: '_user', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'getUserFeeDiscountBps', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }] },

  // Events
  { name: 'Staked',   type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true },
             { name: 'amount', type: 'uint256', indexed: false }] },
  { name: 'Unstaked', type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true },
             { name: 'amount', type: 'uint256', indexed: false }] },
  { name: 'RewardsClaimed', type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true },
             { name: 'amount', type: 'uint256', indexed: false }] },
] as const;

export const PROFIT_DISTRIBUTOR_ABI = [
  { name: 'deposit',     type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'withdraw',    type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'claimProfit', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'getUserInfo', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'deposited',       type: 'uint256' },
      { name: 'claimableProfit', type: 'uint256' },
      { name: 'totalClaimed',    type: 'uint256' },
    ] },
  { name: 'totalValueLocked',       type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalProfitDistributed', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'Deposited',     type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
  { name: 'Withdrawn',     type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
  { name: 'ProfitClaimed', type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
] as const;

export const AGENT_ALPHA_ABI = [
  { name: 'activateForUser',   type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'deactivateForUser', type: 'function', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { name: 'isUserActive',      type: 'function', stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
  { name: 'isActive',                type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'getTotalArbitrageProfit', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'UserActivated',   type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true }] },
  { name: 'UserDeactivated', type: 'event',
    inputs: [{ name: 'user', type: 'address', indexed: true }] },
] as const;

export const USDC_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'decimals',  type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

// // ─── Contract Addresses ───────────────────────────────────────────────────────
// // Fill these in after running your deployment scripts (Step 5)
// export const CONTRACT_ADDRESSES = {
//   // Base Sepolia (Testnet)
//   84532: {
//     AX_TOKEN:           '0xaEDc8fAcF794449a4B4Ea23281c21FB3Bac37819' as `0x${string}`,
//     STAKING:            '0xC72c2cbDC4209369bBE00a055c4BC0C26B4BE195' as `0x${string}`,
//     PAYMASTER:          '0x2238196266b1559Cba2E6A632E894B5E86B6743D' as `0x${string}`,
//     ACCOUNT_FACTORY:    '0x5986cC8b32498077d746fCc22251Aa464655Fc98' as `0x${string}`,
//     AGENT_ALPHA:        '0x868Bd96cd4c0daA06d5d3B12D8C029211958A96B' as `0x${string}`,
//     PROFIT_DISTRIBUTOR: '0x2a67648bE618108d9cE92089c903b3451FC5D74c' as `0x${string}`,
//     USDC:               '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}`,
//   },
//   // Base Mainnet
//   8453: {
//     AX_TOKEN:           (process.env.NEXT_PUBLIC_AX_TOKEN_8453             || '0x0000000000000000000000000000000000000000') as `0x${string}`,
//     STAKING:            (process.env.NEXT_PUBLIC_STAKING_8453              || '0x0000000000000000000000000000000000000000') as `0x${string}`,
//     PAYMASTER:          (process.env.NEXT_PUBLIC_PAYMASTER_8453            || '0x0000000000000000000000000000000000000000') as `0x${string}`,
//     ACCOUNT_FACTORY:    (process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_8453      || '0x0000000000000000000000000000000000000000') as `0x${string}`,
//     AGENT_ALPHA:        (process.env.NEXT_PUBLIC_AGENT_ALPHA_8453          || '0x0000000000000000000000000000000000000000') as `0x${string}`,
//     PROFIT_DISTRIBUTOR: (process.env.NEXT_PUBLIC_PROFIT_DISTRIBUTOR_8453   || '0x0000000000000000000000000000000000000000') as `0x${string}`,
//     USDC:               '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`, // Base Mainnet USDC
//   },
// } as const;

// export type SupportedChainId = keyof typeof CONTRACT_ADDRESSES;

// export function getContracts(chainId: number) {
//   const supported = [84532, 8453] as const;
//   const id = supported.find((c) => c === chainId) ?? 84532;
//   return CONTRACT_ADDRESSES[id];
// }

// // ─── ABIs ─────────────────────────────────────────────────────────────────────

// export const AX_TOKEN_ABI = [
//   { name: 'balanceOf',   type: 'function', stateMutability: 'view',
//     inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
//   { name: 'allowance',   type: 'function', stateMutability: 'view',
//     inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
//   { name: 'approve',     type: 'function', stateMutability: 'nonpayable',
//     inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
//   { name: 'decimals',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
//   { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
//   { name: 'Transfer',    type: 'event',
//     inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
// ] as const;

// export const STAKING_ABI = [
//   { name: 'stake',           type: 'function', stateMutability: 'nonpayable',
//     inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
//   { name: 'unstake',         type: 'function', stateMutability: 'nonpayable',
//     inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
//   { name: 'claimRewards',    type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
//   { name: 'getStakingInfo',  type: 'function', stateMutability: 'view',
//     inputs: [{ name: 'user', type: 'address' }],
//     outputs: [
//       { name: 'stakedAmount',    type: 'uint256' },
//       { name: 'tier',            type: 'uint8'   },
//       { name: 'pendingRewards',  type: 'uint256' },
//     ] },
//   { name: 'getTierThresholds', type: 'function', stateMutability: 'view', inputs: [],
//     outputs: [{ name: '', type: 'uint256[]' }] },
//   { name: 'Staked',   type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
//   { name: 'Unstaked', type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
// ] as const;

// export const PROFIT_DISTRIBUTOR_ABI = [
//   { name: 'deposit',      type: 'function', stateMutability: 'nonpayable',
//     inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
//   { name: 'withdraw',     type: 'function', stateMutability: 'nonpayable',
//     inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
//   { name: 'claimProfit',  type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
//   { name: 'getUserInfo',  type: 'function', stateMutability: 'view',
//     inputs: [{ name: 'user', type: 'address' }],
//     outputs: [
//       { name: 'deposited',      type: 'uint256' },
//       { name: 'claimableProfit', type: 'uint256' },
//       { name: 'totalClaimed',   type: 'uint256' },
//     ] },
//   { name: 'totalValueLocked',       type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
//   { name: 'totalProfitDistributed', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
//   { name: 'Deposited',    type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
//   { name: 'Withdrawn',    type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
//   { name: 'ProfitClaimed',type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }] },
// ] as const;

// export const AGENT_ALPHA_ABI = [
//   { name: 'activateForUser',   type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
//   { name: 'deactivateForUser', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
//   { name: 'isUserActive',      type: 'function', stateMutability: 'view',
//     inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
//   { name: 'isActive',          type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
//   { name: 'getTotalArbitrageProfit', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
//   { name: 'UserActivated',   type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }] },
//   { name: 'UserDeactivated', type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }] },
// ] as const;

// export const USDC_ABI = [
//   { name: 'balanceOf', type: 'function', stateMutability: 'view',
//     inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
//   { name: 'allowance', type: 'function', stateMutability: 'view',
//     inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
//   { name: 'approve',   type: 'function', stateMutability: 'nonpayable',
//     inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
//   { name: 'decimals',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
// ] as const;