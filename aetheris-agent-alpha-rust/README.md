# Aetheris Agent-V — Rust Phase 3

High-performance DeFi arbitrage bot for Base L2.  
Target scan time: **<20ms** (Python Phase 2: ~300ms).

## Architecture

```
main.rs               Entry point, task orchestration, main scan loop
config.rs             All addresses, constants, CLI args
math/uniswap_v3.rs    LOCAL UniV3 price math — zero RPC per scan (Step 2)
math/aerodrome.rs     LOCAL Aerodrome CFAMM math
rpc/multicall.rs      Multicall3 batch pool-state fetching (Step 3)
rpc/pool.rs           Multi-RPC failover pool (U4)
ws.rs                 WebSocket block subscriber (U1, Step 4)
arb/routes.rs         Route definitions + dynamic scoring (U6)
arb/detector.rs       Arbitrage scanner + golden-section optimizer (U2, Step 5)
tx/mod.rs             Transaction builder + JIT simulation (U7) + gas ladder (U8, Step 6)
db/mod.rs             SQLite logging, identical schema to Python Phase 2 (Step 7)
volatility.rs         Rolling std-dev volatility mode switcher (U5)
circuit_breaker.rs    Consecutive-failure circuit breaker
alerts.rs             Telegram + Discord alerting
```

## Step 1 — Install Rust and build

### Windows

```powershell
# 1. Install Rust (if not already installed)
winget install Rustlang.Rust.MSVC
# OR download from https://rustup.rs — run rustup-init.exe

# 2. Verify
rustc --version   # should print 1.78+
cargo --version

# 3. Clone / copy this project to your machine, then:
cd aetheris-agent-alpha-rust
copy .env.example .env
# Edit .env — add your PRIVATE_KEY

# 4. Build (dev, fast compile)
cargo build

# 5. Test the math with no network needed
cargo test

# 6. Run in simulate mode against Base Sepolia
cargo run -- --mode simulate
```

### Linux VPS (production)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Build release binary (full LTO, ~30s)
cargo build --release

# Run
./target/release/aetheris-agent-alpha-rust --mode simulate
./target/release/aetheris-agent-alpha-rust --mode live --min-profit 2.0
```

## CLI reference

```
--mode simulate|live          Default: simulate
--min-profit <USDC>           Min net profit per trade (default: 1.0)
--max-trade-size <USD>        Max flash loan size (default: 100000)
--min-trade-size <USD>        Min flash loan size (default: 1000)
--db <PATH>                   SQLite path (default: agent.db)
--interval <SECONDS>          Fallback poll interval if no WS (default: 2)
```

Environment variable `MIN_PROFIT_USDC` overrides `--min-profit` default.

## Performance targets

| Metric               | Python Phase 2 | Rust Phase 3 (target) |
|----------------------|----------------|----------------------|
| Scan time            | ~300ms         | <20ms                |
| RPC calls per scan   | ~24            | 1 (Multicall3)       |
| Block reaction time  | ~2s (polling)  | <50ms (WS)           |
| Memory per scan      | heap alloc     | stack-only math      |

## Known configuration items to verify

1. **Uniswap V3 Factory** (`UNISWAP_V3_FACTORY` in config.rs)  
   Default is `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` (Base Sepolia).  
   Verify at https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments

2. **Aerodrome Factory** (`AERODROME_FACTORY` in config.rs)  
   Default is `0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A`.  
   Verify at https://aerodrome.finance/docs

3. **Multicall3** is `0xcA11bde05977b3631167028862bE2a173976CA11` on every EVM chain — no change needed.

4. Run `cargo test` before any live trading. All math unit tests must pass.

## Dependency on alloy

This project uses [alloy](https://github.com/alloy-rs/alloy) — the successor to
ethers-rs. It provides:
- `sol!` macro for zero-cost ABI encoding/decoding
- Async HTTP + WebSocket providers
- EIP-1559 transaction signing

If you see compile errors after `cargo update`, pin alloy to a specific version
in Cargo.toml: `alloy = { version = "=0.9.x", ... }`.

## Step 8 — Testing checklist

```
[ ] cargo test              — all unit tests pass (math, slippage, routes)
[ ] simulate mode 24h       — opportunities detected and logged to agent.db
[ ] verify agent.db schema  — matches Python Phase 2 DB exactly
[ ] check scan_duration_ms  — should be <20ms consistently
[ ] live mode small trade   — send one live tx on Base Sepolia, confirm receipt
[ ] circuit breaker test    — kill RPC, verify bot pauses and recovers
```
