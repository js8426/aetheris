// Aetheris\agent_gas\src\bundler\rpc.ts

/**
 * bundler/rpc.ts — ERC-4337 JSON-RPC server
 *
 * Implements the standard ERC-4337 bundler RPC methods:
 *   eth_sendUserOperation       — Submit a UserOperation to the mempool
 *   eth_getUserOperationByHash  — Look up a UserOp by its hash
 *   eth_getUserOperationReceipt — Get the receipt for a confirmed UserOp
 *   eth_supportedEntryPoints    — List supported EntryPoint addresses
 *
 * All methods follow JSON-RPC 2.0 format.
 * Error codes follow ERC-4337 bundler spec (AA errors).
 */

import { Router, Request, Response } from 'express';
import { Config } from '../config';
import { Mempool, UserOperation } from './mempool';
import { AgentGasDB } from '../db';
import { AlertSender } from '../alerts';

export function createBundlerRouter(
  config: Config,
  mempool: Mempool,
  db: AgentGasDB,
  alerts: AlertSender
): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { method, params, id, jsonrpc } = req.body;

    switch (method) {
      case 'eth_sendUserOperation':
        return handleSendUserOperation(req, res, config, mempool, db, id);

      case 'eth_getUserOperationByHash':
        return handleGetUserOperationByHash(req, res, config, db, id);

      case 'eth_getUserOperationReceipt':
        return handleGetUserOperationReceipt(req, res, db, id);

      case 'eth_supportedEntryPoints':
        return res.json({
          jsonrpc: '2.0',
          id,
          result: [config.entryPointAddr],
        });

      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
    }
  });

  return router;
}

/** eth_sendUserOperation — Accept a UserOp into the mempool */
async function handleSendUserOperation(
  req: Request,
  res: Response,
  config: Config,
  mempool: Mempool,
  db: AgentGasDB,
  id: unknown
): Promise<Response> {
  const { params } = req.body;

  if (!params || params.length < 2) {
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32602, message: 'Missing params: [userOp, entryPoint]' },
    });
  }

  const userOp: Partial<UserOperation> = params[0];
  const entryPoint: string = params[1]?.toLowerCase() ?? '';

  // Verify entryPoint
  if (entryPoint !== config.entryPointAddr.toLowerCase()) {
    return res.json({
      jsonrpc: '2.0', id,
      error: {
        code: -32602,
        message: `Unsupported entryPoint: ${entryPoint}`,
      },
    });
  }

  // Add to mempool
  const result = mempool.add(userOp, config.chainId);

  if (!result.success) {
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32500, message: result.error ?? 'Validation failed' },
    });
  }

  // Persist to DB
  db.insertUserOp({
    userOpHash: result.hash!,
    sender: (userOp.sender ?? '').toLowerCase(),
    nonce: userOp.nonce ?? '0x0',
    callData: userOp.callData ?? '0x',
    paymasterSponsored: !!(userOp.paymasterAndData && userOp.paymasterAndData.length > 2),
    status: 'pending',
  });

  console.log(`[Bundler] Accepted UserOp: hash=${result.hash} sender=${userOp.sender}`);

  return res.json({
    jsonrpc: '2.0',
    id,
    result: result.hash,
  });
}

/** eth_getUserOperationByHash — Look up a UserOp by its hash */
async function handleGetUserOperationByHash(
  req: Request,
  res: Response,
  config: Config,
  db: AgentGasDB,
  id: unknown
): Promise<Response> {
  const { params } = req.body;
  const hash = params?.[0];

  if (!hash) {
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32602, message: 'Missing hash param' },
    });
  }

  const record = db.getUserOpByHash(hash);
  if (!record) {
    return res.json({ jsonrpc: '2.0', id, result: null });
  }

  return res.json({
    jsonrpc: '2.0',
    id,
    result: {
      userOperation: {
        sender: record.sender,
        nonce: record.nonce,
        callData: record.callData,
      },
      entryPoint: config.entryPointAddr,
      transactionHash: record.bundleTxHash ?? null,
      blockNumber: null, // Would require receipt lookup — out of scope for Phase 1
      blockHash: null,
    },
  });
}

/** eth_getUserOperationReceipt — Get receipt for a confirmed UserOp */
async function handleGetUserOperationReceipt(
  req: Request,
  res: Response,
  db: AgentGasDB,
  id: unknown
): Promise<Response> {
  const { params } = req.body;
  const hash = params?.[0];

  if (!hash) {
    return res.json({
      jsonrpc: '2.0', id,
      error: { code: -32602, message: 'Missing hash param' },
    });
  }

  const record = db.getUserOpByHash(hash);
  if (!record || record.status !== 'confirmed') {
    return res.json({ jsonrpc: '2.0', id, result: null });
  }

  return res.json({
    jsonrpc: '2.0',
    id,
    result: {
      userOpHash: record.userOpHash,
      sender: record.sender,
      nonce: record.nonce,
      actualGasUsed: record.gasUsed ?? null,
      success: true,
      receipt: {
        transactionHash: record.bundleTxHash ?? null,
      },
    },
  });
}
