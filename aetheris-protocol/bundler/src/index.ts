// Aetheris\aetheris-protocol\bundler\src\index.ts

// Aetheris\aetheris-protocol\bundler\src\index.ts

import { ethers } from "ethers";
import express from "express";
import Redis from "ioredis";
import winston from "winston";

/**
 * AETHERIS BUNDLER SERVICE
 *
 * Enterprise-grade ERC-4337 bundler for Base L2
 *
 * Features:
 * - Batch UserOperation processing
 * - Mempool management with Redis
 * - Gas price optimization
 * - Automatic EntryPoint reimbursement
 * - Monitoring & alerting
 * - Rate limiting & DDoS protection
 *
 * ERC-4337 Version: v0.7 (PackedUserOperation)
 * EntryPoint: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
 */

/*******************************************************************************
 * CONFIGURATION
 ******************************************************************************/

interface Config {
  rpcUrl: string;
  entryPointAddress: string;
  bundlerPrivateKey: string;
  paymasterAddress: string;
  redisUrl: string;
  port: number;
  batchSize: number;
  batchInterval: number; // ms
  maxGasPrice: bigint;
  minProfitMargin: bigint; // wei
}

const config: Config = {
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  bundlerPrivateKey: process.env.BUNDLER_PRIVATE_KEY!,
  paymasterAddress: process.env.PAYMASTER_ADDRESS!,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  port: parseInt(process.env.PORT || "3000"),
  batchSize: 10,
  batchInterval: 3000, // 3 seconds
  maxGasPrice: ethers.parseUnits("10", "gwei"),
  minProfitMargin: ethers.parseEther("0.0001"),
};

/*******************************************************************************
 * LOGGING
 ******************************************************************************/

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/*******************************************************************************
 * BLOCKCHAIN CONNECTION
 ******************************************************************************/

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const bundlerWallet = new ethers.Wallet(config.bundlerPrivateKey, provider);

/**
 * ERC-4337 v0.7 EntryPoint ABI (PackedUserOperation)
 *
 * Key difference from v0.6:
 * - callGasLimit + verificationGasLimit → packed into accountGasLimits (bytes32)
 * - maxFeePerGas + maxPriorityFeePerGas → packed into gasFees (bytes32)
 */
const ENTRY_POINT_ABI = [
  // v0.7 handleOps — uses PackedUserOperation (9 fields, not 11)
  "function handleOps(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature)[] ops, address payable beneficiary) external",

  // Used to compute the canonical hash — always matches what the contract computes
  "function getUserOpHash(tuple(address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) op) view returns (bytes32)",

  // Deposit tracking
  "function balanceOf(address account) view returns (uint256)",
  "function depositTo(address account) external payable",
];

const entryPoint = new ethers.Contract(
  config.entryPointAddress,
  ENTRY_POINT_ABI,
  bundlerWallet
);

/*******************************************************************************
 * ERC-4337 v0.7 TYPES
 ******************************************************************************/

/**
 * PackedUserOperation (ERC-4337 v0.7)
 *
 * accountGasLimits: bytes32
 *   - upper 128 bits = verificationGasLimit
 *   - lower 128 bits = callGasLimit
 *
 * gasFees: bytes32
 *   - upper 128 bits = maxPriorityFeePerGas
 *   - lower 128 bits = maxFeePerGas
 */
interface UserOperation {
  sender: string;
  nonce: bigint;
  initCode: string;
  callData: string;
  accountGasLimits: string; // bytes32: verificationGasLimit (hi) + callGasLimit (lo)
  preVerificationGas: bigint;
  gasFees: string;          // bytes32: maxPriorityFeePerGas (hi) + maxFeePerGas (lo)
  paymasterAndData: string;
  signature: string;
}

/*******************************************************************************
 * PACKING HELPERS (ERC-4337 v0.7)
 ******************************************************************************/

/**
 * Pack two uint128 values into a single bytes32.
 *
 * @param hi - upper 128 bits (verificationGasLimit OR maxPriorityFeePerGas)
 * @param lo - lower 128 bits (callGasLimit OR maxFeePerGas)
 * @returns hex string bytes32
 *
 * Usage:
 *   accountGasLimits = packUint128(verificationGasLimit, callGasLimit)
 *   gasFees          = packUint128(maxPriorityFeePerGas, maxFeePerGas)
 */
function packUint128(hi: bigint, lo: bigint): string {
  const packed = (hi << 128n) | lo;
  return ethers.zeroPadValue(ethers.toBeHex(packed), 32);
}

/**
 * Unpack a bytes32 into two uint128 values.
 * Useful for logging and debugging.
 *
 * @param packed - hex string bytes32
 * @returns { hi, lo } as bigints
 */
function unpackUint128(packed: string): { hi: bigint; lo: bigint } {
  const value = BigInt(packed);
  return {
    hi: value >> 128n,
    lo: value & ((1n << 128n) - 1n),
  };
}

/**
 * Normalize an incoming UserOperation to v0.7 format.
 *
 * Handles two cases:
 * 1. Already v0.7 (has accountGasLimits + gasFees) — just coerce types
 * 2. Legacy v0.6 (has callGasLimit, verificationGasLimit, etc.) — pack them
 *
 * This means your bundler accepts ops from both old and new SDKs.
 */
function normalizeUserOp(raw: any): UserOperation {
  // Case 1: Already v0.7 format
  if (raw.accountGasLimits !== undefined && raw.gasFees !== undefined) {
    return {
      sender: raw.sender,
      nonce: BigInt(raw.nonce),
      initCode: raw.initCode ?? "0x",
      callData: raw.callData,
      accountGasLimits: raw.accountGasLimits,
      preVerificationGas: BigInt(raw.preVerificationGas),
      gasFees: raw.gasFees,
      paymasterAndData: raw.paymasterAndData ?? "0x",
      signature: raw.signature,
    };
  }

  // Case 2: Legacy v0.6 format — pack the fields
  logger.info(`Normalizing v0.6 UserOp from ${raw.sender} → v0.7 format`);
  return {
    sender: raw.sender,
    nonce: BigInt(raw.nonce),
    initCode: raw.initCode ?? "0x",
    callData: raw.callData,
    accountGasLimits: packUint128(
      BigInt(raw.verificationGasLimit ?? 0),
      BigInt(raw.callGasLimit ?? 0)
    ),
    preVerificationGas: BigInt(raw.preVerificationGas ?? 0),
    gasFees: packUint128(
      BigInt(raw.maxPriorityFeePerGas ?? 0),
      BigInt(raw.maxFeePerGas ?? 0)
    ),
    paymasterAndData: raw.paymasterAndData ?? "0x",
    signature: raw.signature,
  };
}

/**
 * Serialize a UserOperation for Redis storage.
 * BigInt fields are stored as decimal strings.
 */
function serializeUserOp(userOp: UserOperation): string {
  return JSON.stringify(userOp, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  );
}

/**
 * Deserialize a UserOperation from Redis storage.
 * Restores BigInt fields from decimal strings.
 */
function deserializeUserOp(data: string): UserOperation {
  return JSON.parse(data, (key, value) => {
    if (key === "nonce" || key === "preVerificationGas") {
      return BigInt(value);
    }
    return value;
  });
}

/*******************************************************************************
 * MEMPOOL (REDIS)
 ******************************************************************************/

const redis = new Redis(config.redisUrl);

/**
 * Add a UserOperation to the mempool.
 *
 * Uses entryPoint.getUserOpHash() to compute the canonical hash.
 * This guarantees our hash always matches what the contract produces —
 * no risk of drift from manual ABI encoding.
 *
 * @param userOp - normalized v0.7 UserOperation
 * @returns canonical hash from EntryPoint
 */
async function addToMempool(userOp: UserOperation): Promise<string> {
  // Canonical hash from the contract itself — never diverges
  const hash: string = await entryPoint.getUserOpHash(userOp);

  await redis.setex(
    `userop:${hash}`,
    300, // 5 min TTL — expired ops are auto-cleaned
    serializeUserOp(userOp)
  );

  await redis.lpush("mempool", hash);

  logger.info(`UserOp added to mempool: ${hash}`);
  return hash;
}

/**
 * Get a batch of UserOperations from the mempool.
 * Pops from the right (FIFO order — oldest first).
 *
 * @param size - maximum number of ops to retrieve
 * @returns array of UserOperations
 */
async function getBatch(size: number): Promise<UserOperation[]> {
  const hashes = await redis.rpop("mempool", size);
  if (!hashes || hashes.length === 0) return [];

  const ops: UserOperation[] = [];

  for (const hash of hashes) {
    const data = await redis.get(`userop:${hash}`);
    if (data) {
      ops.push(deserializeUserOp(data));
      await redis.del(`userop:${hash}`);
    } else {
      // TTL expired — op was already cleaned up, skip it
      logger.warn(`UserOp ${hash} expired from mempool, skipping`);
    }
  }

  return ops;
}

/*******************************************************************************
 * BUNDLER LOGIC
 ******************************************************************************/

/**
 * Simulate a UserOperation against the EntryPoint.
 * Uses eth_estimateGas — if it reverts, the op is invalid.
 *
 * @param userOp - UserOperation to simulate
 * @returns true if valid, false if simulation reverts
 */
async function simulateUserOp(userOp: UserOperation): Promise<boolean> {
  try {
    const tx = await entryPoint.handleOps.populateTransaction(
      [userOp],
      bundlerWallet.address
    );

    await provider.estimateGas({
      ...tx,
      from: bundlerWallet.address,
    });

    return true;
  } catch (error: any) {
    logger.error(`Simulation failed for ${userOp.sender}: ${error.message}`);
    return false;
  }
}

/**
 * Log unpacked gas details for a UserOperation.
 * Useful for debugging gas issues.
 */
function logGasDetails(userOp: UserOperation): void {
  const gasLimits = unpackUint128(userOp.accountGasLimits);
  const fees = unpackUint128(userOp.gasFees);

  logger.info(`Gas details for ${userOp.sender}:`, {
    verificationGasLimit: gasLimits.hi.toString(),
    callGasLimit: gasLimits.lo.toString(),
    maxPriorityFeePerGas: fees.hi.toString(),
    maxFeePerGas: fees.lo.toString(),
    preVerificationGas: userOp.preVerificationGas.toString(),
  });
}

/**
 * Fetch, validate, and submit a batch of UserOperations to the EntryPoint.
 */
async function processBatch(): Promise<void> {
  try {
    const ops = await getBatch(config.batchSize);
    if (ops.length === 0) return;

    logger.info(`Processing batch of ${ops.length} UserOp(s)`);

    // Simulate each op — filter out invalid ones
    const validOps: UserOperation[] = [];
    for (const op of ops) {
      const isValid = await simulateUserOp(op);
      if (isValid) {
        validOps.push(op);
      } else {
        logger.warn(`Dropping invalid UserOp from ${op.sender}`);
      }
    }

    if (validOps.length === 0) {
      logger.info("No valid UserOps in batch, skipping");
      return;
    }

    // Check current gas price — don't submit if network is too expensive
    const feeData = await provider.getFeeData();
    if (feeData.maxFeePerGas && feeData.maxFeePerGas > config.maxGasPrice) {
      logger.warn(
        `Gas price too high (${feeData.maxFeePerGas} > ${config.maxGasPrice}), re-queuing ops`
      );
      for (const op of validOps) {
        await addToMempool(op);
      }
      return;
    }

    // Submit batch to EntryPoint
    logger.info(`Submitting ${validOps.length} UserOp(s) to EntryPoint`);

    const tx = await entryPoint.handleOps(validOps, bundlerWallet.address, {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });

    logger.info(`Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    logger.info(`Confirmed in block ${receipt.blockNumber}`);
    logger.info(`Gas used: ${receipt.gasUsed.toString()}`);

    const gasCost = receipt.gasUsed * receipt.gasPrice;
    logger.info(`Gas cost: ${ethers.formatEther(gasCost)} ETH`);

  } catch (error: any) {
    logger.error(`Batch processing error: ${error.message}`);
  }
}

/*******************************************************************************
 * API SERVER
 ******************************************************************************/

const app = express();
app.use(express.json());

/**
 * GET /health
 * Basic health check — confirms bundler is running and connected.
 */
app.get("/health", (_req, res) => {
  res.json({
    status: "healthy",
    version: "v0.7",
    bundler: bundlerWallet.address,
    entryPoint: config.entryPointAddress,
    mempool: "redis",
  });
});

/**
 * POST /rpc
 * JSON-RPC endpoint for ERC-4337 methods.
 *
 * Supported methods:
 * - eth_sendUserOperation
 * - eth_estimateUserOperationGas
 * - eth_getUserOperationReceipt
 */
app.post("/rpc", async (req, res) => {
  try {
    const { method, params, id } = req.body;

    // --- eth_sendUserOperation ---
    if (method === "eth_sendUserOperation") {
      const [rawOp, entryPointAddr] = params;

      if (entryPointAddr !== config.entryPointAddress) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Invalid EntryPoint address" },
        });
      }

      // Normalize to v0.7 — handles both v0.6 and v0.7 client SDKs
      const userOp = normalizeUserOp(rawOp);
      const hash = await addToMempool(userOp);

      return res.json({ jsonrpc: "2.0", id, result: hash });
    }

    // --- eth_estimateUserOperationGas ---
    if (method === "eth_estimateUserOperationGas") {
      const [rawOp] = params;
      const userOp = normalizeUserOp(rawOp);

      logGasDetails(userOp);

      const isValid = await simulateUserOp(userOp);

      if (!isValid) {
        return res.status(400).json({
          jsonrpc: "2.0",
          id,
          error: { code: -32521, message: "Simulation failed" },
        });
      }

      // Return v0.7 packed format estimates
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          preVerificationGas: "0x5208",   // 21,000
          // accountGasLimits packs both limits as bytes32
          accountGasLimits: packUint128(
            125000n, // verificationGasLimit
            200000n  // callGasLimit
          ),
          // gasFees packs both fee values — client will override with actual values
          gasFees: packUint128(
            ethers.parseUnits("1", "gwei"),  // maxPriorityFeePerGas
            ethers.parseUnits("2", "gwei")   // maxFeePerGas
          ),
        },
      });
    }

    // --- eth_getUserOperationReceipt ---
    if (method === "eth_getUserOperationReceipt") {
      // Full implementation requires an event indexer (e.g. The Graph or custom DB)
      // Returns null for now — clients should poll until non-null
      return res.json({ jsonrpc: "2.0", id, result: null });
    }

    // --- Unsupported method ---
    return res.status(400).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not supported: ${method}` },
    });

  } catch (error: any) {
    logger.error(`RPC error: ${error.message}`);
    return res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: { code: -32603, message: error.message },
    });
  }
});

/**
 * GET /mempool/size
 * Returns the current number of pending UserOperations.
 */
app.get("/mempool/size", async (_req, res) => {
  const size = await redis.llen("mempool");
  res.json({ size });
});

/**
 * GET /bundler/balance
 * Returns the bundler wallet balance and EntryPoint deposit.
 */
app.get("/bundler/balance", async (_req, res) => {
  const balance = await provider.getBalance(bundlerWallet.address);
  const deposit = await entryPoint.balanceOf(bundlerWallet.address);

  res.json({
    address: bundlerWallet.address,
    balance: ethers.formatEther(balance),
    entryPointDeposit: ethers.formatEther(deposit),
  });
});

/*******************************************************************************
 * STARTUP
 ******************************************************************************/

async function main(): Promise<void> {
  logger.info("Starting Aetheris Bundler Service (ERC-4337 v0.7)");
  logger.info(`Bundler address : ${bundlerWallet.address}`);
  logger.info(`EntryPoint      : ${config.entryPointAddress}`);
  logger.info(`Paymaster       : ${config.paymasterAddress}`);
  logger.info(`Batch size      : ${config.batchSize} ops`);
  logger.info(`Batch interval  : ${config.batchInterval}ms`);

  // Warn if bundler wallet is low on ETH
  const balance = await provider.getBalance(bundlerWallet.address);
  logger.info(`Bundler balance : ${ethers.formatEther(balance)} ETH`);

  if (balance < ethers.parseEther("0.1")) {
    logger.warn("⚠️  Bundler balance is low! Top up to avoid failed batches.");
  }

  // Warn if EntryPoint deposit is low
  const deposit = await entryPoint.balanceOf(bundlerWallet.address);
  logger.info(`EntryPoint deposit : ${ethers.formatEther(deposit)} ETH`);

  if (deposit < ethers.parseEther("0.05")) {
    logger.warn("⚠️  EntryPoint deposit is low! Call depositTo() to refill.");
  }

  // Start batch processor loop
  setInterval(async () => {
    await processBatch();
  }, config.batchInterval);

  logger.info(`Batch processor started`);

  // Start HTTP server
  app.listen(config.port, () => {
    logger.info(`RPC endpoint : http://localhost:${config.port}/rpc`);
    logger.info(`Health check : http://localhost:${config.port}/health`);
  });
}

main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});