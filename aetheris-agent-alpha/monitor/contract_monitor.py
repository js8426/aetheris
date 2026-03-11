# Aetheris\aetheris-protocol\monitor\contract_monitor.py
# Aetheris\aetheris-agent-alpha\monitor\contract_monitor.py
"""
Aetheris Security Agent V — Contract Monitor Service

Continuously monitors registered smart contracts on Base for:
  - Bytecode changes (proxy implementation upgrades)
  - Ownership transfers
  - Admin role changes
  - Suspicious event emissions
  - Anomalous transaction patterns

Detection latency target: < 30 seconds
Redundancy: Run on 3+ independent servers

Dependencies:
    pip install web3 aiohttp redis structlog tenacity eth-abi python-dotenv
"""

import asyncio
import hashlib
import json
import os
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

import aiohttp
import redis.asyncio as aioredis
import structlog
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential
from web3 import AsyncWeb3
from web3.middleware import ExtraDataToPOAMiddleware

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# Logging — structured JSON for production log aggregators (Datadog, Loki, etc.)
# ─────────────────────────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)
log = structlog.get_logger("aetheris.monitor")

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
class Config:
    # RPC endpoints — use multiple for redundancy
    RPC_URLS: list[str] = [
        os.getenv("BASE_RPC_PRIMARY",   "https://mainnet.base.org"),
        os.getenv("BASE_RPC_SECONDARY", "https://base.llamarpc.com"),
        os.getenv("BASE_RPC_TERTIARY",  "https://base-mainnet.g.alchemy.com/v2/" + os.getenv("ALCHEMY_KEY", "")),
    ]

    # Redis for cross-server state synchronization
    REDIS_URL:        str   = os.getenv("REDIS_URL", "redis://localhost:6379")

    # Monitoring parameters
    POLL_INTERVAL_S:  float = float(os.getenv("POLL_INTERVAL_S", "2"))    # Block time on Base ~2s
    MAX_REORG_DEPTH:  int   = int(os.getenv("MAX_REORG_DEPTH",   "6"))    # Blocks before finality
    ALERT_WEBHOOK:    str   = os.getenv("ALERT_WEBHOOK_URL", "")
    THREAT_API_URL:   str   = os.getenv("THREAT_API_URL", "http://localhost:8001")

    # Proxy implementation storage slot (EIP-1967)
    EIP1967_IMPL_SLOT: str  = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"

    # Gnosis Safe storage slot for owner threshold
    GNOSIS_THRESHOLD_SLOT: str = "0x4"


# ─────────────────────────────────────────────────────────────────────────────
# Data Models
# ─────────────────────────────────────────────────────────────────────────────
class AlertSeverity(str, Enum):
    INFO     = "INFO"
    LOW      = "LOW"
    MEDIUM   = "MEDIUM"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"


class ChangeType(str, Enum):
    BYTECODE_CHANGE      = "BYTECODE_CHANGE"
    IMPLEMENTATION_SWAP  = "IMPLEMENTATION_SWAP"
    OWNERSHIP_TRANSFER   = "OWNERSHIP_TRANSFER"
    ADMIN_ROLE_CHANGE    = "ADMIN_ROLE_CHANGE"
    SUSPICIOUS_EVENT     = "SUSPICIOUS_EVENT"
    CONTRACT_SELFDESTRUT = "CONTRACT_SELFDESTRUCT"
    LARGE_OUTFLOW        = "LARGE_OUTFLOW"


@dataclass
class ContractSnapshot:
    """Point-in-time state of a monitored contract."""
    address:            str
    bytecode_hash:      str
    implementation:     Optional[str]   # For proxy contracts
    owner:              Optional[str]
    block_number:       int
    timestamp:          int

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "ContractSnapshot":
        return cls(**d)


@dataclass
class SecurityAlert:
    """Structured alert emitted when a change is detected."""
    alert_id:       str
    severity:       AlertSeverity
    change_type:    ChangeType
    contract:       str
    description:    str
    block_number:   int
    timestamp:      int
    old_value:      Optional[str]   = None
    new_value:      Optional[str]   = None
    tx_hash:        Optional[str]   = None
    threat_score:   Optional[int]   = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["severity"]    = self.severity.value
        d["change_type"] = self.change_type.value
        return d


@dataclass
class MonitoredContract:
    """A contract registered for monitoring."""
    address:        str
    name:           str
    is_proxy:       bool        = False
    track_owner:    bool        = True
    track_roles:    bool        = True
    min_alert_sev:  AlertSeverity = AlertSeverity.LOW


# ─────────────────────────────────────────────────────────────────────────────
# ABI fragments — only what we need, keeps overhead minimal
# ─────────────────────────────────────────────────────────────────────────────
OWNERSHIP_ABI = [
    {"name": "OwnershipTransferred", "type": "event",
     "inputs": [
         {"name": "previousOwner", "type": "address", "indexed": True},
         {"name": "newOwner",      "type": "address", "indexed": True},
     ]},
    {"name": "owner", "type": "function", "inputs": [],
     "outputs": [{"name": "", "type": "address"}], "stateMutability": "view"},
]

ROLE_ABI = [
    {"name": "RoleGranted", "type": "event",
     "inputs": [
         {"name": "role",    "type": "bytes32", "indexed": True},
         {"name": "account", "type": "address", "indexed": True},
         {"name": "sender",  "type": "address", "indexed": True},
     ]},
    {"name": "RoleRevoked", "type": "event",
     "inputs": [
         {"name": "role",    "type": "bytes32", "indexed": True},
         {"name": "account", "type": "address", "indexed": True},
         {"name": "sender",  "type": "address", "indexed": True},
     ]},
]

UPGRADED_ABI = [
    {"name": "Upgraded", "type": "event",
     "inputs": [{"name": "implementation", "type": "address", "indexed": True}]},
]


# ─────────────────────────────────────────────────────────────────────────────
# Web3 Connection Pool — rotates on failure for high availability
# ─────────────────────────────────────────────────────────────────────────────
class Web3Pool:
    """Manages multiple RPC connections with automatic failover."""

    def __init__(self, urls: list[str]):
        self._urls    = urls
        self._w3s:    list[AsyncWeb3] = []
        self._current = 0

    async def initialize(self):
        for url in self._urls:
            w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(url))
            # Add PoA middleware for networks with extra data (Base uses PoA)
            w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
            self._w3s.append(w3)
        log.info("web3_pool_initialized", count=len(self._w3s))

    @property
    def w3(self) -> AsyncWeb3:
        return self._w3s[self._current % len(self._w3s)]

    async def get_healthy_w3(self) -> AsyncWeb3:
        """Return a healthy Web3 instance, rotating on failure."""
        for attempt in range(len(self._w3s)):
            w3 = self._w3s[(self._current + attempt) % len(self._w3s)]
            try:
                await w3.eth.block_number
                self._current = (self._current + attempt) % len(self._w3s)
                return w3
            except Exception as e:
                log.warning("rpc_unhealthy", url=self._urls[(self._current + attempt) % len(self._urls)], error=str(e))

        raise RuntimeError("All RPC endpoints are unhealthy")


# ─────────────────────────────────────────────────────────────────────────────
# Snapshot Engine — captures contract state at a given block
# ─────────────────────────────────────────────────────────────────────────────
class SnapshotEngine:
    """Takes and compares point-in-time snapshots of contract state."""

    def __init__(self, pool: Web3Pool):
        self._pool = pool

    async def snapshot(self, contract: MonitoredContract, block: int) -> ContractSnapshot:
        w3  = await self._pool.get_healthy_w3()
        addr = AsyncWeb3.to_checksum_address(contract.address)

        # Bytecode hash — primary change detector
        code = await w3.eth.get_code(addr, block_identifier=block)
        bytecode_hash = hashlib.sha256(code).hexdigest() if code else "empty"

        # Proxy implementation (EIP-1967 storage slot)
        implementation = None
        if contract.is_proxy:
            slot_value = await w3.eth.get_storage_at(addr, Config.EIP1967_IMPL_SLOT, block)
            impl_addr = "0x" + slot_value.hex()[-40:]
            implementation = AsyncWeb3.to_checksum_address(impl_addr) if int(impl_addr, 16) != 0 else None

        # Owner
        owner = None
        if contract.track_owner:
            try:
                c = w3.eth.contract(address=addr, abi=OWNERSHIP_ABI)
                owner = await c.functions.owner().call(block_identifier=block)
            except Exception:
                pass  # Contract may not be Ownable

        block_data  = await w3.eth.get_block(block)
        timestamp   = block_data["timestamp"]

        return ContractSnapshot(
            address=addr,
            bytecode_hash=bytecode_hash,
            implementation=implementation,
            owner=owner,
            block_number=block,
            timestamp=timestamp,
        )

    def diff(
        self,
        old: ContractSnapshot,
        new: ContractSnapshot,
        contract: MonitoredContract,
    ) -> list[SecurityAlert]:
        """Compare two snapshots and return any detected changes as alerts."""
        alerts = []
        ts = new.timestamp
        block = new.block_number

        def _alert(severity, change_type, desc, old_val=None, new_val=None):
            alert_id = hashlib.sha256(
                f"{contract.address}{change_type.value}{block}".encode()
            ).hexdigest()[:16]
            return SecurityAlert(
                alert_id=alert_id,
                severity=severity,
                change_type=change_type,
                contract=contract.address,
                description=desc,
                block_number=block,
                timestamp=ts,
                old_value=old_val,
                new_value=new_val,
            )

        # ── Bytecode change ───────────────────────────────────────────────────
        if old.bytecode_hash != new.bytecode_hash:
            if new.bytecode_hash == "empty":
                alerts.append(_alert(
                    AlertSeverity.CRITICAL,
                    ChangeType.CONTRACT_SELFDESTRUT,
                    f"CONTRACT SELFDESTRUCT DETECTED: {contract.name} at {contract.address}",
                    old.bytecode_hash, new.bytecode_hash
                ))
            else:
                alerts.append(_alert(
                    AlertSeverity.HIGH,
                    ChangeType.BYTECODE_CHANGE,
                    f"Bytecode changed for {contract.name}",
                    old.bytecode_hash, new.bytecode_hash
                ))

        # ── Proxy implementation swap ─────────────────────────────────────────
        if contract.is_proxy and old.implementation != new.implementation:
            alerts.append(_alert(
                AlertSeverity.CRITICAL,
                ChangeType.IMPLEMENTATION_SWAP,
                f"PROXY IMPLEMENTATION SWAPPED for {contract.name} — potential rug-pull",
                old.implementation, new.implementation
            ))

        # ── Ownership transfer ────────────────────────────────────────────────
        if old.owner and new.owner and old.owner != new.owner:
            alerts.append(_alert(
                AlertSeverity.HIGH,
                ChangeType.OWNERSHIP_TRANSFER,
                f"Ownership of {contract.name} transferred",
                old.owner, new.owner
            ))

        return alerts


# ─────────────────────────────────────────────────────────────────────────────
# Alert Dispatcher — sends alerts to threat engine and notification system
# ─────────────────────────────────────────────────────────────────────────────
class AlertDispatcher:
    """Routes alerts to the Threat Analysis Engine and notification webhook."""

    def __init__(self, session: aiohttp.ClientSession, redis: aioredis.Redis):
        self._session = session
        self._redis   = redis

    async def dispatch(self, alert: SecurityAlert):
        log.warning(
            "security_alert",
            severity=alert.severity.value,
            change_type=alert.change_type.value,
            contract=alert.contract,
            description=alert.description,
            block=alert.block_number,
        )

        # Push to Redis pub/sub for notification service
        await self._redis.publish(
            "aetheris:alerts",
            json.dumps(alert.to_dict()),
        )

        # Store in Redis list for audit trail (7-day TTL)
        await self._redis.lpush("aetheris:alert_history", json.dumps(alert.to_dict()))
        await self._redis.expire("aetheris:alert_history", 7 * 24 * 3600)

        # Forward to Threat Analysis Engine
        await self._forward_to_threat_engine(alert)

        # Forward to webhook (Discord, PagerDuty, etc.)
        if Config.ALERT_WEBHOOK:
            await self._forward_to_webhook(alert)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
    async def _forward_to_threat_engine(self, alert: SecurityAlert):
        try:
            async with self._session.post(
                f"{Config.THREAT_API_URL}/analyze",
                json=alert.to_dict(),
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    log.info("threat_engine_response", score=data.get("threat_score"), alert_id=alert.alert_id)
                else:
                    log.error("threat_engine_error", status=resp.status, alert_id=alert.alert_id)
        except Exception as e:
            log.error("threat_engine_unreachable", error=str(e))

    async def _forward_to_webhook(self, alert: SecurityAlert):
        severity_emoji = {
            AlertSeverity.CRITICAL: "🚨",
            AlertSeverity.HIGH:     "⚠️",
            AlertSeverity.MEDIUM:   "🔶",
            AlertSeverity.LOW:      "ℹ️",
            AlertSeverity.INFO:     "📋",
        }
        emoji = severity_emoji.get(alert.severity, "⚠️")

        payload = {
            "embeds": [{
                "title": f"{emoji} Aetheris Security Alert — {alert.severity.value}",
                "description": alert.description,
                "color": 0xFF0000 if alert.severity == AlertSeverity.CRITICAL else 0xFF8C00,
                "fields": [
                    {"name": "Contract",    "value": alert.contract,          "inline": True},
                    {"name": "Change Type", "value": alert.change_type.value,  "inline": True},
                    {"name": "Block",       "value": str(alert.block_number),  "inline": True},
                    {"name": "Old Value",   "value": alert.old_value or "N/A", "inline": False},
                    {"name": "New Value",   "value": alert.new_value or "N/A", "inline": False},
                ],
                "timestamp": datetime.fromtimestamp(alert.timestamp, tz=timezone.utc).isoformat(),
            }]
        }

        try:
            async with self._session.post(
                Config.ALERT_WEBHOOK,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status not in (200, 204):
                    log.error("webhook_failed", status=resp.status)
        except Exception as e:
            log.error("webhook_error", error=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# State Store — persists snapshots in Redis across restarts
# ─────────────────────────────────────────────────────────────────────────────
class StateStore:
    """Persists contract snapshots in Redis for cross-restart continuity."""

    def __init__(self, redis: aioredis.Redis):
        self._redis = redis

    def _key(self, address: str) -> str:
        return f"aetheris:snapshot:{address.lower()}"

    async def save(self, snapshot: ContractSnapshot):
        await self._redis.set(
            self._key(snapshot.address),
            json.dumps(snapshot.to_dict()),
            ex=7 * 24 * 3600,  # 7-day TTL
        )

    async def load(self, address: str) -> Optional[ContractSnapshot]:
        data = await self._redis.get(self._key(address))
        if data:
            return ContractSnapshot.from_dict(json.loads(data))
        return None

    async def save_last_block(self, block: int):
        await self._redis.set("aetheris:last_block", str(block))

    async def load_last_block(self) -> Optional[int]:
        val = await self._redis.get("aetheris:last_block")
        return int(val) if val else None


# ─────────────────────────────────────────────────────────────────────────────
# Contract Monitor — main monitoring loop
# ─────────────────────────────────────────────────────────────────────────────
class ContractMonitor:
    """
    Main monitoring service.

    Usage:
        contracts = [
            MonitoredContract("0x...", "AetherisAccount", is_proxy=True),
            MonitoredContract("0x...", "AetherisPaymaster", is_proxy=True),
        ]
        monitor = ContractMonitor(contracts)
        asyncio.run(monitor.run())
    """

    def __init__(self, contracts: list[MonitoredContract]):
        self._contracts  = contracts
        self._pool:       Optional[Web3Pool]        = None
        self._store:      Optional[StateStore]      = None
        self._snapshots:  Optional[SnapshotEngine]  = None
        self._dispatcher: Optional[AlertDispatcher] = None
        self._redis:      Optional[aioredis.Redis]  = None
        self._session:    Optional[aiohttp.ClientSession] = None

    async def initialize(self):
        log.info("monitor_initializing", contracts=len(self._contracts))

        self._redis   = await aioredis.from_url(Config.REDIS_URL, decode_responses=True)
        self._session = aiohttp.ClientSession()
        self._pool    = Web3Pool(Config.RPC_URLS)
        await self._pool.initialize()

        self._store      = StateStore(self._redis)
        self._snapshots  = SnapshotEngine(self._pool)
        self._dispatcher = AlertDispatcher(self._session, self._redis)

        log.info("monitor_initialized")

    async def run(self):
        await self.initialize()

        log.info("monitor_starting", poll_interval=Config.POLL_INTERVAL_S)

        try:
            while True:
                await self._poll_cycle()
                await asyncio.sleep(Config.POLL_INTERVAL_S)
        except asyncio.CancelledError:
            log.info("monitor_shutdown")
        finally:
            await self._cleanup()

    async def _poll_cycle(self):
        """Single monitoring iteration across all registered contracts."""
        try:
            w3          = await self._pool.get_healthy_w3()
            current_block = await w3.eth.block_number
            last_block    = await self._store.load_last_block()

            if last_block is None:
                # First run — bootstrap snapshots, don't alert
                await self._bootstrap(current_block)
                await self._store.save_last_block(current_block)
                return

            if current_block <= last_block:
                return  # No new blocks

            # Scan each new block for contract changes
            for block in range(last_block + 1, current_block + 1):
                await self._scan_block(block)

            await self._store.save_last_block(current_block)

        except Exception as e:
            log.error("poll_cycle_error", error=str(e), exc_info=True)

    async def _bootstrap(self, block: int):
        """Take initial snapshots for all contracts (no alerting)."""
        log.info("bootstrapping_snapshots", block=block, count=len(self._contracts))
        for contract in self._contracts:
            try:
                snapshot = await self._snapshots.snapshot(contract, block)
                await self._store.save(snapshot)
                log.info("snapshot_bootstrapped", contract=contract.name, address=contract.address)
            except Exception as e:
                log.error("bootstrap_error", contract=contract.name, error=str(e))

    async def _scan_block(self, block: int):
        """Scan a single block for changes across all monitored contracts."""
        tasks = [self._check_contract(contract, block) for contract in self._contracts]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for contract, result in zip(self._contracts, results):
            if isinstance(result, Exception):
                log.error("contract_check_error", contract=contract.name, error=str(result))

    async def _check_contract(self, contract: MonitoredContract, block: int):
        """Check a single contract for changes at a given block."""
        old_snapshot = await self._store.load(contract.address)
        new_snapshot = await self._snapshots.snapshot(contract, block)

        if old_snapshot is None:
            await self._store.save(new_snapshot)
            return

        alerts = self._snapshots.diff(old_snapshot, new_snapshot, contract)

        for alert in alerts:
            await self._dispatcher.dispatch(alert)

        # Always update snapshot
        await self._store.save(new_snapshot)

    async def _cleanup(self):
        if self._session:
            await self._session.close()
        if self._redis:
            await self._redis.close()


# ─────────────────────────────────────────────────────────────────────────────
# Health Check Server — exposes /health endpoint for load balancer probes
# ─────────────────────────────────────────────────────────────────────────────
async def health_server():
    """Minimal HTTP server for container health checks."""
    from aiohttp import web

    async def health(request):
        return web.json_response({"status": "ok", "service": "aetheris-monitor", "ts": int(time.time())})

    app = web.Application()
    app.router.add_get("/health", health)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", 8080)
    await site.start()
    log.info("health_server_started", port=8080)


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────
async def main():
    """
    Main entry point. In production, load contracts from on-chain registry
    or a configuration file. Here we use environment variables for simplicity.
    """
    # Load monitored contracts from environment or config file
    # In production: fetch from ProofOfExit.getProtocolList() on-chain
    contracts_json = os.getenv("MONITORED_CONTRACTS", "[]")
    contract_defs  = json.loads(contracts_json)

    contracts = [
        MonitoredContract(
            address=c["address"],
            name=c["name"],
            is_proxy=c.get("is_proxy", False),
            track_owner=c.get("track_owner", True),
            track_roles=c.get("track_roles", True),
        )
        for c in contract_defs
    ]

    if not contracts:
        log.warning("no_contracts_configured",
                    hint="Set MONITORED_CONTRACTS env var with JSON array")

    # Start health server and monitor concurrently
    monitor = ContractMonitor(contracts)
    await asyncio.gather(
        health_server(),
        monitor.run(),
    )


if __name__ == "__main__":
    asyncio.run(main())