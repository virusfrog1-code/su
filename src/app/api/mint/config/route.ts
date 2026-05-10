import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MINT_RULES, shareUnitsToShares } from "@/lib/mint/rules";
import { canUseMockMint, getMintChainId } from "@/lib/chain/serverMint";
import { jsonError, sanitizeError } from "@/lib/api";
import { isEnabled, isProduction } from "@/lib/env";
import { getMockStore, shouldUseMockStore } from "@/lib/summon/mockStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const xMockEnabled = isEnabled(process.env.ENABLE_MOCK_X) || (!isProduction() && !process.env.X_BEARER_TOKEN);
    const xFollowCheckMock = xMockEnabled && isEnabled(process.env.ENABLE_MOCK_X_FOLLOW ?? "true");
    if (shouldUseMockStore()) {
      const store = getMockStore();
      const isMockMint = canUseMockMint();
      return NextResponse.json({
        ...store.rules,
        totalSharesMinted: shareUnitsToShares(store.globalStats.totalShareUnitsMinted),
        mockMode: isMockMint,
        isMockMint,
        xFollowCheckMock,
        chainId: getMintChainId(),
        contractAddress: process.env.MINT_MANAGER_ADDRESS || ""
      });
    }

    const [config, globalStats] = await Promise.all([
      prisma.mintConfig.findFirst(),
      prisma.globalMintStats.findFirst()
    ]);
    const rules = config
      ? {
          totalSharesCap: config.totalSharesCap,
          totalShareUnitsCap: config.totalShareUnitsCap,
          standardPriceWei: config.standardPriceWei,
          standardPricePerUnitWei: config.standardPricePerUnitWei,
          fallbackPriceWei: config.fallbackPriceWei,
          fallbackPricePerUnitWei: config.fallbackPricePerUnitWei,
          maxStandardSharesPerWallet: config.maxStandardSharesPerWallet,
          maxStandardShareUnits: config.maxStandardShareUnits,
          maxFallbackSharesPerWallet: config.maxFallbackSharesPerWallet,
          maxFallbackShareUnits: config.maxFallbackShareUnits,
          freeSharesPerWalletX: config.freeSharesPerWalletX,
          freeShareUnits: config.freeShareUnits,
          paused: config.paused
        }
      : DEFAULT_MINT_RULES;

    const isMockMint = canUseMockMint();
    return NextResponse.json({
      ...rules,
      totalSharesMinted: globalStats?.totalSharesMinted ?? "0",
      mockMode: isMockMint,
      isMockMint,
      xFollowCheckMock,
      chainId: getMintChainId(),
      contractAddress: process.env.MINT_MANAGER_ADDRESS || ""
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
