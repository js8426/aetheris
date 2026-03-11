// Aetheris\aetheris-agent-alpha\gnosis\generate_merkle_root.ts

/**
 * Merkle Root Generator for ColdSafeClaim
 *
 * Run this BEFORE calling createClaimEvent() on the Cold Safe.
 * It reads a CSV of user balances at exit time and produces:
 *   1. The Merkle root to pass to createClaimEvent()
 *   2. A proofs.json file for the frontend so users can claim
 *
 * Usage:
 *   npx ts-node gnosis/generate_merkle_root.ts --input balances.csv --output proofs.json
 *
 * Input CSV format (balances.csv):
 *   address,token,amount
 *   0xUser1,0xUSDC,1000000000
 *   0xUser2,0xUSDC,500000000
 *   0xUser3,0xUSDC,250000000
 *
 * Output proofs.json format:
 *   {
 *     "merkleRoot": "0x...",
 *     "totalPerToken": { "0xUSDC": "1750000000" },
 *     "claims": {
 *       "0xUser1": {
 *         "0xUSDC": { "amount": "1000000000", "proof": ["0x...", "0x..."] }
 *       }
 *     }
 *   }
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { MerkleTree } from "merkletreejs";
import { keccak256 } from "merkletreejs";

interface ClaimEntry {
  address: string;
  token:   string;
  amount:  bigint;
}

interface ProofOutput {
  merkleRoot:    string;
  totalPerToken: Record<string, string>;
  leafCount:     number;
  generatedAt:   string;
  claims: Record<string, Record<string, { amount: string; proof: string[] }>>;
}

function parseCSV(filePath: string): ClaimEntry[] {
  const lines = fs.readFileSync(filePath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("address")); // skip header

  return lines.map((line) => {
    const [address, token, amount] = line.split(",").map((s) => s.trim());
    if (!ethers.isAddress(address)) throw new Error(`Invalid address: ${address}`);
    if (!ethers.isAddress(token))   throw new Error(`Invalid token: ${token}`);
    if (!amount || isNaN(Number(amount))) throw new Error(`Invalid amount: ${amount}`);

    return {
      address: ethers.getAddress(address), // checksum
      token:   ethers.getAddress(token),
      amount:  BigInt(amount),
    };
  });
}

function buildLeafHash(entry: ClaimEntry): Buffer {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "address", "uint256"],
    [entry.address, entry.token, entry.amount]
  );
  return Buffer.from(hash.slice(2), "hex");
}

function generateMerkleOutput(entries: ClaimEntry[]): ProofOutput {
  if (entries.length === 0) throw new Error("No entries provided");

  // Build leaf hashes
  const leafBuffers = entries.map(buildLeafHash);

  // Build Merkle tree
  const tree = new MerkleTree(leafBuffers, keccak256, { sortPairs: true });
  const root = "0x" + tree.getRoot().toString("hex");

  // Calculate totals per token
  const totalPerToken: Record<string, bigint> = {};
  for (const e of entries) {
    totalPerToken[e.token] = (totalPerToken[e.token] ?? 0n) + e.amount;
  }

  // Generate proofs for each entry
  const claims: ProofOutput["claims"] = {};
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const leaf  = leafBuffers[i];
    const proof = tree.getProof(leaf).map((p) => "0x" + p.data.toString("hex"));

    if (!claims[entry.address]) claims[entry.address] = {};
    claims[entry.address][entry.token] = {
      amount: entry.amount.toString(),
      proof,
    };
  }

  return {
    merkleRoot: root,
    totalPerToken: Object.fromEntries(
      Object.entries(totalPerToken).map(([k, v]) => [k, v.toString()])
    ),
    leafCount:   entries.length,
    generatedAt: new Date().toISOString(),
    claims,
  };
}

async function main() {
  const args      = process.argv.slice(2);
  const inputIdx  = args.indexOf("--input");
  const outputIdx = args.indexOf("--output");

  const inputFile  = inputIdx  !== -1 ? args[inputIdx  + 1] : "balances.csv";
  const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : "proofs.json";

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    console.error("Create a CSV with columns: address,token,amount");
    process.exit(1);
  }

  console.log(`Reading balances from: ${inputFile}`);
  const entries = parseCSV(inputFile);
  console.log(`Parsed ${entries.length} claim entries`);

  const output = generateMerkleOutput(entries);

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

  console.log("\n✅ Merkle root generated successfully");
  console.log("   Merkle root:", output.merkleRoot);
  console.log("   Leaf count: ", output.leafCount);
  console.log("   Tokens:     ", Object.keys(output.totalPerToken).join(", "));
  console.log("\n   Totals per token:");
  for (const [token, total] of Object.entries(output.totalPerToken)) {
    console.log(`     ${token}: ${total}`);
  }
  console.log(`\n✅ Proofs written to: ${outputFile}`);
  console.log("\nNext step:");
  console.log("  Pass the Merkle root to createClaimEvent() on the Cold Safe:");
  console.log(`  merkleRoot: "${output.merkleRoot}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});