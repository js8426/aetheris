# Aetheris\aetheris-protocol\analyzer\threat_engine.py
# Aetheris\aetheris-agent-alpha\analyzer\threat_engine.py
"""
Aetheris Security Agent V — Threat Analysis Engine

Receives alerts from the Contract Monitor and produces a threat score (0-100)
using four independent analysis tools:

  Tool 1: Slither    — Static analysis (AST-level vulnerability detection)
  Tool 2: Mythril    — Symbolic execution (finds exploitable code paths)
  Tool 3: AI Pattern — Claude API pattern recognition against known exploits
  Tool 4: Behavioral — Compares activity to historical attack fingerprints

Scoring:
  0-24   → SAFE       (no action)
  25-49  → SUSPICIOUS (increase monitoring frequency)
  50-74  → ELEVATED   (alert guardians)
  75-94  → CRITICAL   (autonomous exit eligible)
  95-100 → EMERGENCY  (guardian exit immediately)

When score ≥ threshold, posts result on-chain to ProofOfExit.updateThreatScore()
which makes the autonomous executor eligible to fire.

Dependencies:
    pip install fastapi uvicorn anthropic web3 slither-analyzer mythril
    pip install aiohttp redis structlog python-dotenv tenacity
"""

import asyncio
import hashlib
import json
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import anthropic
import aiohttp
import redis.asyncio as aioredis
import structlog
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential
from web3 import Web3

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
)
log = structlog.get_logger("aetheris.threat_engine")


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
class Config:
    ANTHROPIC_API_KEY:    str   = os.getenv("ANTHROPIC_API_KEY", "")
    BASE_RPC_URL:         str   = os.getenv("BASE_RPC_PRIMARY", "https://mainnet.base.org")
    REDIS_URL:            str   = os.getenv("REDIS_URL", "redis://localhost:6379")
    PROOF_OF_EXIT_ADDR:   str   = os.getenv("PROOF_OF_EXIT_ADDRESS", "")
    EXECUTOR_PRIVATE_KEY: str   = os.getenv("EXECUTOR_PRIVATE_KEY", "")
    AUTONOMOUS_EXIT:      bool  = os.getenv("AUTONOMOUS_EXIT", "true").lower() == "true"
    SCORE_THRESHOLD:      int   = int(os.getenv("SCORE_THRESHOLD", "75"))
    BASESCAN_API_KEY:     str   = os.getenv("BASESCAN_API_KEY", "")


# ─────────────────────────────────────────────────────────────────────────────
# Known attack patterns — fingerprints of historical exploits
# ─────────────────────────────────────────────────────────────────────────────
KNOWN_ATTACK_PATTERNS = [
    {
        "name": "Proxy Implementation Swap",
        "indicators": ["implementation_swap", "bytecode_change"],
        "weight": 40,
        "description": "EIP-1967 implementation slot changed — most common rug-pull vector",
    },
    {
        "name": "Ownership Transfer to Unknown",
        "indicators": ["ownership_transfer"],
        "weight": 30,
        "description": "Owner transferred to address with no prior protocol interaction",
    },
    {
        "name": "Admin Role Granted at Unusual Hour",
        "indicators": ["admin_role_change"],
        "weight": 20,
        "description": "ADMIN/GUARDIAN role granted outside normal business hours",
    },
    {
        "name": "Contract Selfdestruct",
        "indicators": ["contract_selfdestruct"],
        "weight": 60,
        "description": "Contract code removed — immediate critical alert",
    },
    {
        "name": "Large Unexpected Outflow",
        "indicators": ["large_outflow"],
        "weight": 35,
        "description": "Token transfer >10% of TVL in single transaction",
    },
    {
        "name": "Slither High Severity Finding",
        "indicators": ["slither_high"],
        "weight": 25,
        "description": "Slither detected high-severity vulnerability in new implementation",
    },
    {
        "name": "Mythril Exploitable Path",
        "indicators": ["mythril_exploit"],
        "weight": 35,
        "description": "Mythril found concrete exploit path via symbolic execution",
    },
]

# Maximum achievable score (sum of all weights, capped at 100)
MAX_RAW_SCORE = sum(p["weight"] for p in KNOWN_ATTACK_PATTERNS)


# ─────────────────────────────────────────────────────────────────────────────
# API Models
# ─────────────────────────────────────────────────────────────────────────────
class AlertPayload(BaseModel):
    alert_id:    str
    severity:    str
    change_type: str
    contract:    str
    description: str
    block_number: int
    timestamp:   int
    old_value:   Optional[str] = None
    new_value:   Optional[str] = None
    tx_hash:     Optional[str] = None


class ThreatResponse(BaseModel):
    alert_id:         str
    contract:         str
    threat_score:     int
    threat_level:     str
    tool_scores:      dict
    matched_patterns: list[str]
    recommendation:   str
    on_chain_posted:  bool
    analysis_ms:      int


# ─────────────────────────────────────────────────────────────────────────────
# Tool 1: Slither Static Analysis
# ─────────────────────────────────────────────────────────────────────────────
class SlitherAnalyzer:
    """
    Runs Slither static analysis on a contract's source code or bytecode.
    In production, fetches verified source from Basescan API.
    """

    async def analyze(self, contract_address: str, new_implementation: Optional[str]) -> dict:
        target = new_implementation or contract_address

        # Fetch verified source from Basescan
        source = await self._fetch_source(target)
        if not source:
            log.info("slither_no_source", contract=target)
            return {"score": 0, "findings": [], "error": "No verified source available"}

        # Write to temp file and run Slither
        with tempfile.NamedTemporaryFile(suffix=".sol", mode="w", delete=False) as f:
            f.write(source)
            tmpfile = f.name

        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["slither", tmpfile, "--json", "-", "--no-fail-pedantic"],
                capture_output=True, text=True, timeout=120
            )

            findings = self._parse_output(result.stdout)
            score    = self._score_findings(findings)

            return {"score": score, "findings": findings, "raw": result.stdout[:2000]}

        except subprocess.TimeoutExpired:
            return {"score": 0, "findings": [], "error": "Slither timed out"}
        except FileNotFoundError:
            return {"score": 0, "findings": [], "error": "Slither not installed"}
        except Exception as e:
            return {"score": 0, "findings": [], "error": str(e)}
        finally:
            os.unlink(tmpfile)

    async def _fetch_source(self, address: str) -> Optional[str]:
        """Fetch verified Solidity source from Basescan."""
        if not Config.BASESCAN_API_KEY:
            return None
        url = (
            f"https://api.basescan.org/api"
            f"?module=contract&action=getsourcecode"
            f"&address={address}&apikey={Config.BASESCAN_API_KEY}"
        )
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    data = await resp.json()
                    if data["status"] == "1" and data["result"]:
                        return data["result"][0].get("SourceCode", "")
        except Exception as e:
            log.error("basescan_fetch_error", error=str(e))
        return None

    def _parse_output(self, stdout: str) -> list[dict]:
        """Parse Slither JSON output into structured findings."""
        try:
            data = json.loads(stdout)
            return data.get("results", {}).get("detectors", [])
        except Exception:
            return []

    def _score_findings(self, findings: list[dict]) -> int:
        """Convert Slither findings into a partial threat score contribution."""
        score = 0
        for finding in findings:
            impact = finding.get("impact", "").lower()
            if impact == "high":
                score += 25
            elif impact == "medium":
                score += 10
            elif impact == "low":
                score += 3
        return min(score, 35)  # Cap contribution at 35


# ─────────────────────────────────────────────────────────────────────────────
# Tool 2: Mythril Symbolic Execution
# ─────────────────────────────────────────────────────────────────────────────
class MythrilAnalyzer:
    """
    Runs Mythril symbolic execution to find concrete exploit paths.
    Works on deployed bytecode — no source code required.
    """

    async def analyze(self, contract_address: str) -> dict:
        try:
            result = await asyncio.to_thread(
                subprocess.run,
                [
                    "myth", "analyze",
                    f"--rpc", Config.BASE_RPC_URL,
                    f"--address", contract_address,
                    "--output", "json",
                    "--execution-timeout", "90",
                    "--max-depth", "12",
                ],
                capture_output=True, text=True, timeout=120
            )

            issues  = self._parse_output(result.stdout)
            score   = self._score_issues(issues)

            return {"score": score, "issues": issues, "raw": result.stdout[:2000]}

        except subprocess.TimeoutExpired:
            return {"score": 0, "issues": [], "error": "Mythril timed out"}
        except FileNotFoundError:
            return {"score": 0, "issues": [], "error": "Mythril not installed"}
        except Exception as e:
            return {"score": 0, "issues": [], "error": str(e)}

    def _parse_output(self, stdout: str) -> list[dict]:
        try:
            data = json.loads(stdout)
            return data.get("issues", [])
        except Exception:
            return []

    def _score_issues(self, issues: list[dict]) -> int:
        score = 0
        critical_swcs = {
            "SWC-101",  # Integer overflow
            "SWC-106",  # Unprotected selfdestruct
            "SWC-107",  # Reentrancy
            "SWC-115",  # Authorization through tx.origin
            "SWC-124",  # Write to arbitrary storage
        }
        for issue in issues:
            swc = issue.get("swc-id", "")
            sev = issue.get("severity", "").lower()
            if f"SWC-{swc}" in critical_swcs or sev == "high":
                score += 35
            elif sev == "medium":
                score += 15
            elif sev == "low":
                score += 5
        return min(score, 35)


# ─────────────────────────────────────────────────────────────────────────────
# Tool 3: AI Pattern Recognition (Claude API)
# ─────────────────────────────────────────────────────────────────────────────
class AIPatternAnalyzer:
    """
    Uses Claude to compare the detected change against a database of known
    DeFi attack patterns, rug-pull fingerprints, and exploit signatures.
    """

    # Curated knowledge base of real DeFi attacks fed into every analysis
    ATTACK_DATABASE = """
KNOWN DEFI ATTACK PATTERNS:

1. PROXY SWAP RUG-PULL (e.g., Uranium Finance $57M, 2021):
   - Proxy admin calls upgradeTo() pointing to malicious impl
   - Malicious impl has emergencyWithdrawAll() callable only by owner
   - Usually executed at 3-5 AM UTC on weekends
   - Preceded by: large LP removal, team wallet activity

2. OWNERSHIP TRANSFER ATTACK (e.g., Meerkat Finance $31M, 2021):
   - Owner transferred to fresh wallet (0 prior txns)
   - New owner immediately calls privileged drain function
   - Gap between transfer and drain: < 60 seconds

3. INITIALIZE EXPLOIT (e.g., Punk Protocol $8.9M, 2021):
   - Upgradeable contract with unprotected initialize()
   - Attacker calls initialize() on new implementation before proxy points to it
   - Takes ownership, then drains via admin functions

4. STORAGE COLLISION (e.g., Audius $6M, 2022):
   - Malicious upgrade introduces storage variables that overlap existing ones
   - Overwrites governance threshold to 1 vote
   - Passes malicious proposal immediately

5. SELFDESTRUCT DRAIN (multiple incidents):
   - Implementation contract selfdestructs
   - Proxy calls now fall through to zero-address
   - Any ETH sent to proxy is permanently lost

6. TIMELOCK BYPASS:
   - Admin proposes innocuous upgrade (audit-friendly)
   - Cancels it and immediately proposes malicious upgrade
   - Social engineering of community to ignore second proposal
"""

    def __init__(self):
        if Config.ANTHROPIC_API_KEY:
            self._client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)
        else:
            self._client = None

    async def analyze(self, alert: AlertPayload) -> dict:
        if not self._client:
            return {"score": 0, "analysis": "AI analysis disabled (no API key)", "patterns": []}

        prompt = f"""You are a DeFi security expert analyzing a live security alert from the Aetheris Protocol monitoring system.

SECURITY ALERT:
- Contract: {alert.contract}
- Change Type: {alert.change_type}
- Description: {alert.description}
- Old Value: {alert.old_value or 'N/A'}
- New Value: {alert.new_value or 'N/A'}
- Block: {alert.block_number}

{self.ATTACK_DATABASE}

Analyze this alert against the known attack patterns above and any other DeFi security knowledge you have.

Respond ONLY with a valid JSON object (no markdown, no preamble):
{{
  "threat_score": <integer 0-35>,
  "matched_patterns": [<list of pattern names that match>],
  "reasoning": "<2-3 sentence explanation>",
  "confidence": "<LOW|MEDIUM|HIGH>",
  "recommended_action": "<MONITOR|ALERT_GUARDIANS|EXECUTE_EXIT>"
}}"""

        try:
            response = await asyncio.to_thread(
                self._client.messages.create,
                model="claude-sonnet-4-6",
                max_tokens=512,
                messages=[{"role": "user", "content": prompt}]
            )

            text = response.content[0].text.strip()
            data = json.loads(text)

            return {
                "score":    min(int(data.get("threat_score", 0)), 35),
                "analysis": data.get("reasoning", ""),
                "patterns": data.get("matched_patterns", []),
                "confidence": data.get("confidence", "LOW"),
                "recommendation": data.get("recommended_action", "MONITOR"),
            }

        except json.JSONDecodeError as e:
            log.error("ai_json_parse_error", error=str(e))
            return {"score": 0, "analysis": "Failed to parse AI response", "patterns": []}
        except Exception as e:
            log.error("ai_analysis_error", error=str(e))
            return {"score": 0, "analysis": str(e), "patterns": []}


# ─────────────────────────────────────────────────────────────────────────────
# Tool 4: Behavioral Analysis — fingerprint matching
# ─────────────────────────────────────────────────────────────────────────────
class BehavioralAnalyzer:
    """
    Pattern-matches the alert against known attack fingerprints.
    Pure rules-based — fastest tool, runs first.
    """

    def analyze(self, alert: AlertPayload) -> dict:
        change_type = alert.change_type.lower()
        matched     = []
        raw_score   = 0

        for pattern in KNOWN_ATTACK_PATTERNS:
            for indicator in pattern["indicators"]:
                if indicator in change_type or indicator in alert.description.lower():
                    matched.append(pattern["name"])
                    raw_score += pattern["weight"]
                    break

        # Normalize to 0-30 contribution
        score = min(int((raw_score / MAX_RAW_SCORE) * 30), 30)

        return {
            "score":           score,
            "matched_patterns": matched,
            "raw_score":       raw_score,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Score Aggregator — combines all four tools
# ─────────────────────────────────────────────────────────────────────────────
class ScoreAggregator:
    """
    Combines scores from all four tools into a final threat score.

    Weights:
      Slither (static)      → up to 25 points
      Mythril (symbolic)    → up to 25 points
      AI pattern            → up to 25 points
      Behavioral            → up to 25 points
      Total:                  100 points maximum
    """

    WEIGHTS = {
        "slither":    0.25,
        "mythril":    0.25,
        "ai":         0.25,
        "behavioral": 0.25,
    }

    def aggregate(self, scores: dict) -> int:
        total = 0
        for tool, weight in self.WEIGHTS.items():
            tool_score = scores.get(tool, {}).get("score", 0)
            # Each tool scores 0-35 internally; normalize to its weighted contribution
            total += min(tool_score, 35) * weight * (100 / 35)
        return min(int(total), 100)

    @staticmethod
    def threat_level(score: int) -> str:
        if score >= 95: return "EMERGENCY"
        if score >= 75: return "CRITICAL"
        if score >= 50: return "ELEVATED"
        if score >= 25: return "SUSPICIOUS"
        return "SAFE"

    @staticmethod
    def recommendation(score: int) -> str:
        if score >= 95: return "EXECUTE_GUARDIAN_EXIT_IMMEDIATELY"
        if score >= 75: return "AUTONOMOUS_EXIT_ELIGIBLE — executor may fire"
        if score >= 50: return "ALERT_GUARDIANS — manual review required"
        if score >= 25: return "INCREASE_MONITORING — watch closely"
        return "CONTINUE_NORMAL_MONITORING"


# ─────────────────────────────────────────────────────────────────────────────
# On-Chain Reporter — posts threat score to ProofOfExit contract
# ─────────────────────────────────────────────────────────────────────────────
PROOF_OF_EXIT_ABI = [
    {
        "name": "updateThreatScore",
        "type": "function",
        "inputs": [
            {"name": "monitoredContract", "type": "address"},
            {"name": "score",             "type": "uint256"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    }
]


class OnChainReporter:
    """Posts threat scores to the ProofOfExit contract on-chain."""

    def __init__(self):
        self._w3 = Web3(Web3.HTTPProvider(Config.BASE_RPC_URL))
        self._contract = None
        self._account  = None

        if Config.PROOF_OF_EXIT_ADDR and Config.EXECUTOR_PRIVATE_KEY:
            self._contract = self._w3.eth.contract(
                address=Web3.to_checksum_address(Config.PROOF_OF_EXIT_ADDR),
                abi=PROOF_OF_EXIT_ABI,
            )
            self._account = self._w3.eth.account.from_key(Config.EXECUTOR_PRIVATE_KEY)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10))
    async def post_score(self, contract_address: str, score: int) -> bool:
        if not self._contract or not self._account:
            log.warning("on_chain_reporter_not_configured")
            return False

        try:
            nonce = self._w3.eth.get_transaction_count(self._account.address)
            tx    = self._contract.functions.updateThreatScore(
                Web3.to_checksum_address(contract_address),
                score,
            ).build_transaction({
                "from":     self._account.address,
                "nonce":    nonce,
                "gas":      100_000,
                "gasPrice": self._w3.eth.gas_price,
            })

            signed  = self._account.sign_transaction(tx)
            tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

            log.info(
                "threat_score_posted_on_chain",
                contract=contract_address,
                score=score,
                tx_hash=tx_hash.hex(),
                gas_used=receipt["gasUsed"],
            )
            return True

        except Exception as e:
            log.error("on_chain_post_error", error=str(e))
            raise


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Application — receives alerts from the Contract Monitor
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Aetheris Threat Analysis Engine",
    description="Security scoring engine for the Aetheris Proof of Exit system",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Initialize analyzers (singletons)
slither    = SlitherAnalyzer()
mythril    = MythrilAnalyzer()
ai_analyzer = AIPatternAnalyzer()
behavioral = BehavioralAnalyzer()
aggregator = ScoreAggregator()
reporter   = OnChainReporter()


@app.post("/analyze", response_model=ThreatResponse)
async def analyze_alert(alert: AlertPayload):
    """
    Analyze a security alert and return a threat score.
    Called by the Contract Monitor whenever a change is detected.
    """
    start_ms = int(time.time() * 1000)
    log.info("analysis_started", alert_id=alert.alert_id, contract=alert.contract)

    new_impl = alert.new_value if alert.change_type == "IMPLEMENTATION_SWAP" else None

    # Run all four tools concurrently for speed
    slither_task    = slither.analyze(alert.contract, new_impl)
    mythril_task    = mythril.analyze(new_impl or alert.contract)
    ai_task         = ai_analyzer.analyze(alert)
    behavioral_result = behavioral.analyze(alert)  # Synchronous — runs instantly

    slither_result, mythril_result, ai_result = await asyncio.gather(
        slither_task, mythril_task, ai_task
    )

    tool_scores = {
        "slither":    slither_result,
        "mythril":    mythril_result,
        "ai":         ai_result,
        "behavioral": behavioral_result,
    }

    final_score = aggregator.aggregate(tool_scores)
    level       = ScoreAggregator.threat_level(final_score)
    rec         = ScoreAggregator.recommendation(final_score)

    # Combine matched patterns from all tools
    all_patterns = (
        behavioral_result.get("matched_patterns", []) +
        ai_result.get("patterns", [])
    )

    elapsed_ms = int(time.time() * 1000) - start_ms

    log.info(
        "analysis_complete",
        alert_id=alert.alert_id,
        contract=alert.contract,
        score=final_score,
        level=level,
        elapsed_ms=elapsed_ms,
    )

    # Post score on-chain if it meets the threshold
    on_chain = False
    if final_score >= Config.SCORE_THRESHOLD:
        log.warning(
            "threshold_breached",
            contract=alert.contract,
            score=final_score,
            threshold=Config.SCORE_THRESHOLD,
        )
        on_chain = await reporter.post_score(alert.contract, final_score)

    return ThreatResponse(
        alert_id=alert.alert_id,
        contract=alert.contract,
        threat_score=final_score,
        threat_level=level,
        tool_scores={
            k: {"score": v.get("score", 0), "findings_count": len(v.get("findings", v.get("issues", v.get("patterns", []))))}
            for k, v in tool_scores.items()
        },
        matched_patterns=list(set(all_patterns)),
        recommendation=rec,
        on_chain_posted=on_chain,
        analysis_ms=elapsed_ms,
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "aetheris-threat-engine", "ts": int(time.time())}


@app.get("/scores/{contract_address}")
async def get_score(contract_address: str):
    """Get the current threat score for a contract from Redis cache."""
    redis = await aioredis.from_url(Config.REDIS_URL, decode_responses=True)
    key   = f"aetheris:threat_score:{contract_address.lower()}"
    score = await redis.get(key)
    await redis.close()
    return {"contract": contract_address, "score": int(score) if score else 0}


if __name__ == "__main__":
    uvicorn.run("threat_engine:app", host="0.0.0.0", port=8001, reload=False, workers=2)