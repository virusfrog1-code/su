import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { type MintMode } from "@/lib/mint/rules";
import { getMockStore, shouldUseMockStore } from "@/lib/summon/mockStore";
import { createSummonNonce, nonceExpiry } from "@/lib/summon/nonce";
import { buildTweetIntentUrl, buildTweetText } from "@/lib/summon/tweetTemplate";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "create-nonce", 20, 60_000);
  if (!limited.ok) return jsonError("Too many summon code requests", 429);

  try {
    const body = (await request.json()) as { walletAddress?: string; mode?: MintMode };
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return jsonError("Invalid wallet address");
    }

    const walletAddress = getAddress(body.walletAddress);
    const mode = body.mode || "X_POST";
    if (mode !== "X_POST" && mode !== "NO_X_FALLBACK") return jsonError("Invalid mint mode");
    const nonce = createSummonNonce();
    const expiresAt = nonceExpiry(30);
    const tweetText = buildTweetText(walletAddress, nonce);

    if (shouldUseMockStore()) {
      const binding = getMockStore().bindingsByWallet.get(walletAddress);
      if (mode === "X_POST" && !binding?.verified) return jsonError("X account is not bound");
      getMockStore().nonces.set(nonce, {
        walletAddress,
        xUserId: binding?.xUserId,
        nonce,
        mode,
        used: false,
        expiresAt,
        createdAt: new Date()
      });

      return NextResponse.json({
        nonce,
        mode,
        expiresAt,
        tweetText,
        tweetIntentUrl: buildTweetIntentUrl(tweetText)
      });
    }

    await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress }
    });

    const binding = await prisma.walletXBinding.findUnique({ where: { walletAddress } });
    if (mode === "X_POST" && !binding?.verified) return jsonError("X account is not bound");

    await prisma.summonNonce.create({
      data: {
        walletAddress,
        xUserId: binding?.xUserId,
        nonce,
        mode,
        expiresAt
      }
    });

    return NextResponse.json({
      nonce,
      mode,
      expiresAt,
      tweetText,
      tweetIntentUrl: buildTweetIntentUrl(tweetText)
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
