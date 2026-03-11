# Aetheris\aetheris-agent-alpha\monitor\flashbots_submitter.py

"""
Aetheris Security Agent V — Flashbots Bundle Submitter

When the Threat Analysis Engine determines a threat score >= threshold,
this service submits the executeExit() transaction via Flashbots instead
of the public mempool.

WHY FLASHBOTS:
  On a public blockchain, every pending transaction sits in a waiting area
  called the mempool before it gets included in a block. Anyone can see
  every transaction in the mempool in real time. An attacker who sees your
  exit transaction coming can immediately submit their own drain transaction
  with a higher gas fee, causing it to be processed first (this is called
  front-running). By the time your exit transaction executes, the funds
  are already gone.

  Flashbots solves this by sending the transaction directly to block
  builders through a private encrypted channel. The transaction never
  appears in the public mempool. Attackers cannot see it coming. The
  first time anyone knows about the exit is when the block is already
  finalized and the funds are already in the Cold Safe.

HOW IT WORKS:
  1. Build the executeExit() transaction (signed but not broadcast)
  2. Wrap it in a Flashbots "bundle" (one or more transactions as a unit)
  3. Simulate the bundle locally to verify it will succeed
  4. Send the bundle to the Flashbots relay for the next N blocks
  5. If not included, retry for up to MAX_RETRY_BLOCKS blocks
  6. Confirm inclusion and report result

IMPORTANT:
  Flashbots on Base uses the Base builder network, not Ethereum mainnet.
  The relay URL for Base is: https://relay.flashbots.net (for Base Mainnet)
  Base Sepolia testnet does not support Flashbots — use public RPC for testing.

Dependencies:
    pip install web3 eth-account aiohttp structlog python-dotenv tenacity
"""

import asyncio
import json
import os
import time
from dataclasses import dataclass
from typing import Optional

import aiohttp
import structlog
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_defunct
from tenacity import retry, stop_after_attempt, wait_fixed
from web3 import Web3
from web3.types import TxParams

load_dotenv()

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)
log = structlog.get_logger("aetheris.flashbots")


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
class Config:
    # RPC endpoint for Base Mainnet
    BASE_RPC_URL: str = os.getenv("BASE_RPC_PRIMARY", "https://mainnet.base.org")

    # Flashbots relay endpoint for Base
    # Base uses the same Flashbots relay as Ethereum but targets Base builders
    FLASHBOTS_RELAY_URL: str = os.getenv(
        "FLASHBOTS_RELAY_URL",
        "https://relay.flashbots.net"
    )

    # The executor wallet — must have EXECUTOR_ROLE on ProofOfExit contract
    EXECUTOR_PRIVATE_KEY: str = os.getenv("EXECUTOR_PRIVATE_KEY", "")

    # A separate "reputation" key used to sign Flashbots requests
    # This can be any wallet — it does not need ETH or any on-chain role
    # It identifies your bundles to Flashbots for reputation tracking
    FLASHBOTS_AUTH_KEY: str = os.getenv("FLASHBOTS_AUTH_KEY", "")

    # ProofOfExit contract address (deployed on Base)
    PROOF_OF_EXIT_ADDRESS: str = os.getenv("PROOF_OF_EXIT_ADDRESS", "")

    # How many consecutive blocks to attempt bundle inclusion before giving up
    MAX_RETRY_BLOCKS: int = int(os.getenv("FLASHBOTS_MAX_RETRY_BLOCKS", "25"))

    # Gas limit for the executeExit transaction
    EXIT_GAS_LIMIT: int = int(os.getenv("EXIT_GAS_LIMIT", "500000"))

    # Priority fee (tip) to incentivize builders to include our bundle
    # Higher tip = higher chance of inclusion in the next block
    PRIORITY_FEE_GWEI: int = int(os.getenv("PRIORITY_FEE_GWEI", "3"))

    # Whether we are on testnet (disables Flashbots, uses public RPC instead)
    IS_TESTNET: bool = os.getenv("IS_TESTNET", "false").lower() == "true"


# ─────────────────────────────────────────────────────────────────────────────
# ProofOfExit ABI — only the functions we call
# ─────────────────────────────────────────────────────────────────────────────
PROOF_OF_EXIT_ABI = [
    {
        "name": "executeExit",
        "type": "function",
        "inputs": [
            {"name": "maliciousContract", "type": "address"},
            {"name": "threatScore",       "type": "uint256"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    },
    {
        "name": "canExit",
        "type": "function",
        "inputs": [{"name": "monitoredContract", "type": "address"}],
        "outputs": [
            {"name": "eligible", "type": "bool"},
            {"name": "reason",   "type": "string"},
        ],
        "stateMutability": "view",
    },
    {
        "name": "getThreatScore",
        "type": "function",
        "inputs": [{"name": "monitoredContract", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class ExitRequest:
    """A request to execute Proof of Exit against a malicious contract."""
    malicious_contract: str
    threat_score:       int
    requested_at:       int  # Unix timestamp


@dataclass
class BundleResult:
    """Result of a Flashbots bundle submission attempt."""
    success:        bool
    bundle_hash:    Optional[str]
    included_block: Optional[int]
    tx_hash:        Optional[str]
    error:          Optional[str]
    attempts:       int
    elapsed_seconds: float


# ─────────────────────────────────────────────────────────────────────────────
# Flashbots Bundle Submitter
# ─────────────────────────────────────────────────────────────────────────────
class FlashbotsSubmitter:
    """
    Builds, signs, simulates, and submits Flashbots bundles for exit transactions.

    A Flashbots bundle is a list of one or more transactions submitted together.
    Either all transactions in the bundle are included in a block, or none are.
    This is important for the exit — we never want a partial execution.
    """

    def __init__(self):
        self._w3 = Web3(Web3.HTTPProvider(Config.BASE_RPC_URL))

        if not Config.EXECUTOR_PRIVATE_KEY:
            raise ValueError("EXECUTOR_PRIVATE_KEY not set in environment")

        self._executor   = Account.from_key(Config.EXECUTOR_PRIVATE_KEY)
        self._auth_key   = (
            Account.from_key(Config.FLASHBOTS_AUTH_KEY)
            if Config.FLASHBOTS_AUTH_KEY
            else Account.from_key(Config.EXECUTOR_PRIVATE_KEY)
        )

        self._contract = self._w3.eth.contract(
            address=Web3.to_checksum_address(Config.PROOF_OF_EXIT_ADDRESS),
            abi=PROOF_OF_EXIT_ABI,
        )

        log.info(
            "flashbots_submitter_initialized",
            executor=self._executor.address,
            auth_signer=self._auth_key.address,
            relay=Config.FLASHBOTS_RELAY_URL,
            testnet=Config.IS_TESTNET,
        )

    async def submit_exit(self, request: ExitRequest) -> BundleResult:
        """
        Main entry point. Validates eligibility, builds the transaction,
        and submits via Flashbots (or public RPC on testnet).
        """
        start = time.time()
        log.info(
            "exit_submission_started",
            contract=request.malicious_contract,
            score=request.threat_score,
        )

        # Step 1: Verify on-chain eligibility before spending gas building the bundle
        eligible, reason = await self._check_eligibility(request.malicious_contract)
        if not eligible:
            return BundleResult(
                success=False,
                bundle_hash=None,
                included_block=None,
                tx_hash=None,
                error=f"Exit not eligible: {reason}",
                attempts=0,
                elapsed_seconds=time.time() - start,
            )

        # Step 2: Build the signed transaction
        signed_tx = await self._build_signed_tx(request)

        # Step 3: On testnet, skip Flashbots and use public RPC
        if Config.IS_TESTNET:
            return await self._submit_public(signed_tx, start)

        # Step 4: Submit via Flashbots private relay
        return await self._submit_flashbots(signed_tx, start)

    async def _check_eligibility(self, contract: str) -> tuple[bool, str]:
        """Check on-chain that the exit is currently possible."""
        try:
            result = self._contract.functions.canExit(
                Web3.to_checksum_address(contract)
            ).call()
            return result[0], result[1]
        except Exception as e:
            return False, str(e)

    async def _build_signed_tx(self, request: ExitRequest) -> bytes:
        """
        Build and sign the executeExit() transaction.
        The transaction is signed but NOT broadcast — we hand the raw bytes
        to Flashbots which decides when and how to include it.
        """
        nonce     = self._w3.eth.get_transaction_count(self._executor.address)
        base_fee  = self._w3.eth.get_block("latest")["baseFeePerGas"]
        priority  = Web3.to_wei(Config.PRIORITY_FEE_GWEI, "gwei")
        max_fee   = base_fee * 2 + priority  # 2x base fee buffer for inclusion

        tx: TxParams = self._contract.functions.executeExit(
            Web3.to_checksum_address(request.malicious_contract),
            request.threat_score,
        ).build_transaction({
            "from":                 self._executor.address,
            "nonce":                nonce,
            "gas":                  Config.EXIT_GAS_LIMIT,
            "maxFeePerGas":         max_fee,
            "maxPriorityFeePerGas": priority,
            "chainId":              self._w3.eth.chain_id,
        })

        signed = self._executor.sign_transaction(tx)

        log.info(
            "exit_tx_built",
            contract=request.malicious_contract,
            nonce=nonce,
            max_fee_gwei=Web3.from_wei(max_fee, "gwei"),
            gas_limit=Config.EXIT_GAS_LIMIT,
        )

        return signed.raw_transaction

    async def _submit_flashbots(self, signed_tx: bytes, start: float) -> BundleResult:
        """
        Submit the signed transaction as a Flashbots bundle.

        Process:
          1. Wrap the transaction in a bundle
          2. Sign the bundle payload with our auth key (proves identity to Flashbots)
          3. Simulate the bundle — if simulation fails, abort (saves wasted gas)
          4. Send the bundle targeting the next block
          5. Poll for inclusion for up to MAX_RETRY_BLOCKS blocks
          6. If not included, retarget at next block and retry
        """
        current_block = self._w3.eth.block_number
        bundle_txs    = [{"signed_transaction": "0x" + signed_tx.hex()}]
        attempts      = 0

        async with aiohttp.ClientSession() as session:

            # ── Simulate first ──────────────────────────────────────────────
            sim_result = await self._simulate_bundle(session, bundle_txs, current_block + 1)
            if not sim_result.get("success"):
                error = sim_result.get("error", "Simulation failed")
                log.error("bundle_simulation_failed", error=error)
                return BundleResult(
                    success=False,
                    bundle_hash=None,
                    included_block=None,
                    tx_hash=None,
                    error=f"Simulation failed: {error}",
                    attempts=0,
                    elapsed_seconds=time.time() - start,
                )

            log.info("bundle_simulation_passed", gas_used=sim_result.get("gas_used"))

            # ── Submit and retry until included or max blocks reached ────────
            for attempt in range(Config.MAX_RETRY_BLOCKS):
                target_block = current_block + attempt + 1
                attempts    += 1

                bundle_hash = await self._send_bundle(session, bundle_txs, target_block)

                if not bundle_hash:
                    log.warning("bundle_send_failed", attempt=attempt, target_block=target_block)
                    continue

                log.info(
                    "bundle_submitted",
                    bundle_hash=bundle_hash,
                    target_block=target_block,
                    attempt=attempt + 1,
                )

                # Wait for target block to be mined
                await self._wait_for_block(target_block)

                # Check if our bundle was included
                included, tx_hash = await self._check_inclusion(bundle_txs)
                if included:
                    elapsed = time.time() - start
                    log.info(
                        "exit_included_in_block",
                        block=target_block,
                        tx_hash=tx_hash,
                        attempts=attempts,
                        elapsed_seconds=elapsed,
                    )
                    return BundleResult(
                        success=True,
                        bundle_hash=bundle_hash,
                        included_block=target_block,
                        tx_hash=tx_hash,
                        error=None,
                        attempts=attempts,
                        elapsed_seconds=elapsed,
                    )

                log.info(
                    "bundle_not_included_retrying",
                    target_block=target_block,
                    attempt=attempt + 1,
                    max_attempts=Config.MAX_RETRY_BLOCKS,
                )

        # Exhausted all retry blocks
        log.error(
            "exit_submission_failed",
            attempts=attempts,
            elapsed_seconds=time.time() - start,
        )
        return BundleResult(
            success=False,
            bundle_hash=None,
            included_block=None,
            tx_hash=None,
            error=f"Bundle not included after {attempts} blocks",
            attempts=attempts,
            elapsed_seconds=time.time() - start,
        )

    async def _simulate_bundle(
        self,
        session: aiohttp.ClientSession,
        bundle_txs: list[dict],
        block_number: int,
    ) -> dict:
        """
        Ask Flashbots to simulate the bundle without broadcasting it.
        Returns success=True and gas_used if the simulation passes.
        Returns success=False and error if the simulation reverts.
        """
        payload  = self._build_rpc_payload(
            method="eth_callBundle",
            params=[{
                "txs":              [t["signed_transaction"] for t in bundle_txs],
                "blockNumber":      hex(block_number),
                "stateBlockNumber": "latest",
            }]
        )
        headers  = self._build_headers(json.dumps(payload))

        try:
            async with session.post(
                Config.FLASHBOTS_RELAY_URL,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                data = await resp.json()
                result = data.get("result", {})

                if "error" in data:
                    return {"success": False, "error": data["error"]}

                # Check if any transaction in the bundle reverted
                results = result.get("results", [])
                for r in results:
                    if r.get("revert"):
                        return {"success": False, "error": f"Reverted: {r['revert']}"}

                total_gas = sum(r.get("gasUsed", 0) for r in results)
                return {"success": True, "gas_used": total_gas}

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _send_bundle(
        self,
        session: aiohttp.ClientSession,
        bundle_txs: list[dict],
        target_block: int,
    ) -> Optional[str]:
        """Send the bundle to the Flashbots relay targeting a specific block."""
        payload = self._build_rpc_payload(
            method="eth_sendBundle",
            params=[{
                "txs":         [t["signed_transaction"] for t in bundle_txs],
                "blockNumber": hex(target_block),
            }]
        )
        headers = self._build_headers(json.dumps(payload))

        try:
            async with session.post(
                Config.FLASHBOTS_RELAY_URL,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                data = await resp.json()
                return data.get("result", {}).get("bundleHash")
        except Exception as e:
            log.error("flashbots_send_error", error=str(e))
            return None

    async def _check_inclusion(self, bundle_txs: list[dict]) -> tuple[bool, Optional[str]]:
        """Check if our transaction was included in the latest block."""
        try:
            # Compute tx hash from the signed transaction bytes
            raw_hex = bundle_txs[0]["signed_transaction"]
            tx_hash = Web3.keccak(hexstr=raw_hex).hex()
            receipt = self._w3.eth.get_transaction_receipt(tx_hash)
            if receipt and receipt["status"] == 1:
                return True, tx_hash
            return False, None
        except Exception:
            return False, None

    async def _wait_for_block(self, target_block: int):
        """Poll until the chain reaches the target block number."""
        while self._w3.eth.block_number < target_block:
            await asyncio.sleep(0.5)

    def _build_rpc_payload(self, method: str, params: list) -> dict:
        """Build a standard JSON-RPC payload."""
        return {
            "jsonrpc": "2.0",
            "id":      1,
            "method":  method,
            "params":  params,
        }

    def _build_headers(self, payload_body: str) -> dict:
        """
        Build Flashbots request headers.

        Flashbots requires the request body to be signed with the auth key.
        This signature proves the bundle came from a known sender and enables
        Flashbots to build a reputation score for your bundles over time.
        Higher reputation = higher priority for inclusion.
        """
        body_hash  = Web3.keccak(text=payload_body).hex()
        message    = encode_defunct(text=body_hash)
        signed     = self._auth_key.sign_message(message)
        signature  = f"{self._auth_key.address}:{signed.signature.hex()}"

        return {
            "Content-Type":       "application/json",
            "X-Flashbots-Signature": signature,
        }

    async def _submit_public(self, signed_tx: bytes, start: float) -> BundleResult:
        """
        Testnet fallback — submit via public RPC (no Flashbots on testnet).
        Front-running is not a concern on testnet since there are no real funds.
        """
        try:
            tx_hash = self._w3.eth.send_raw_transaction(signed_tx)
            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

            success = receipt["status"] == 1
            log.info(
                "public_rpc_submission",
                tx_hash=tx_hash.hex(),
                success=success,
                gas_used=receipt["gasUsed"],
            )
            return BundleResult(
                success=success,
                bundle_hash=None,
                included_block=receipt["blockNumber"],
                tx_hash=tx_hash.hex(),
                error=None if success else "Transaction reverted",
                attempts=1,
                elapsed_seconds=time.time() - start,
            )
        except Exception as e:
            return BundleResult(
                success=False,
                bundle_hash=None,
                included_block=None,
                tx_hash=None,
                error=str(e),
                attempts=1,
                elapsed_seconds=time.time() - start,
            )


# ─────────────────────────────────────────────────────────────────────────────
# Exit Coordinator — integrates with the Threat Analysis Engine
# ─────────────────────────────────────────────────────────────────────────────
class ExitCoordinator:
    """
    Listens to Redis for threshold-breached alerts from the Threat Analysis
    Engine and triggers the Flashbots exit submission.

    The Threat Analysis Engine publishes to Redis channel "aetheris:exit_requests"
    when a threat score >= threshold is confirmed on-chain.
    This coordinator picks that up and fires the Flashbots bundle.
    """

    def __init__(self):
        self._submitter = FlashbotsSubmitter()

    async def run(self):
        import redis.asyncio as aioredis

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        redis     = await aioredis.from_url(redis_url, decode_responses=True)
        pubsub    = redis.pubsub()
        await pubsub.subscribe("aetheris:exit_requests")

        log.info("exit_coordinator_started")

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            try:
                data = json.loads(message["data"])
                request = ExitRequest(
                    malicious_contract=data["malicious_contract"],
                    threat_score=int(data["threat_score"]),
                    requested_at=int(data.get("requested_at", time.time())),
                )
                log.warning(
                    "exit_request_received",
                    contract=request.malicious_contract,
                    score=request.threat_score,
                )
                result = await self._submitter.submit_exit(request)
                log.info("exit_result", **result.__dict__)

            except Exception as e:
                log.error("exit_coordinator_error", error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────
async def main():
    coordinator = ExitCoordinator()
    await coordinator.run()


if __name__ == "__main__":
    asyncio.run(main())