// Aetheris\aetheris-frontend\lib\api.ts

// Typed API client for the Aetheris backend

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardData {
  address: string;
  axToken: { balance: string; balanceRaw: string };
  staking: { stakedAmount: string; tier: string; tierLevel: number; pendingRewards: string };
  profits: { deposited: string; claimable: string; totalClaimed: string };
}

export interface AgentStatus {
  address: string;
  agentAlpha: { active: boolean };
  agentV: { active: boolean; protectedSince: string | null };
}

export interface GlobalAgentStatus {
  agentAlpha: { active: boolean; totalProfitUSDC: string; strategy: string; supportedDexs: string[] };
  agentV: { active: boolean; monitoredContracts: number; lastScanTimestamp: string; threatLevel: string };
}

export interface Transaction {
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'CLAIM';
  amount: string;
  txHash: string;
  blockNumber: string;
}

export interface TransactionHistory {
  address: string;
  transactions: Transaction[];
  total: number;
}

export interface ProtocolStats {
  blockchain: { network: string; chainId: number; latestBlock: string; rpcStatus: string };
  protocol: { totalUsers: number; tvlUSDC: string; totalArbitrageProfit: string; totalTransactions: number; uptimePercent: number };
  timestamp: string;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export const aetherisApi = {
  getUserDashboard: (address: string) =>
    apiFetch<DashboardData>(`/user/${address}/dashboard`),

  getUserBalance: (address: string) =>
    apiFetch<{ address: string; ethBalance: string; ethBalanceWei: string }>(`/user/${address}/balance`),

  getAgentStatus: (address: string) =>
    apiFetch<AgentStatus>(`/agents/${address}/status`),

  getGlobalAgentStatus: () =>
    apiFetch<GlobalAgentStatus>('/agents/status'),

  getTransactions: (address: string, limit = 20) =>
    apiFetch<TransactionHistory>(`/user/${address}/transactions?limit=${limit}`),

  getProfits: (address: string) =>
    apiFetch<{ address: string; deposited: string; claimable: string; totalClaimed: string }>(`/profits/${address}`),

  getProtocolStats: () =>
    apiFetch<ProtocolStats>('/stats/protocol'),
};