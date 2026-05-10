import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { getMockStore, shouldUseMockStore } from "@/lib/summon/mockStore";
import { buildBindTweetText } from "@/lib/summon/tweetTemplate";

export const runtime = "nodejs";

function createBindCode() {
  return `BIND-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "x-bind-start", 10, 60_000);
  if (!limited.ok) return jsonError("Too many bind requests", 429);

  try {
    const body = (await request.json()) as { walletAddress?: string };
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return jsonError("Invalid wallet address");
    }

    const walletAddress = getAddress(body.walletAddress);
    const bindCode = createBindCode();
    const message = buildBindTweetText(walletAddress, bindCode);

    if (shouldUseMockStore()) {
      getMockStore().bindStarts.set(walletAddress, {
        walletAddress,
        bindCode,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      });
      return NextResponse.json({ bindCode, message });
    }

    const existing = await prisma.walletXBinding.findUnique({ where: { walletAddress } });
    if (existing?.verified) return jsonError("Wallet already has a verified X binding");

    await prisma.walletXBinding.upsert({
      where: { walletAddress },
      update: { bindCode, verified: false },
      create: { walletAddress, bindCode, verified: false }
    });

    return NextResponse.json({ bindCode, message });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
