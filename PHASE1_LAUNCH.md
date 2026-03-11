# Aetheris Protocol — Phase 1 Mainnet Launch Guide
# Aetheris\PHASE1_LAUNCH.md

This guide walks you through every step to deploy Aetheris Protocol on Base
mainnet and run Agent Alpha, Agent Beta, Agent V, and Agent Gas with $100 USDC
for 30 days of real data collection. Nothing is skipped. Follow in order.

---

## OVERVIEW OF WHAT YOU ARE DOING

```
Your laptop                   Base Mainnet                  AWS EC2 (VPS)
──────────────                ─────────────────             ─────────────────
Hardhat deploy ──────────────▶ AgentAlpha.sol               aetheris-agent-alpha-rust
scripts                        AgentBeta.sol                 (Rust bot, runs 24/7)
                               ProfitDistributor.sol              │
                               AetherisVault.sol                  │
                               AetherisStaking.sol                │
                               AetherisToken.sol                  │
                               AetherisPaymaster.sol         aetheris-agent-v
                               AetherisAccountFactory.sol    (Rust security monitor)
                                       │                          │  watches every block
                               executeArbitrage() ◀──────────────┘  alerts + pauses
                                       │
                               $100 USDC capital ──▶ AgentBeta ──▶ Synthetix
                                                          │
                                                     agent_gas
                                                   (Node.js bundler)
                                                  gasless UserOps
```

**Agent Alpha** — Rust bot on EC2 watches Base for arbitrage, calls
AgentAlpha.sol which does the flash loan and swap. Never touches your $100.
It only needs ETH for gas.

**Agent Beta** — Python bot on EC2 opens Synthetix funding rate positions.
Your $100 USDC is the actual capital it uses. Starts with $100 and returns
principal + profit after each position closes.

**Agent V** — Rust security monitor on EC2. Watches every contract at the
storage slot level every block. Detects proxy swaps, ownership transfers,
and oracle manipulation. Executes emergency pause if a threat is detected.

**Agent Gas** — Node.js ERC-4337 bundler and paymaster on EC2. Lets users
interact with Aetheris contracts without holding ETH — gas is covered by
the paymaster and deducted in USDC.

**Vault** — Deployed but `depositsEnabled = false`. No public deposits.
Exists so you can test the full contract stack. AgentBeta's capital comes
from you directly for Phase 1, not from vault depositors.

## Q&A
### 1. Does that mean Agent Alpha money come from the Vault?
No — Agent Alpha never needs money from anyone, ever. Not from you, not from the 
vault, not from depositors.
Here's the clean picture:
Agent Alpha uses Aave flash loans. The flow is:
  Borrow USDC from Aave atomically
  Swap across DEXes for profit
  Repay Aave + fee
  Keep the difference as profit

All of that happens inside a single transaction. It starts and ends with zero capital. 
The only thing it needs is ETH in the executor wallet to pay for gas. That's it.

### 2. Does that mean Agent Beta money come from the Flash loan?
Agent Beta
Holds open Synthetix perpetual positions for hours at a time. You cannot flash loan 
capital for that — the position needs to stay open. So Beta genuinely needs real USDC 
sitting in the contract as margin.
  Phase 1: That $100 comes from your own wallet directly
  Phase 2: That capital comes from vault depositors via allocateToAgent()

### 3. What is the vault's relationship with each agent
            Agent Alpha               Agent Beta
Phase 1     No connection at all      You fund it directly ($100)
Phase 2     Still no connection       Vault allocates depositor capital

### 4. For Phase 1 Mainnet Launch, are we going to put USDC on the vault for Agent Beta?
No. The vault sits completely idle in Phase 1.
depositsEnabled = false at deployment — nothing goes in, nothing comes out. You deploy it, 
verify it compiles and deploys correctly, and then leave it alone.

What actually holds USDC in Phase 1:
Contract              USDC                              Why
AgentBeta.sol         $100 (from your wallet)           Needs capital for Synthetix positions
AgentAlpha.sol        $0                                Flash loans only
AetherisVault.sol     $0                                Disabled — Phase 1 gate

The only reason you deploy the vault in Phase 1 at all is so it exists on-chain, can be audited, 
and is ready to flip on for Phase 2 without a redeployment. It's not doing anything functional yet.
So from the Phase 1 launch guide, you can skip everything that involves the vault — deployment 
included — if you want to keep Phase 1 even simpler. 

### 5. If in future agent Beta is going to use vault, then why not use USDC from vault now itself?
The honest answer is — you could. The architecture supports it right now. But there are two solid 
reasons not to:
  Reason 1 — The vault is unaudited
    Putting real USDC through an unaudited vault contract adds a second point of failure. 
    If there's a bug in the vault's allocateToAgent(), deposit(), or NAV accounting, you could lose 
    access to the capital entirely — not because Beta failed, but because the vault contract failed. 
    In Phase 1 you are testing whether the agents are profitable, not whether the vault works. 
    Keep those two tests separate.
  Reason 2 — More contracts in the flow = harder to isolate problems
    If something goes wrong in Phase 1, you want to know exactly where it broke:
      Direct path:   Your wallet → AgentBeta → Synthetix
      Vault path:    Your wallet → Vault → AgentBeta → Synthetix
    With the direct path, if Beta loses money you know Beta is the problem. 
    With the vault path, if something goes wrong you have to debug whether it was the vault, Beta, 
    or the interaction between them.

### 6. What does Agent V actually do in Phase 1?
Agent V watches every deployed contract at the storage slot level. If anything
changes unexpectedly — a proxy implementation gets swapped, ownership is transferred,
or Chainlink and Pyth diverge by more than 5% — Agent V fires an alert and
automatically calls pause() on Alpha, emergencyReturn() on Beta, and pause() on
the Vault. Think of it as the circuit breaker for the whole system.
In Phase 1 it runs in monitoring-only mode for the first week so you can confirm
it is reading the right slots before enabling auto-response.

### 7. What does Agent Gas do in Phase 1?
Agent Gas runs as an ERC-4337 bundler and paymaster. Users can interact with
AetherisVault and AetherisStaking without holding any ETH — Agent Gas covers
the gas and deducts the cost in USDC. In Phase 1 it runs on Base Sepolia first,
then mainnet once you confirm the paymaster signer is correctly registered.

---

## PART 1 — PREREQUISITES (do this first, before anything else)

### 1.1 Software on your laptop

Open a terminal and check each one exists:

```bash
node --version      # Need v18 or higher
npm --version       # Need v9 or higher
git --version       # Any version fine
python3 --version   # Need 3.10 or higher (for Agent Beta)
rustc --version     # Need 1.75 or higher (for Agent Alpha and Agent V)
```

If any are missing:
- Node.js: https://nodejs.org → download LTS
- Rust: run `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Python: https://python.org/downloads

### 1.2 Hardhat project dependencies

In your `aetheris-protocol` folder:

```bash
cd aetheris-protocol
npm install
```

If you get errors:
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npm install @openzeppelin/contracts
```

### 1.3 Install the Base network in MetaMask

Open MetaMask → Settings → Networks → Add Network → Add manually:

```
Network Name:    Base
RPC URL:         https://mainnet.base.org
Chain ID:        8453
Currency Symbol: ETH
Block Explorer:  https://basescan.org
```

---

## PART 2 — WALLETS

You need exactly FOUR wallets. All can be MetaMask wallets. Write down
every private key and seed phrase in a secure place (password manager or
hardware wallet) before proceeding.

### Wallet 1 — Deployer Wallet
**Purpose:** Deploys all contracts. Pays gas for deployment.
**Needs:** ~0.05 ETH on Base mainnet for deployment gas.
**After deployment:** Transfer DEFAULT_ADMIN_ROLE to governance (later).
**For Phase 1:** This wallet IS governance — fine for testing.

### Wallet 2 — Executor Wallet (BUNDLER_PRIVATE_KEY)
**Purpose:** The wallet the Rust bot, Python bot, and Agent V use to sign
transactions. Also used by Agent Gas as the bundler wallet.
**Needs:** ~0.1 ETH on Base mainnet for ongoing gas.
**Critical:** This private key goes into the `.env` file on your EC2 server.
Use a fresh wallet with ONLY enough ETH for gas — never your main wallet.

### Wallet 3 — Paymaster Signer Wallet (PAYMASTER_SIGNER_KEY)
**Purpose:** Signs `paymasterAndData` for Agent Gas sponsored UserOperations.
`AetherisPaymaster.sol` verifies this signature on-chain.
**Needs:** No ETH required — signs off-chain only.
**Critical:** Must be registered in `AetherisPaymaster.sol` via `addSigner()`
before Agent Gas can sponsor any UserOperation.

### Wallet 4 — Guardian Wallet
**Purpose:** Emergency pause, emergency capital recall.
**For Phase 1:** Can be same as Deployer wallet to keep things simple.

### Getting ETH on Base mainnet

You need ETH on Base — not Ethereum mainnet ETH, specifically Base ETH.

**Option A — Bridge from Ethereum:**
Go to https://bridge.base.org → Connect MetaMask → Bridge ETH from
Ethereum mainnet to Base. Costs ~$5-10 in Ethereum gas.

**Option B — Buy directly on Coinbase:**
Coinbase lets you withdraw ETH directly to Base network.
Buy $20 of ETH → Withdraw → Choose Base network → Your wallet address.

Send to both Deployer wallet and Executor wallet:
- Deployer: 0.05 ETH (~$150 at current prices — enough for all deployments)
- Executor: 0.1 ETH (~$300 — enough for weeks of transactions across all four agents)

### Getting USDC on Base mainnet

You need $100 USDC on Base mainnet in your Deployer wallet.

**Option A — Coinbase:**
Buy USDC on Coinbase → Withdraw → Network: Base → Your Deployer wallet.
Coinbase supports direct Base withdrawals for USDC with zero bridge fees.

**Option B — Bridge:**
If you have USDC on another chain, use https://bridge.base.org or
https://app.across.to to bridge to Base.

**Confirm:** After funding, check https://basescan.org and search your
deployer wallet address. You should see ETH balance and USDC token balance.

Base mainnet USDC contract address (for reference):
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

---

## PART 3 — CONFIGURE HARDHAT FOR BASE MAINNET

### 3.1 Create your .env file

In your `aetheris-protocol` folder, create a file called `.env`:

```
DEPLOYER_PRIVATE_KEY=0x_your_deployer_wallet_private_key_here
EXECUTOR_PRIVATE_KEY=0x_your_executor_wallet_private_key_here
BASESCAN_API_KEY=your_basescan_api_key_here
```

**How to get your private key from MetaMask:**
MetaMask → Click account → Three dots → Account Details → Show private key
→ Enter password → Copy the key → Paste into .env

**How to get a Basescan API key:**
Go to https://basescan.org → Register free account → API Keys → Create new key
This is needed to verify contracts (makes them readable on Basescan).

**CRITICAL: Add .env to .gitignore right now:**
```bash
echo ".env" >> .gitignore
```
Never commit your private key to git. Ever.

### 3.2 Update hardhat.config.ts

Open `hardhat.config.ts` and make sure it contains:

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    base: {
      url: "https://mainnet.base.org",
      chainId: 8453,
      accounts: [
        process.env.DEPLOYER_PRIVATE_KEY!,
        process.env.EXECUTOR_PRIVATE_KEY!,
      ],
    },
    // Keep your existing testnet config below this
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY!,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
};

export default config;
```

### 3.3 Test the connection

```bash
npx hardhat console --network base
```

Inside the console, type:
```javascript
const [deployer] = await ethers.getSigners();
console.log(deployer.address);
// Should print your deployer wallet address

const balance = await ethers.provider.getBalance(deployer.address);
console.log(ethers.formatEther(balance));
// Should print your ETH balance (e.g. 0.05)
```

Press Ctrl+C to exit. If this works, your Hardhat is connected to Base mainnet.

---

## PART 4 — DEPLOY CONTRACTS

Deploy in this exact order. Each contract needs the address of the previous one.

Keep a notepad open and write down every address as you deploy.

### Base Mainnet Contract Addresses You Will Need

These already exist on Base — you do not deploy these:

```
USDC:              0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
Aave Pool (v3):    0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
Aave PoolAddrProv: 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64B
Uniswap V3 Router: 0x2626664c2603336E57B271c5C0b26F421741e481
Aerodrome Router:  0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
Multicall3:        0xcA11bde05977b3631167028862bE2a173976CA11
EntryPoint v0.6:   0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
Chainlink ETH/USD: 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
Pyth:              0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
```

### Step 4.1 — Deploy AetherisToken

Create file `scripts/deploy/01_deployToken.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Token = await ethers.getContractFactory("AetherisToken");
  const token = await Token.deploy();
  await token.waitForDeployment();

  const addr = await token.getAddress();
  console.log("AetherisToken deployed:", addr);
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/01_deployToken.ts --network base
```

**Write down:** `AX_TOKEN = 0x...` (the address printed)

Verify on Basescan (makes it readable):
```bash
npx hardhat verify --network base <AX_TOKEN_ADDRESS>
```

### Step 4.2 — Deploy ProfitDistributor

Create file `scripts/deploy/02_deployProfitDistributor.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const USDC    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const AX      = "PASTE_AX_TOKEN_ADDRESS_HERE";

  const PD = await ethers.getContractFactory("ProfitDistributor");
  const pd = await PD.deploy(USDC, AX);
  await pd.waitForDeployment();

  console.log("ProfitDistributor deployed:", await pd.getAddress());
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/02_deployProfitDistributor.ts --network base
```

**Write down:** `PROFIT_DISTRIBUTOR = 0x...`

Verify:
```bash
npx hardhat verify --network base <PROFIT_DISTRIBUTOR_ADDRESS> \
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" "<AX_TOKEN_ADDRESS>"
```

### Step 4.3 — Deploy AgentAlpha

Create file `scripts/deploy/03_deployAgentAlpha.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  // Fill these in from your notepad
  const USDC               = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const AAVE_POOL          = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  const PROFIT_DISTRIBUTOR = "PASTE_PROFIT_DISTRIBUTOR_ADDRESS_HERE";

  const Alpha = await ethers.getContractFactory("AgentAlpha");
  const alpha = await Alpha.deploy(USDC, AAVE_POOL, PROFIT_DISTRIBUTOR);
  await alpha.waitForDeployment();

  const addr = await alpha.getAddress();
  console.log("AgentAlpha deployed:", addr);

  // Grant EXECUTOR_ROLE to your executor wallet
  const EXECUTOR_WALLET = "PASTE_EXECUTOR_WALLET_ADDRESS_HERE";
  const EXECUTOR_ROLE   = await alpha.EXECUTOR_ROLE();
  await alpha.grantRole(EXECUTOR_ROLE, EXECUTOR_WALLET);
  console.log("EXECUTOR_ROLE granted to:", EXECUTOR_WALLET);
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/03_deployAgentAlpha.ts --network base
```

**Write down:** `AGENT_ALPHA = 0x...`

### Step 4.4 — Deploy AgentBeta

Create file `scripts/deploy/04_deployAgentBeta.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const USDC               = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const PROFIT_DISTRIBUTOR = "PASTE_PROFIT_DISTRIBUTOR_ADDRESS_HERE";
  const GUARDIAN           = deployer.address; // Your deployer = guardian for Phase 1

  const Beta = await ethers.getContractFactory("AgentBeta");
  const beta = await Beta.deploy(USDC, PROFIT_DISTRIBUTOR, GUARDIAN);
  await beta.waitForDeployment();

  const addr = await beta.getAddress();
  console.log("AgentBeta deployed:", addr);

  // Grant EXECUTOR_ROLE to your executor wallet
  const EXECUTOR_WALLET = "PASTE_EXECUTOR_WALLET_ADDRESS_HERE";
  const EXECUTOR_ROLE   = await beta.EXECUTOR_ROLE();
  await beta.grantRole(EXECUTOR_ROLE, EXECUTOR_WALLET);
  console.log("EXECUTOR_ROLE granted to:", EXECUTOR_WALLET);
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/04_deployAgentBeta.ts --network base
```

**Write down:** `AGENT_BETA = 0x...`

### Step 4.5 — Deploy AetherisStaking

Create file `scripts/deploy/05_deployStaking.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const AX   = "PASTE_AX_TOKEN_ADDRESS_HERE";
  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  const Staking = await ethers.getContractFactory("AetherisStaking");
  const staking = await Staking.deploy(AX, USDC);
  await staking.waitForDeployment();

  console.log("AetherisStaking deployed:", await staking.getAddress());
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/05_deployStaking.ts --network base
```

**Write down:** `STAKING = 0x...`

### Step 4.6 — Deploy AetherisVault

Create file `scripts/deploy/06_deployVault.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const USDC         = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const GUARDIAN     = deployer.address;  // You are guardian for Phase 1
  const GOVERNANCE   = deployer.address;  // You are governance for Phase 1
  const FEE_RECIPIENT = deployer.address; // Your wallet receives fees for now

  const Vault = await ethers.getContractFactory("AetherisVault");
  const vault = await Vault.deploy(USDC, GUARDIAN, GOVERNANCE, FEE_RECIPIENT);
  await vault.waitForDeployment();

  const addr = await vault.getAddress();
  console.log("AetherisVault deployed:", addr);

  // Confirm depositsEnabled is false (it should be by default)
  const enabled = await vault.depositsEnabled();
  console.log("depositsEnabled:", enabled); // Should print: false
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/06_deployVault.ts --network base
```

**Write down:** `VAULT = 0x...`

### Step 4.7 — Deploy AetherisPaymaster

This contract is required by Agent Gas. It verifies the paymaster signer's
signature on-chain before sponsoring any UserOperation.

Create file `scripts/deploy/07_deployPaymaster.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  const Paymaster = await ethers.getContractFactory("AetherisPaymaster");
  const paymaster = await Paymaster.deploy(ENTRY_POINT);
  await paymaster.waitForDeployment();

  const addr = await paymaster.getAddress();
  console.log("AetherisPaymaster deployed:", addr);

  // Register your paymaster signer wallet
  // This is PAYMASTER_SIGNER_KEY from Part 2 — the address, not the private key
  const PAYMASTER_SIGNER_ADDR = "PASTE_PAYMASTER_SIGNER_WALLET_ADDRESS_HERE";
  await paymaster.addSigner(PAYMASTER_SIGNER_ADDR);
  console.log("Paymaster signer registered:", PAYMASTER_SIGNER_ADDR);

  // Deposit ETH into EntryPoint so the paymaster can cover gas
  // 0.05 ETH is enough for Phase 1 (EntryPoint reimburses from this deposit)
  await paymaster.deposit({ value: ethers.parseEther("0.05") });
  console.log("Deposited 0.05 ETH into EntryPoint for paymaster");
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/07_deployPaymaster.ts --network base
```

**Write down:** `PAYMASTER = 0x...`

Verify:
```bash
npx hardhat verify --network base <PAYMASTER_ADDRESS> \
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
```

### Step 4.8 — Deploy AetherisAccountFactory

This contract computes counterfactual smart account addresses and deploys
ERC-4337 smart accounts on first use.

Create file `scripts/deploy/08_deployAccountFactory.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  const Factory = await ethers.getContractFactory("AetherisAccountFactory");
  const factory = await Factory.deploy(ENTRY_POINT);
  await factory.waitForDeployment();

  const addr = await factory.getAddress();
  console.log("AetherisAccountFactory deployed:", addr);
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/deploy/08_deployAccountFactory.ts --network base
```

**Write down:** `ACCOUNT_FACTORY = 0x...`

Verify:
```bash
npx hardhat verify --network base <ACCOUNT_FACTORY_ADDRESS> \
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
```

### Step 4.9 — Your master address list

By now your notepad should look like this:

```
DEPLOYED CONTRACTS — BASE MAINNET — [date]

AX_TOKEN:           0x...
PROFIT_DISTRIBUTOR: 0x...
AGENT_ALPHA:        0x...
AGENT_BETA:         0x...
STAKING:            0x...
VAULT:              0x...
PAYMASTER:          0x...
ACCOUNT_FACTORY:    0x...

WALLETS:
DEPLOYER:           0x...
EXECUTOR:           0x...   ← this is BUNDLER_PRIVATE_KEY in agent .env files
PAYMASTER_SIGNER:   0x...   ← this is PAYMASTER_SIGNER_KEY in agent_gas .env
GUARDIAN:           0x...   ← same as DEPLOYER for Phase 1

EXTERNAL (pre-existing):
USDC:               0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
AAVE_POOL:          0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
ENTRY_POINT:        0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
MULTICALL3:         0xcA11bde05977b3631167028862bE2a173976CA11
CHAINLINK_ETH_USD:  0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
PYTH:               0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
```

Save this somewhere permanent. You will need these addresses constantly.

---

## Q&A
### 1. Why Agent alpha and agent Beta was their correcponding smart contract 
### but agent gas and agent v do not?
Agent Alpha and Agent Beta need their own contracts because they touch money.
  AgentAlpha.sol holds the flash loan atomically, executes swaps, and sends 
  profit — all in one transaction. The Aave flash loan callback requires a 
  contract address to call back into. You literally cannot do a flash loan 
  without a contract.
  AgentBeta.sol holds $100 USDC as margin. Synthetix needs a contract counterparty 
  to open a perpetual position against.
  In both cases, the money lives in the contract. The bot just tells it when to act.

Agent V and Agent Gas don't need their own contracts because they don't hold money.
  Agent V only reads storage slots and calls functions that already exist on other 
  contracts (pause(), emergencyReturn()). Those functions are already on AgentAlpha.sol 
  and AgentBeta.sol. There's nothing new that needs to live on-chain.
  Agent Gas uses AetherisPaymaster.sol and AetherisAccountFactory.sol as its on-chain 
  layer — but those are ERC-4337 standard infrastructure, not an "AgentGas.sol". 
  The bundler itself is pure off-chain logic: validate, batch, submit.

## PART 5 — FUND THE AGENTS

### 5.1 Fund Agent Alpha (ETH for gas only)

Agent Alpha uses Aave flash loans — it never needs your USDC. It only needs
ETH in the EXECUTOR wallet to pay for gas on each trade. You already sent
0.1 ETH to the executor wallet in Part 2. That's enough.

**No USDC needed for Agent Alpha.**

### 5.2 Fund Agent Beta ($100 USDC)

Agent Beta needs actual USDC capital to open Synthetix positions.
For Phase 1, you send USDC directly to the AgentBeta contract.

In your terminal:
```bash
npx hardhat console --network base
```

Inside the console:
```javascript
const usdc  = await ethers.getContractAt(
  "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
);
const beta  = await ethers.getContractAt("AgentBeta", "PASTE_AGENT_BETA_ADDRESS");

// Approve AgentBeta to take 100 USDC from your deployer wallet
// 100 USDC = 100_000_000 (USDC has 6 decimals)
await usdc.approve(beta.target, 100_000_000n);

// Call allocateCapital — this moves 100 USDC from your wallet to AgentBeta
// Note: For Phase 1 you are calling this directly as admin, not through the vault
await usdc.transfer(beta.target, 100_000_000n);

// Confirm AgentBeta received it
const balance = await usdc.balanceOf(beta.target);
console.log("AgentBeta USDC balance:", Number(balance) / 1e6);
// Should print: 100
```

Press Ctrl+C to exit.

### 5.3 Fund Agent Gas paymaster (ETH for gas coverage)

You already deposited 0.05 ETH into the EntryPoint for the paymaster in
Step 4.7. That is enough for Phase 1. Monitor the balance on Basescan
and top up via the paymaster's `deposit()` function when it drops below 0.01 ETH.

To check the current deposit balance at any time:
```bash
npx hardhat console --network base
```
```javascript
const entryPoint = await ethers.getContractAt(
  ["function balanceOf(address) view returns (uint256)"],
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
);
const paymaster = "PASTE_PAYMASTER_ADDRESS_HERE";
const balance = await entryPoint.balanceOf(paymaster);
console.log("Paymaster deposit:", ethers.formatEther(balance), "ETH");
```

---

## PART 6 — SET UP THE EC2 SERVER (VPS)

This is where all four bots will run 24/7.

### 6.1 Create an AWS account

Go to https://aws.amazon.com → Create account.
You will need a credit card. The server costs ~$15-20/month.

### 6.2 Launch an EC2 instance

1. Log into AWS → Go to EC2 → Click "Launch Instance"
2. Fill in:
   - **Name:** aetheris-phase1
   - **AMI (operating system):** Ubuntu Server 24.04 LTS (free tier eligible)
   - **Instance type:** t3.small (enough for all four bots, ~$15/month)
   - **Key pair:** Click "Create new key pair" → Name it `aetheris-key` →
     Download the `.pem` file → Save it somewhere safe on your laptop
   - **Network settings:** Allow SSH traffic from "My IP" only
   - **Storage:** 20 GB (default is fine)
3. Click "Launch Instance"
4. Wait 2 minutes for it to start
5. Click your instance → Copy the "Public IPv4 address"

**Write down:** `EC2_IP = 12.34.56.78` (your actual IP)

### 6.3 Connect to your server

On Mac/Linux, open a terminal:
```bash
# Make the key file private (required)
chmod 400 /path/to/aetheris-key.pem

# SSH into your server
ssh -i /path/to/aetheris-key.pem ubuntu@YOUR_EC2_IP
```

On Windows, use PuTTY or Windows Terminal with the same command.

You should see a terminal prompt like `ubuntu@ip-...:~$`
You are now inside your server.

### 6.4 Install dependencies on the server

Run these commands one at a time inside the server:

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install essential tools
sudo apt-get install -y git curl build-essential pkg-config libssl-dev

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Press 1 (default install) when prompted
source ~/.cargo/env

# Install Python and pip
sudo apt-get install -y python3 python3-pip python3-venv

# Install PM2 (process manager — keeps bots running after you disconnect)
sudo npm install -g pm2

# Confirm versions
node --version
rustc --version
python3 --version
pm2 --version
```

### 6.5 Clone your repository

Still inside the server:

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/aetheris-protocol.git
# Or however your repo is hosted. If it's private:
# git clone https://YOUR_TOKEN@github.com/YOUR_USERNAME/aetheris-protocol.git
```

---

## PART 7 — CONFIGURE AND START AGENT ALPHA (RUST BOT)

### 7.1 Set up the config

Inside the server, go to your Rust bot folder:

```bash
cd ~/aetheris-protocol/aetheris-agent-alpha-rust
```

Create the config/environment file:

```bash
cp .env.example .env   # If this file exists
# Or create it from scratch:
nano .env
```

Fill in these values (press Ctrl+X, then Y, then Enter to save in nano):

```env
# Network
RPC_WS_URL=wss://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
RPC_HTTP_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Your executor wallet (the one the bot uses to sign transactions)
EXECUTOR_PRIVATE_KEY=0x_your_executor_wallet_private_key

# Contract addresses (from your notepad in Part 4)
AGENT_ALPHA_ADDR=0x_your_agent_alpha_address
MULTICALL3_ADDR=0xcA11bde05977b3631167028862bE2a173976CA11

# SQLite database path (for 30-day data collection)
DB_PATH=./data/alpha.db

# Telegram alerts (optional — skip if you don't have a bot)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

**Getting an Alchemy API key (free):**
Go to https://alchemy.com → Create account → Create App → Network: Base →
Copy the API key. Free tier gives you 300M compute units/month — more than enough.

### 7.2 Build the Rust bot

```bash
cd ~/aetheris-protocol/aetheris-agent-alpha-rust
cargo build --release
```

This takes 5-10 minutes the first time. When it finishes you will see
`Finished release [optimized]` with no errors.

Test it runs (it will connect and start watching — press Ctrl+C after a few seconds):
```bash
./target/release/aetheris-agent-alpha
```

### 7.3 Start with PM2

```bash
pm2 start ./target/release/aetheris-agent-alpha \
  --name "agent-alpha" \
  --log ./logs/alpha.log

# Save PM2 config so it restarts on server reboot
pm2 save
pm2 startup
# Run the command it prints (starts with "sudo env PATH=...")
```

Check it is running:
```bash
pm2 status
pm2 logs agent-alpha --lines 50
```

You should see log lines like:
```
[INFO] Connected to Base mainnet via WebSocket
[INFO] Block 12345678 received — scanning 47 routes
[INFO] No profitable opportunity found (best: $0.23, threshold: $2.00)
```

---

## PART 8 — CONFIGURE AND START AGENT BETA (PYTHON BOT)

### 8.1 Set up Python environment

```bash
cd ~/aetheris-protocol
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt   # Or: pip install web3 python-dotenv requests
```

### 8.2 Configure Agent Beta

```bash
nano agent_beta/.env
```

```env
# Network
RPC_HTTP_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Executor wallet
EXECUTOR_PRIVATE_KEY=0x_your_executor_wallet_private_key

# Contract addresses
AGENT_BETA_ADDR=0x_your_agent_beta_address
USDC_ADDR=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Synthetix on Base
SYNTHETIX_PERP_MARKET=0x_synthetix_eth_perp_market_address

# Strategy params (conservative for Phase 1)
MIN_FUNDING_RATE_APR=0.10        # Only open position if funding > 10% APR
MAX_POSITION_SIZE_USDC=50        # Never use more than $50 per position (half your capital)
MAX_HOLD_HOURS=8                 # Close position after 8 hours max

# Database
DB_PATH=./data/beta.db
```

### 8.3 Start Agent Beta with PM2

```bash
cd ~/aetheris-protocol
source venv/bin/activate

pm2 start "python3 agent_beta/main.py" \
  --name "agent-beta" \
  --log ./logs/beta.log

pm2 save
pm2 status
```

Check logs:
```bash
pm2 logs agent-beta --lines 50
```

---

## PART 9 — CONFIGURE AND START AGENT V (RUST SECURITY MONITOR)

Agent V watches every deployed contract at the storage slot level every block.
Start it after Agent Alpha and Beta are running — it needs the contract addresses
to populate its watchlist.

### 9.1 Build Agent V

```bash
cd ~/aetheris-protocol/aetheris-agent-v
cargo build --release
```

This shares Rust compilation cache with Agent Alpha so it builds faster.
When it finishes you will see `Finished release [optimized]` with no errors.

### 9.2 Configure Agent V

```bash
cp .env.example .env
nano .env
```

Fill in all values:

```env
# ── RPC Endpoints ─────────────────────────────────────────────────
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
BASE_MAINNET_WS_URL=wss://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Optional: QuickNode failover (leave blank if you don't have one)
QUICKNODE_SEPOLIA_RPC_URL=

# ── Mainnet ───────────────────────────────────────────────────────
BASE_SEPOLIA_RPC_URL=
BASE_SEPOLIA_WS_URL=

# ── Chain ─────────────────────────────────────────────────────────
CHAIN_ID=8453

# ── Wallet ────────────────────────────────────────────────────────
# Same executor wallet used by Alpha and Beta
BUNDLER_PRIVATE_KEY=0x_your_executor_wallet_private_key

# ── Contract Addresses ────────────────────────────────────────────
AGENT_ALPHA_ADDR=0x_your_agent_alpha_address
AGENT_BETA_ADDR=0x_your_agent_beta_address
VAULT_ADDR=0x_your_vault_address
MULTICALL3_ADDR=0xcA11bde05977b3631167028862bE2a173976CA11

# Extra contracts to watch (comma-separated). Add Paymaster and AccountFactory.
WATCHED_CONTRACTS=0x_paymaster_address,0x_account_factory_address

# ── Oracle ────────────────────────────────────────────────────────
CHAINLINK_ETH_USD=0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70
PYTH_CONTRACT=0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
PYTH_ETH_USD_FEED_ID=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace

# Alert if Chainlink vs Pyth diverges more than this (in bps — 500 = 5%)
ORACLE_DIVERGENCE_BPS=500

# ── Circuit Breaker ───────────────────────────────────────────────
CIRCUIT_BREAKER_THRESHOLD=5

# ── Database ──────────────────────────────────────────────────────
DB_PATH=./data/agent_v.db

# ── Alerts (optional) ─────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=

# ── Logging ───────────────────────────────────────────────────────
RUST_LOG=info
```

### 9.3 Start Agent V with PM2

```bash
cd ~/aetheris-protocol/aetheris-agent-v

pm2 start ./target/release/aetheris-agent-v \
  --name "agent-v" \
  --log ./logs/agent-v.log

pm2 save
pm2 status
```

Check it is running:
```bash
pm2 logs agent-v --lines 50
```

You should see log lines like:
```
[INFO] Agent V — Security Monitor v0.1.0
[INFO] Config loaded: 5 contracts on watchlist
[INFO] Database ready at './data/agent_v.db'
[INFO] RPC provider ready
[INFO] Block 12345678 — read 18 slots across 5 contracts — no changes
```

### 9.4 Confirm Agent V is seeding correctly (important)

On the very first block, Agent V reads all slot values and stores them as
a baseline. It will NOT produce any alerts on that first block — only diffs
from the second block onward. This is by design and prevents false positives
on startup.

After one minute, confirm in the logs that it is processing blocks without
errors and not producing false threat alerts. If you see unexpected CRITICAL
or HIGH alerts immediately, check that all contract addresses in `.env` are
correct.

---

## PART 10 — CONFIGURE AND START AGENT GAS (NODE.JS BUNDLER)

Agent Gas runs as an ERC-4337 bundler and paymaster. Start it last — it
depends on AetherisPaymaster and AetherisAccountFactory being deployed and
confirmed (Steps 4.7 and 4.8).

### 10.1 Install Node.js dependencies

```bash
cd ~/aetheris-protocol/agent_gas
npm install
npm run build
```

When it finishes you will see TypeScript compilation complete with no errors.

### 10.2 Configure Agent Gas

```bash
cp .env.example .env
nano .env
```

Fill in all values:

```env
# ── RPC Endpoints ─────────────────────────────────────────────────
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
BASE_MAINNET_WS_URL=wss://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Optional: QuickNode failover (leave blank if you don't have one)
QUICKNODE_SEPOLIA_RPC_URL=

# ── Sepolia (leave blank for mainnet-only Phase 1) ────────────────
BASE_SEPOLIA_RPC_URL=
BASE_SEPOLIA_WS_URL=

# ── Chain ─────────────────────────────────────────────────────────
CHAIN_ID=8453

# ── Wallet ────────────────────────────────────────────────────────
# Bundler wallet — same executor wallet used by the other agents
BUNDLER_PRIVATE_KEY=0x_your_executor_wallet_private_key

# Paymaster signer — the wallet you registered in Step 4.7
# This is PAYMASTER_SIGNER_KEY, not BUNDLER_PRIVATE_KEY — they are different wallets
PAYMASTER_SIGNER_KEY=0x_your_paymaster_signer_private_key

# ── Contract Addresses ────────────────────────────────────────────
ENTRY_POINT_ADDR=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
PAYMASTER_ADDR=0x_your_paymaster_address
ACCOUNT_FACTORY_ADDR=0x_your_account_factory_address
VAULT_ADDR=0x_your_vault_address
STAKING_ADDR=0x_your_staking_address

# ── Agent Settings ────────────────────────────────────────────────
BUNDLE_INTERVAL_MS=2000
MAX_BUNDLE_SIZE=10
MAX_SPONSORED_GAS_USDC=5000000
GAS_OVERHEAD_PCT=10

# ── Server ────────────────────────────────────────────────────────
PORT=3000

# ── Database ──────────────────────────────────────────────────────
DB_PATH=./data/agent_gas.db

# ── Alerts (optional) ─────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=
```

### 10.3 Start Agent Gas with PM2

```bash
cd ~/aetheris-protocol/agent_gas

pm2 start dist/index.js \
  --name "agent-gas" \
  --log ./logs/agent-gas.log

pm2 save
pm2 status
```

Check it is running:
```bash
pm2 logs agent-gas --lines 50
```

You should see log lines like:
```
[INFO] Agent Gas — ERC-4337 Bundler v0.1.0
[INFO] Chain ID: 8453 (Base Mainnet)
[INFO] EntryPoint: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
[INFO] Paymaster: 0x...
[INFO] Bundler loop started — interval: 2000ms
[INFO] Server listening on port 3000
```

### 10.4 Verify the health endpoint

From your laptop (replace with your EC2 IP):

```bash
curl http://YOUR_EC2_IP:3000/health
```

You should get:
```json
{
  "status": "ok",
  "mempoolSize": 0,
  "todayStats": {
    "opsReceived": 0,
    "opsSponsored": 0,
    "opsBundled": 0,
    "opsFailed": 0,
    "totalUsdcFees": 0,
    "bundlesSubmitted": 0
  }
}
```

If the health check returns `ok`, Agent Gas is ready to accept UserOperations.

**Note:** Port 3000 needs to be open in your EC2 security group.
AWS Console → EC2 → Security Groups → Your instance's group → Inbound Rules
→ Add Rule → Custom TCP → Port 3000 → Source: Your IP (or 0.0.0.0/0 for public).

---

## PART 11 — VERIFY EVERYTHING IS WORKING

### 11.1 Check from your laptop

Go to https://basescan.org and search each contract address. You should see:
- AgentAlpha contract with code verified (green checkmark)
- AgentBeta contract with ~$100 USDC balance
- AetherisPaymaster contract with ETH deposit visible in EntryPoint
- No error transactions (red ones) in the history

### 11.2 Check all four bots are alive

SSH back into the server anytime:
```bash
ssh -i /path/to/aetheris-key.pem ubuntu@YOUR_EC2_IP
pm2 status
```

All four processes should show status `online`:
```
┌─────────────────┬────┬─────────┬──────┬─────────┐
│ name            │ id │ status  │ cpu  │ memory  │
├─────────────────┼────┼─────────┼──────┼─────────┤
│ agent-alpha     │ 0  │ online  │ 0%   │ 45mb    │
│ agent-beta      │ 1  │ online  │ 0%   │ 38mb    │
│ agent-v         │ 2  │ online  │ 0%   │ 52mb    │
│ agent-gas       │ 3  │ online  │ 0%   │ 120mb   │
└─────────────────┴────┴─────────┴──────┴─────────┘
```

### 11.3 Watch a trade happen (Agent Alpha)

When the Rust bot finds a profitable opportunity and fires a transaction:
1. It will appear in `pm2 logs agent-alpha`
2. Go to https://basescan.org → search your AgentAlpha contract address
3. Under "Transactions" you will see the `executeArbitrage` call
4. Click the transaction → you will see the exact USDC profit amount

### 11.4 Watch a position open (Agent Beta)

When Agent Beta opens a Synthetix position:
1. Check `pm2 logs agent-beta`
2. The AgentBeta contract balance on Basescan will decrease (capital deployed)
3. After 8 hours (or when it closes), capital + profit returns to AgentBeta

### 11.5 Watch Agent V detect a block (no threats expected)

Every block, Agent V logs a one-liner confirming it read all slots:
```bash
pm2 logs agent-v --lines 20
```
```
[INFO] Block 12345700 — read 18 slots across 5 contracts — no changes
[INFO] Block 12345702 — read 18 slots across 5 contracts — no changes
```

If Agent V ever fires a CRITICAL or HIGH alert, check Basescan immediately
to see what changed. Agent V's SQLite database records every incident with
old and new values.

### 11.6 Test Agent Gas sponsorship (optional smoke test)

From your laptop, send a test sponsorship request:

```bash
curl -X POST http://YOUR_EC2_IP:3000/paymaster \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "pm_sponsorUserOperation",
    "params": [{
      "sender": "0x0000000000000000000000000000000000000001",
      "nonce": "0x0",
      "initCode": "0x",
      "callData": "0x",
      "callGasLimit": "0x5208",
      "verificationGasLimit": "0x5208",
      "preVerificationGas": "0x5208",
      "maxFeePerGas": "0x1",
      "maxPriorityFeePerGas": "0x1",
      "paymasterAndData": "0x",
      "signature": "0x"
    }, "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"],
    "id": 1
  }'
```

A policy rejection response (not a server error) confirms Agent Gas is
running and evaluating requests correctly. A real UserOp from an actual
smart account wallet would be accepted if it calls a whitelisted function.

---

## PART 12 — DATA COLLECTION FOR 30 DAYS

The SQLite databases collect everything automatically.
After 30 days, pull the data:

```bash
ssh -i aetheris-key.pem ubuntu@YOUR_EC2_IP
cd ~/aetheris-protocol

# Copy databases to your laptop
exit

# On your laptop:
scp -i aetheris-key.pem ubuntu@YOUR_EC2_IP:~/aetheris-protocol/data/alpha.db ./
scp -i aetheris-key.pem ubuntu@YOUR_EC2_IP:~/aetheris-protocol/data/beta.db ./
scp -i aetheris-key.pem ubuntu@YOUR_EC2_IP:~/aetheris-protocol/aetheris-agent-v/data/agent_v.db ./
scp -i aetheris-key.pem ubuntu@YOUR_EC2_IP:~/aetheris-protocol/agent_gas/data/agent_gas.db ./
```

Then query them locally (install SQLite browser from https://sqlitebrowser.org):
```sql
-- Agent Alpha: total trades and profit
SELECT COUNT(*) as trades, SUM(profit_usdc) as total_profit,
       AVG(profit_usdc) as avg_profit, SUM(gas_cost_eth) as total_gas
FROM trades WHERE success = 1;

-- Agent Alpha: win rate
SELECT
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as win_rate
FROM trades;

-- Agent Alpha: profit by hour of day
SELECT strftime('%H', timestamp) as hour, SUM(profit_usdc) as profit
FROM trades WHERE success = 1
GROUP BY hour ORDER BY profit DESC;

-- Agent Beta: all positions
SELECT position_id, capital_deployed, gross_profit,
       datetime(opened_at, 'unixepoch') as opened,
       datetime(closed_at, 'unixepoch') as closed,
       close_reason
FROM positions ORDER BY opened_at;

-- Agent V: all detected incidents
SELECT datetime(timestamp, 'unixepoch') as time, threat_level,
       contract_address, description, tx_hash
FROM incidents ORDER BY timestamp;

-- Agent V: 30-day summary
SELECT date, blocks_monitored, threats_detected, critical_count,
       high_count, responses_executed, rpc_failures
FROM daily_summary ORDER BY date;

-- Agent Gas: 30-day UserOp stats
SELECT date, ops_received, ops_sponsored, ops_bundled,
       ops_failed, total_usdc_fees, bundles_submitted
FROM daily_stats ORDER BY date;
```

**The answers to your questions will be in here:**
1. Profitable opportunities per day → `COUNT(*) / 30` from Alpha trades
2. Actual average profit per trade → `AVG(profit_usdc)` from Alpha trades
3. Real win rate → success count / total count
4. Where it fails → `close_reason` in Beta positions, failed tx in Alpha
5. Gas costs by time → hour-of-day breakdown from Alpha trades
6. Security incidents → Agent V incidents table (should be empty — good sign)
7. Gas sponsorship demand → Agent Gas daily_stats ops_sponsored count

---

## PART 13 — IF SOMETHING GOES WRONG

### Any bot crashes
```bash
pm2 logs agent-alpha --lines 100   # Read the error
pm2 restart agent-alpha            # Restart it
# Replace agent-alpha with agent-beta, agent-v, or agent-gas as needed
```

### Bot is not finding any opportunities (Agent Alpha)
Normal for first few days. Base arbitrage is competitive.
Check `pm2 logs` — you should see scan logs every block even with no trades.
If you see NO logs at all, the WebSocket connection dropped:
```bash
pm2 restart agent-alpha
```

### Agent Beta position stuck open
SSH into server → check logs → if the Python bot is failing to close,
you can manually trigger an emergency close from your laptop:
```bash
npx hardhat console --network base
const beta = await ethers.getContractAt("AgentBeta", "AGENT_BETA_ADDR");
await beta.emergencyReturn();   // Guardian function — pulls all idle capital
```

### Agent V fires a false CRITICAL alert on startup
This means Agent V started watching a contract mid-upgrade or the contract
address in `.env` is wrong. Check:
1. All contract addresses in `aetheris-agent-v/.env` match your notepad
2. The contracts are not paused or in an upgrading state on Basescan
3. Restart Agent V — it will re-seed its baseline on the first block:
```bash
pm2 restart agent-v
```

### Agent V fires a real CRITICAL alert
Stop everything immediately:
```bash
# From your laptop
npx hardhat console --network base
const alpha = await ethers.getContractAt("AgentAlpha", "AGENT_ALPHA_ADDR");
const beta  = await ethers.getContractAt("AgentBeta",  "AGENT_BETA_ADDR");
await alpha.pause();
await beta.pause();
```
Then stop the bots:
```bash
pm2 stop all
```
Agent V will have already attempted the emergency responses automatically.
Check `pm2 logs agent-v` and Basescan to see which transactions fired
and what the actual threat was.

### Agent Gas health check returns error
```bash
pm2 logs agent-gas --lines 100
```
Most common causes:
- `PAYMASTER_ADDR` not set in `.env` → fill it in and restart
- Paymaster EntryPoint deposit is zero → top up via `paymaster.deposit()`
- Port 3000 not open in EC2 security group → add inbound rule in AWS console

### Agent Gas sponsorship deposit running low
Check the balance and top up:
```bash
npx hardhat console --network base
const ep = await ethers.getContractAt(
  ["function balanceOf(address) view returns (uint256)",
   "function depositTo(address) payable"],
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
);
const bal = await ep.balanceOf("PAYMASTER_ADDR");
console.log("Deposit:", ethers.formatEther(bal), "ETH");
// Top up with 0.05 ETH if below 0.01 ETH:
await ep.depositTo("PAYMASTER_ADDR", { value: ethers.parseEther("0.05") });
```

### Need to pause everything immediately
From your laptop:
```bash
npx hardhat console --network base
const alpha = await ethers.getContractAt("AgentAlpha", "AGENT_ALPHA_ADDR");
const beta  = await ethers.getContractAt("AgentBeta",  "AGENT_BETA_ADDR");
await alpha.pause();
await beta.pause();
```
Then stop all bots on the server:
```bash
pm2 stop all
```

### Server goes down
AWS sometimes restarts instances. PM2 handles this automatically if you
ran `pm2 startup` and `pm2 save` in Part 7. All four bots restart themselves.

---

## SUMMARY — WHAT YOU HAVE AFTER THIS GUIDE

```
Base Mainnet:
  ✅ AetherisToken deployed
  ✅ ProfitDistributor deployed
  ✅ AgentAlpha deployed + EXECUTOR_ROLE granted
  ✅ AgentBeta deployed + EXECUTOR_ROLE granted + $100 USDC funded
  ✅ AetherisStaking deployed
  ✅ AetherisVault deployed (deposits disabled — Phase 1 gate active)
  ✅ AetherisPaymaster deployed + signer registered + 0.05 ETH deposited
  ✅ AetherisAccountFactory deployed

AWS EC2:
  ✅ Rust bot (Agent Alpha) running 24/7 via PM2
  ✅ Python bot (Agent Beta) running 24/7 via PM2
  ✅ Rust security monitor (Agent V) running 24/7 via PM2
  ✅ Node.js bundler (Agent Gas) running 24/7 via PM2 on port 3000
  ✅ SQLite databases collecting every trade, scan, position, incident, and UserOp

After 30 days:
  → Pull alpha.db, beta.db, agent_v.db, and agent_gas.db
  → Answer your questions with real data
  → Decide: is Phase 2 (vault + more agents) worth building out now?
```

Total upfront cost: ~$200-250
- ~$70 ETH for deployment gas + executor gas (split across wallets)
- $50 ETH for paymaster EntryPoint deposit (~0.05 ETH)
- $100 USDC Agent Beta capital
- ~$15/month EC2 server (billed monthly by AWS)
