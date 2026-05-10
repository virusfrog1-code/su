import { NextResponse } from "next/server";
import { MintStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import { getMockStore, shouldUseMockStore } from "@/lib/summon/mockStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (shouldUseMockStore()) {
      const store = getMockStore();
      const rows = Array.from(store.mints.values())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 50)
        .map((record) => ({
          walletAddress: record.walletAddress,
          tweetId: record.tweetId,
          tweetUrl: record.tweetId ? store.verifications.get(record.tweetId)?.tweetUrl || "" : "",
          score: record.score,
          amount: record.amount || record.shares,
          txHash: record.txHash,
          isMock: record.isMock,
          createdAt: record.createdAt
        }));
      return NextResponse.json({ rows });
    }

    const records = await prisma.mintRecord.findMany({
      where: { status: MintStatus.success },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const tweetIds = records.flatMap((record) => (record.tweetId ? [record.tweetId] : []));
    const verifications = await prisma.tweetVerification.findMany({
      where: { tweetId: { in: tweetIds } }
    });
    const verificationByTweetId = new Map(verifications.map((item) => [item.tweetId, item]));

    const rows = records.map((record) => ({
      walletAddress: record.walletAddress,
      tweetId: record.tweetId || record.id,
      tweetUrl: record.tweetId ? verificationByTweetId.get(record.tweetId)?.tweetUrl || "" : "",
      score: record.score ?? 0,
      amount: record.amount || record.shares,
      txHash: record.txHash,
      isMock: record.isMock,
      createdAt: record.createdAt
    }));

    return NextResponse.json({ rows });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
