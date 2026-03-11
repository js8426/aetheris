# Cetheris\agent-beta\probe_snx.py

"""
Synthetix PerpsMarket probe — Base Sepolia
Run: python probe_snx.py
"""
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
import os
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

RPC = os.getenv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org")
PERPS_PROXY = "0x0aacb1DDCF65d8347e3a2585cD78b423987cA04d"

w3 = Web3(Web3.HTTPProvider(RPC, request_kwargs={"timeout": 10}))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
print(f"Connected: {w3.is_connected()}  block: {w3.eth.block_number}")

# Minimal ABI — just the functions we want to probe
ABI = [
    {
        "name": "getMarkets",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "marketIds", "type": "uint256[]"}],
    },
    {
        "name": "name",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [{"name": "", "type": "string"}],
    },
    {
        "name": "currentFundingRate",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [{"name": "", "type": "int256"}],
    },
    {
        "name": "indexPrice",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "getMarketSummary",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "marketId", "type": "uint128"}],
        "outputs": [
            {
                "name": "",
                "type": "tuple",
                "components": [
                    {"name": "skew",                   "type": "int256"},
                    {"name": "size",                   "type": "uint256"},
                    {"name": "maxOpenInterest",        "type": "uint256"},
                    {"name": "currentFundingRate",     "type": "int256"},
                    {"name": "currentFundingVelocity", "type": "int256"},
                    {"name": "indexPrice",             "type": "uint256"},
                ],
            }
        ],
    },
]

contract = w3.eth.contract(
    address=Web3.to_checksum_address(PERPS_PROXY),
    abi=ABI,
)

# 1. Get all market IDs
print("\n--- getMarkets() ---")
try:
    market_ids = contract.functions.getMarkets().call()
    print(f"Market IDs: {market_ids}")
except Exception as e:
    print(f"FAILED: {e}")
    market_ids = []

# 2. For each market, get name + funding rate
print("\n--- Per-market details ---")
for mid in market_ids:
    try:
        mname = contract.functions.name(mid).call()
    except Exception as e:
        mname = f"(name error: {e})"
    try:
        rate_raw = contract.functions.currentFundingRate(mid).call()
        rate_8h  = rate_raw / 1e18 * 8 * 3600 * 100
    except Exception as e:
        rate_8h = f"(rate error: {e})"
    try:
        price_raw = contract.functions.indexPrice(mid).call()
        price     = price_raw / 1e18
    except Exception as e:
        price = f"(price error: {e})"
    print(f"  id={mid:>6}  name={mname:<10}  price=${price}  8h_rate={rate_8h}")

# 3. Try getMarketSummary on each found market
print("\n--- getMarketSummary() ---")
for mid in market_ids:
    try:
        s = contract.functions.getMarketSummary(mid).call()
        print(f"  id={mid}  indexPrice={s[5]/1e18:.2f}  fundingRate8h={s[3]/1e18*8*3600*100:.6f}%")
    except Exception as e:
        print(f"  id={mid}  FAILED: {e}")

# 4. Also try market ID 100 explicitly in case it's not listed
print("\n--- Explicit test: market ID 100 ---")
try:
    s = contract.functions.getMarketSummary(100).call()
    print(f"  id=100  indexPrice={s[5]/1e18:.2f}  OK")
except Exception as e:
    print(f"  id=100  FAILED: {e}")