# Aetheris\agent_gas\README.md

# Agent Gas — ERC-4337 Bundler + Paymaster

Agent Gas is the ERC-4337 bundler and paymaster service for Aetheris Protocol. It enables gasless interactions with Aetheris contracts — users sign UserOperations and Agent Gas handles everything else: validation, sponsorship, batching, and submission to the EntryPoint.

---

## What It Does

**Bundler** — Receives UserOperations, validates them via `simulateValidation`, batches up to `MAX_BUNDLE_SIZE` ops together, and submits to `EntryPoint.handleOps()`. The bundler wallet fronts the gas and is reimbursed by the EntryPoint.

**Paymaster** — Decides which UserOperations to sponsor based on target contract and function selector. Generates signed `paymasterAndData` for approved ops. `AetherisPaymaster.sol` verifies the signature on-chain before covering the gas.

---

## Sponsored Operations (Phase 1)

| Function | Selector | Contract |
|---|---|---|
| `deposit(uint256)` | `0x47e7ef24` | AetherisVault |
| `withdraw(uint256)` | `0x2e1a7d4d` | AetherisVault |
| `redeem(uint256)` | `0xdb006a75` | AetherisVault |
| `stake(uint256)` | `0xa694fc3a` | AetherisStaking |
| `unstake(uint256)` | `0x2def6620` | AetherisStaking |
| `claimRewards()` | `0x372500ab` | AetherisStaking |

Maximum sponsored gas per UserOperation: **$5.00 USDC** (configurable via `MAX_SPONSORED_GAS_USDC`).

All other targets and selectors are rejected.

---

## API Endpoints

### Bundler RPC — `POST /rpc`

| Method | Description |
|---|---|
| `eth_sendUserOperation` | Submit a UserOperation to the mempool |
| `eth_getUserOperationByHash` | Look up a UserOp by hash |
| `eth_getUserOperationReceipt` | Get the on-chain receipt for a confirmed UserOp |
| `eth_supportedEntryPoints` | Returns the supported EntryPoint address |

### Paymaster RPC — `POST /paymaster`

| Method | Description |
|---|---|
| `pm_sponsorUserOperation` | Request sponsorship — returns signed `paymasterAndData` |

### Health — `GET /health`

```json
{
  "status": "ok",
  "mempoolSize": 2,
  "todayStats": {
    "opsReceived": 24,
    "opsSponsored": 22,
    "opsBundled": 24,
    "opsFailed": 0,
    "totalUsdcFees": 90000,
    "bundlesSubmitted": 6
  }
}
```

---

## Architecture

```
agent_gas/
├── src/
│   ├── index.ts              Entry point, Express server, bundler loop
│   ├── config.ts             Typed config loaded and validated from .env
│   ├── bundler/
│   │   ├── index.ts          Bundler loop: runs every BUNDLE_INTERVAL_MS
│   │   ├── mempool.ts        In-memory UserOperation pool
│   │   ├── validator.ts      simulateValidation wrapper
│   │   ├── submitter.ts      EntryPoint.handleOps() transaction submitter
│   │   └── rpc.ts            ERC-4337 JSON-RPC endpoint handlers
│   ├── paymaster/
│   │   ├── index.ts          Exports
│   │   ├── policy.ts         Sponsorship policy (whitelist check + gas cap)
│   │   ├── signer.ts         Signs paymasterAndData (address + timestamps + ECDSA)
│   │   └── rpc.ts            pm_sponsorUserOperation endpoint handler
│   ├── accounts/
│   │   └── factory.ts        Counterfactual address computation, initCode builder
│   ├── gas/
│   │   ├── estimator.ts      UserOp gas limit estimation with overhead buffer
│   │   └── pricer.ts         Base L2 gas price fetcher
│   ├── db/
│   │   └── index.ts          SQLite with better-sqlite3
│   └── alerts/
│       └── index.ts          Telegram + Discord alert sender
├── tests/
│   ├── config.test.ts
│   ├── db.test.ts
│   ├── mempool.test.ts
│   ├── policy.test.ts
│   ├── signer.test.ts
│   ├── estimator.test.ts
│   └── factory.test.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Setup

### Prerequisites

- Node.js 20+
- Two wallets on Base Sepolia:
  - **Bundler wallet** (`BUNDLER_PRIVATE_KEY`) — needs ~0.1 ETH to submit bundles. Reimbursed by EntryPoint over time.
  - **Paymaster signer** (`PAYMASTER_SIGNER_KEY`) — signs `paymasterAndData` off-chain. No ETH needed.
- `AetherisPaymaster.sol` deployed with the paymaster signer registered

### 1. Configure environment

```powershell
copy .env.example .env
```

Fill in `.env`:

| Variable | Required | Description |
|---|---|---|
| `BASE_SEPOLIA_RPC_URL` | Yes | Alchemy HTTP URL (Sepolia) |
| `BASE_SEPOLIA_WS_URL` | Yes | Alchemy WebSocket URL (Sepolia) |
| `BASE_MAINNET_RPC_URL` | Mainnet only | Alchemy HTTP URL (Mainnet) |
| `BASE_MAINNET_WS_URL` | Mainnet only | Alchemy WebSocket URL (Mainnet) |
| `QUICKNODE_SEPOLIA_RPC_URL` | No | Optional QuickNode failover |
| `CHAIN_ID` | Yes | `84532` = Sepolia, `8453` = Mainnet |
| `BUNDLER_PRIVATE_KEY` | Yes | Submits bundle transactions, needs ETH |
| `PAYMASTER_SIGNER_KEY` | Yes | Signs paymasterAndData, no ETH needed |
| `PAYMASTER_ADDR` | Yes | Deployed AetherisPaymaster.sol address |
| `ACCOUNT_FACTORY_ADDR` | Yes | Deployed AetherisAccountFactory.sol address |
| `VAULT_ADDR` | Yes | Deployed AetherisVault.sol address |
| `STAKING_ADDR` | Yes | Deployed AetherisStaking.sol address |
| `TELEGRAM_BOT_TOKEN` | No | Telegram alerts |
| `TELEGRAM_CHAT_ID` | No | Telegram alerts |
| `DISCORD_WEBHOOK_URL` | No | Discord alerts |

### 2. Register paymaster signer (one-time)

Before starting, register the signer in `AetherisPaymaster.sol`:

```typescript
await paymaster.addSigner(config.paymasterSignerAddress);
```

### 3. Install and build

```powershell
npm install
npm run build
```

### 4. Run

```powershell
# Development (no build step)
npx ts-node src/index.ts

# Production
npm start
```

### 5. Run with PM2

```bash
pm2 start dist/index.js --name agent-gas
pm2 save
pm2 startup
```

---

## Running Tests

No live RPC or funded wallet required — viem is mocked and SQLite uses temp files.

```powershell
# All tests
npm test

# Single file
npx jest tests/mempool.test.ts
npx jest tests/policy.test.ts

# Watch mode
npx jest --watch

# With coverage
npm run test:coverage
```

---

## Database

SQLite at `./data/agent_gas.db` (configurable via `DB_PATH`).

| Table | Description |
|---|---|
| `user_operations` | Full UserOp lifecycle: pending → bundled → confirmed / failed |
| `bundles` | Each submitted `handleOps()` transaction |
| `daily_stats` | Per-day counters: ops received, sponsored, bundled, failed, fees |

---

## Frontend Integration

```typescript
// 1. Request sponsorship
const { result } = await fetch('http://localhost:3000/paymaster', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'pm_sponsorUserOperation',
    params: [userOp, entryPointAddr],
    id: 1,
  }),
}).then(r => r.json());

userOp.paymasterAndData = result.paymasterAndData;

// 2. Submit the sponsored UserOp
const { result: userOpHash } = await fetch('http://localhost:3000/rpc', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_sendUserOperation',
    params: [userOp, entryPointAddr],
    id: 2,
  }),
}).then(r => r.json());
```
