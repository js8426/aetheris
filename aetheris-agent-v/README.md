# Aetheris\aetheris-agent-v\README.md

# Agent V — On-Chain Security Monitor

Agent V is the 24/7 security monitor for Aetheris Protocol. It watches every block on Base, reads all watched contract storage slots in a single batched RPC call, diffs the results against the previous block, classifies any changes as threats, and executes emergency on-chain responses automatically — all within a single block window.

---

## Threat Detection

| Threat | Severity | Trigger |
|---|---|---|
| Proxy implementation swap | CRITICAL | EIP-1967 impl slot changed |
| Proxy admin change | HIGH | EIP-1967 admin slot changed |
| Ownership transfer | HIGH | `owner()` slot changed from non-zero |
| Hidden function activation | MEDIUM | Pause / freeze / drain flag activated |
| Oracle manipulation precursor | MEDIUM / HIGH | Chainlink vs Pyth divergence > `ORACLE_DIVERGENCE_BPS` |

Oracle divergence escalates from MEDIUM to HIGH when it exceeds 2× the threshold.

---

## Emergency Response (Critical / High)

When a Critical or High threat is detected and the circuit breaker is not open, Agent V executes three on-chain calls in sequence, all signed by `BUNDLER_PRIVATE_KEY`:

1. `AgentBeta.emergencyReturn()` — pulls all idle USDC back to the guardian wallet
2. `AgentAlpha.pause()` — stops Alpha from firing new arbitrage trades
3. `AetherisVault.pause()` — stops vault deposits

Medium and Low threats trigger alerts only — no on-chain action.

---

## Circuit Breaker

If the RPC fails `CIRCUIT_BREAKER_THRESHOLD` consecutive blocks (default: 5), Agent V continues monitoring and alerting but stops executing on-chain responses. This prevents false-positive emergency responses caused by network outages.

---

## Architecture

```
aetheris-agent-v/
├── src/
│   ├── main.rs               Entry point, startup, daily summary scheduler
│   ├── lib.rs                Library root (exposes modules for tests)
│   ├── config.rs             Config loaded and validated from .env at startup
│   ├── alerts/
│   │   └── mod.rs            Telegram + Discord alert sender
│   ├── db/
│   │   └── mod.rs            SQLite: incidents, slot_snapshots, daily_summary
│   ├── detector/
│   │   ├── mod.rs            Threat classifier functions
│   │   └── threat.rs         ThreatLevel + ThreatReport types
│   ├── monitor/
│   │   ├── mod.rs            Main loop: newHeads → batch read → diff → classify → respond
│   │   ├── watchlist.rs      Builds the list of contracts and slots to watch
│   │   ├── proxy.rs          EIP-1967 slot change analysis
│   │   ├── ownership.rs      Owner / admin slot change analysis
│   │   ├── state.rs          In-memory slot snapshot and diff engine
│   │   └── oracle.rs         Chainlink vs Pyth price divergence checker
│   ├── responder/
│   │   ├── mod.rs            Routes threats to the correct response
│   │   └── emergency.rs      Executes on-chain emergency calls
│   └── rpc/
│       ├── mod.rs            Multi-RPC HTTP provider with failover
│       └── multicall.rs      JSON-RPC batch storage slot reads
├── tests/
│   ├── test_threat_classifier.rs
│   ├── test_slot_snapshot.rs
│   ├── test_multicall_utils.rs
│   ├── test_watchlist.rs
│   ├── test_db.rs
│   └── test_monitor_analysis.rs
├── .env.example
├── Cargo.toml
└── README.md
```

---

## Setup

### Prerequisites

- Rust 1.75+ — install from https://rustup.rs
- An Alchemy (or compatible) API key with WebSocket support on Base Sepolia
- `BUNDLER_PRIVATE_KEY` wallet funded with ~0.05 ETH on Base Sepolia

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
| `BUNDLER_PRIVATE_KEY` | Yes | Signs all emergency transactions |
| `AGENT_ALPHA_ADDR` | Yes | Deployed AgentAlpha contract address |
| `AGENT_BETA_ADDR` | Yes | Deployed AgentBeta contract address |
| `VAULT_ADDR` | Yes | Deployed AetherisVault contract address |
| `CHAINLINK_ETH_USD` | Yes | Chainlink ETH/USD feed on Base |
| `PYTH_CONTRACT` | Yes | Pyth contract on Base |
| `PYTH_ETH_USD_FEED_ID` | Yes | Pyth ETH/USD price feed ID |
| `TELEGRAM_BOT_TOKEN` | No | Telegram alerts |
| `TELEGRAM_CHAT_ID` | No | Telegram alerts |
| `DISCORD_WEBHOOK_URL` | No | Discord alerts |

### 2. Build

```powershell
cargo build --release
```

### 3. Run

```powershell
# Development (with logs)
$env:RUST_LOG="info"; cargo run

# Production binary
$env:RUST_LOG="info"; .\target\release\aetheris-agent-v
```

### 4. Run with PM2

```bash
pm2 start ./target/release/aetheris-agent-v --name agent-v
pm2 save
pm2 startup
```

---

## Running Tests

No live RPC or funded wallet required — all tests are fully isolated.

```powershell
# All tests
cargo test

# Individual test files
cargo test --test test_threat_classifier
cargo test --test test_slot_snapshot
cargo test --test test_multicall_utils
cargo test --test test_watchlist
cargo test --test test_db
cargo test --test test_monitor_analysis

# With log output
cargo test -- --nocapture
```

---

## Database

SQLite at `./data/agent_v.db` (configurable via `DB_PATH`).

| Table | Description |
|---|---|
| `incidents` | All detected threats with contract, slot, old/new values, and tx hashes |
| `slot_snapshots` | Latest known value per watched slot — seeds state on restart to prevent false positives |
| `daily_summary` | Per-day stats: blocks monitored, threats detected, RPC failures |

---

## Performance

- All slot reads batched in a single JSON-RPC batch call — never individual `eth_getStorageAt`
- WebSocket `newHeads` subscription — no polling, zero latency overhead
- Sub-100ms per block target on Base (~2s block time gives ample headroom)
