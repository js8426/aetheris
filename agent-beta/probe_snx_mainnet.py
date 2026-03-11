# Aetheris\agent-beta\probe_snx_mainnet.py

"""
Synthetix PerpsMarket probe — Base MAINNET
Run: python probe_snx_mainnet.py
"""
from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware
import os
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

RPC = os.getenv("BASE_MAINNET_RPC_URL", "https://mainnet.base.org")
# Known Base mainnet PerpsMarketProxy candidates
CANDIDATES = [
    ("0x0A2AF931eFFd34b81ebcc57E3d3c9B1E1dE1C9Ce", "agent_beta.py config (⚠️ unverified)"),
    ("0x21c9A6B498Ef2d5C9e4c79B8Cf7D37D3B7c16E91", "Synthetix docs candidate A"),
    ("0xd762960c31210Cf5fBa0aaf946e24DC7573E4C8B", "Synthetix docs candidate B"),
]

ABI = [
    {"name": "getMarkets", "type": "function", "stateMutability": "view",
     "inputs": [], "outputs": [{"name": "marketIds", "type": "uint256[]"}]},
    {"name": "name", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "marketId", "type": "uint128"}], "outputs": [{"name": "", "type": "string"}]},
    {"name": "currentFundingRate", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "marketId", "type": "uint128"}], "outputs": [{"name": "", "type": "int256"}]},
    {"name": "indexPrice", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "marketId", "type": "uint128"}], "outputs": [{"name": "", "type": "uint256"}]},
    {"name": "getMarketSummary", "type": "function", "stateMutability": "view",
     "inputs": [{"name": "marketId", "type": "uint128"}],
     "outputs": [{"name": "", "type": "tuple", "components": [
         {"name": "skew",                   "type": "int256"},
         {"name": "size",                   "type": "uint256"},
         {"name": "maxOpenInterest",        "type": "uint256"},
         {"name": "currentFundingRate",     "type": "int256"},
         {"name": "currentFundingVelocity", "type": "int256"},
         {"name": "indexPrice",             "type": "uint256"},
     ]}]},
]

w3 = Web3(Web3.HTTPProvider(RPC, request_kwargs={"timeout": 10}))
w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
print(f"RPC: {RPC}")
print(f"Connected: {w3.is_connected()}  block: {w3.eth.block_number}\n")

for addr, label in CANDIDATES:
    print(f"{'='*60}")
    print(f"Address : {addr}")
    print(f"Label   : {label}")
    contract = w3.eth.contract(address=Web3.to_checksum_address(addr), abi=ABI)

    try:
        market_ids = contract.functions.getMarkets().call()
        print(f"Markets : {market_ids}")
    except Exception as e:
        print(f"getMarkets FAILED: {e}")
        market_ids = []

    for mid in market_ids:
        try:
            mname = contract.functions.name(mid).call()
        except:
            mname = "?"
        try:
            rate_raw = contract.functions.currentFundingRate(mid).call()
            rate_8h  = rate_raw / 1e18 * 8 * 3600 * 100
            rate_str = f"{rate_8h:.6f}%"
        except:
            rate_str = "?"
        try:
            price = contract.functions.indexPrice(mid).call() / 1e18
            price_str = f"${price:.2f}"
        except:
            price_str = "?"
        print(f"  id={mid:<6}  name={mname:<12}  price={price_str:<12}  8h_rate={rate_str}")

    # Always try market ID 100 explicitly
    try:
        s = contract.functions.getMarketSummary(100).call()
        print(f"  [explicit id=100]  indexPrice=${s[5]/1e18:.2f}  8h_rate={s[3]/1e18*8*3600*100:.6f}%  ✓")
    except Exception as e:
        print(f"  [explicit id=100]  FAILED: {e}")
    print()