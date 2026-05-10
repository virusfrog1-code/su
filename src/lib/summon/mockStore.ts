import { amountForScore, multiplierForScore } from "@/lib/config";
import {
  DEFAULT_MINT_RULES,
  type MintMode,
  type MintRules,
  shareUnitsToShares
} from "@/lib/mint/rules";
import { assertProductionDatabaseAvailable, isEnabled, isProduction } from "@/lib/env";

type MockNonce = {
  walletAddress: string;
  xUserId?: string;
  nonce: string;
  mode: MintMode;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
};

type MockVerification = {
  walletAddress: string;
  xUserId?: string;
  xUsername?: string;
  tweetId: string;
  tweetUrl: string;
  tweetText: string;
  valid: boolean;
  reason: string;
  score: number;
  mintMultiplier: number;
  nonce: string;
  estimatedMintAmount: string;
  createdAt: Date;
};

type MockMint = {
  walletAddress: string;
  xUserId?: string;
  tweetId: string;
  mode: MintMode;
  nonce: string;
  shares: string;
  shareUnits: number;
  priceWei: string;
  totalPaidWei: string;
  amount?: string;
  score: number;
  mintMultiplier: number;
  txHash: string;
  isMock?: boolean;
  createdAt: Date;
};

type MockPreparedMint = {
  prepareId: string;
  walletAddress: string;
  mode: MintMode;
  shareUnits: number;
  tweetId?: string;
  nonce: string;
  totalWei: string;
  deadline: number;
  used: boolean;
  createdAt: Date;
};

type MockBinding = {
  walletAddress: string;
  xUserId: string;
  xUsername?: string;
  bindTweetId?: string;
  bindCode: string;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockBindStart = {
  walletAddress: string;
  bindCode: string;
  createdAt: Date;
  expiresAt: Date;
};

type MockWalletStats = {
  walletAddress: string;
  paidStandardUnits: number;
  paidFallbackUnits: number;
  freeShareUnitsClaimed: number;
  totalShareUnitsMinted: number;
};

type MockGlobalStats = {
  totalShareUnitsMinted: number;
  totalPaidWei: string;
};

type MockStore = {
  nonces: Map<string, MockNonce>;
  verifications: Map<string, MockVerification>;
  mints: Map<string, MockMint>;
  bindingsByWallet: Map<string, MockBinding>;
  bindingsByXUserId: Map<string, MockBinding>;
  bindStarts: Map<string, MockBindStart>;
  preparedMints: Map<string, MockPreparedMint>;
  walletStats: Map<string, MockWalletStats>;
  globalStats: MockGlobalStats;
  rules: MintRules;
};

const globalForMockStore = globalThis as unknown as {
  summonMockStore?: MockStore;
};

export function shouldUseMockStore() {
  if (process.env.DATABASE_URL) return false;
  if (!isProduction()) return true;
  assertProductionDatabaseAvailable();
  if (!isEnabled(process.env.ENABLE_MOCK_MINT)) {
    throw new Error("DATABASE_URL is required in production when ENABLE_MOCK_MINT is not true");
  }
  return isEnabled(process.env.ALLOW_PRODUCTION_MOCK) && isEnabled(process.env.ENABLE_MOCK_MINT);
}

export function getMockStore() {
  if (!globalForMockStore.summonMockStore) {
    globalForMockStore.summonMockStore = {
      nonces: new Map(),
      verifications: new Map(),
      mints: new Map(),
      bindingsByWallet: new Map(),
      bindingsByXUserId: new Map(),
      bindStarts: new Map(),
      preparedMints: new Map(),
      walletStats: new Map(),
      globalStats: {
        totalShareUnitsMinted: 0,
        totalPaidWei: "0"
      },
      rules: DEFAULT_MINT_RULES
    };
  }

  return globalForMockStore.summonMockStore;
}

export function getMockEstimatedMintAmount(score: number, baseMintAmount = 1_000_000) {
  return String(amountForScore(baseMintAmount, score));
}

export function getMockScore() {
  const score = 86;
  return {
    valid: true,
    score,
    mintMultiplier: multiplierForScore(score),
    style: "meme-native",
    reason: "Mock Grok score: AI-native, meme-ready, and contains the required summon proof."
  };
}

export function getOrCreateMockWalletStats(walletAddress: string) {
  const store = getMockStore();
  const existing = store.walletStats.get(walletAddress);
  if (existing) return existing;
  const created = {
    walletAddress,
    paidStandardUnits: 0,
    paidFallbackUnits: 0,
    freeShareUnitsClaimed: 0,
    totalShareUnitsMinted: 0
  };
  store.walletStats.set(walletAddress, created);
  return created;
}

export function mockStatsResponse(walletAddress: string) {
  const store = getMockStore();
  const stats = getOrCreateMockWalletStats(walletAddress);
  const binding = store.bindingsByWallet.get(walletAddress);
  return {
    walletAddress,
    xBinding: binding
      ? {
          bound: binding.verified,
          xUserId: binding.xUserId,
          xUsername: binding.xUsername
        }
      : { bound: false },
    paidStandardShares: shareUnitsToShares(stats.paidStandardUnits),
    paidFallbackShares: shareUnitsToShares(stats.paidFallbackUnits),
    freeSharesClaimed: shareUnitsToShares(stats.freeShareUnitsClaimed),
    remainingStandardShares: shareUnitsToShares(
      Math.max(0, store.rules.maxStandardShareUnits - stats.paidStandardUnits)
    ),
    remainingFallbackShares: shareUnitsToShares(
      Math.max(0, store.rules.maxFallbackShareUnits - stats.paidFallbackUnits)
    ),
    canClaimFree: Boolean(binding?.verified) && stats.freeShareUnitsClaimed === 0
  };
}

export type { MockBinding, MockMint, MockNonce, MockPreparedMint, MockVerification };
