import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MINT_RULES, shareUnitsToShares } from "@/lib/mint/rules";
import { jsonError, sanitizeError } from "@/lib/api";
import { mockStatsResponse, shouldUseMockStore } from "@/lib/summon/mockStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const walletParam = request.nextUrl.searchParams.get("walletAddress") || "";
    if (!isAddress(walletParam)) return jsonError("Invalid wallet address");
    const walletAddress = getAddress(walletParam);

    if (shouldUseMockStore()) return NextResponse.json(mockStatsResponse(walletAddress));

    const [config, stats, binding] = await Promise.all([
      prisma.mintConfig.findFirst(),
      prisma.walletMintStats.findUnique({ where: { walletAddress } }),
      prisma.walletXBinding.findUnique({ where: { walletAddress } })
    ]);
    const rules = config ?? DEFAULT_MINT_RULES;
    const paidStandardUnits = stats?.paidStandardUnits ?? 0;
    const paidFallbackUnits = stats?.paidFallbackUnits ?? 0;
    const freeShareUnitsClaimed = stats?.freeShareUnitsClaimed ?? 0;

    return NextResponse.json({
      walletAddress,
      xBinding: binding?.verified
        ? {
            bound: true,
            xUserId: binding.xUserId,
            xUsername: binding.xUsername
          }
        : { bound: false },
      paidStandardShares: shareUnitsToShares(paidStandardUnits),
      paidFallbackShares: shareUnitsToShares(paidFallbackUnits),
      freeSharesClaimed: shareUnitsToShares(freeShareUnitsClaimed),
      remainingStandardShares: shareUnitsToShares(
        Math.max(0, rules.maxStandardShareUnits - paidStandardUnits)
      ),
      remainingFallbackShares: shareUnitsToShares(
        Math.max(0, rules.maxFallbackShareUnits - paidFallbackUnits)
      ),
      canClaimFree: Boolean(binding?.verified) && freeShareUnitsClaimed === 0
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}

