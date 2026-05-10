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
      const grouped = new Map<
        string,
        {
          walletAddress: string;
          tweetId: string;
          score: number;
          mintAmount: number;
          summonCount: number;
          hasMock: boolean;
          hasReal: boolean;
          createdAt: Date;
        }
      >();

      for (const record of getMockStore().mints.values()) {
        const current = grouped.get(record.walletAddress);
        const amount = Number(record.amount || record.shares || 0);
        if (!current) {
          grouped.set(record.walletAddress, {
            walletAddress: record.walletAddress,
            tweetId: record.tweetId || "",
            score: record.score,
            mintAmount: amount,
            summonCount: 1,
            hasMock: Boolean(record.isMock),
            hasReal: !record.isMock,
            createdAt: record.createdAt
          });
          continue;
        }

        current.mintAmount += amount;
        current.summonCount += 1;
        current.hasMock ||= Boolean(record.isMock);
        current.hasReal ||= !record.isMock;
        if (record.score > current.score) {
          current.score = record.score;
          current.tweetId = record.tweetId || "";
        }
        if (record.createdAt > current.createdAt) current.createdAt = record.createdAt;
      }

      return NextResponse.json({
        rows: Array.from(grouped.values()).sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.mintAmount !== a.mintAmount) return b.mintAmount - a.mintAmount;
          return b.summonCount - a.summonCount;
        })
      });
    }

    const records = await prisma.mintRecord.findMany({
      where: { status: MintStatus.success },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 250
    });

    const grouped = new Map<
      string,
      {
        walletAddress: string;
        tweetId: string;
        score: number;
        mintAmount: number;
        summonCount: number;
        hasMock: boolean;
        hasReal: boolean;
        createdAt: Date;
      }
    >();

    for (const record of records) {
      const current = grouped.get(record.walletAddress);
      const amount = Number(record.amount || record.shares || 0);
      const score = record.score ?? 0;
      if (!current) {
        grouped.set(record.walletAddress, {
          walletAddress: record.walletAddress,
          tweetId: record.tweetId || record.id,
          score,
          mintAmount: amount,
          summonCount: 1,
          hasMock: record.isMock,
          hasReal: !record.isMock,
          createdAt: record.createdAt
        });
        continue;
      }

      current.mintAmount += amount;
      current.summonCount += 1;
      current.hasMock ||= record.isMock;
      current.hasReal ||= !record.isMock;
      if (score > current.score) {
        current.score = score;
        current.tweetId = record.tweetId || record.id;
      }
      if (record.createdAt > current.createdAt) current.createdAt = record.createdAt;
    }

    const rows = Array.from(grouped.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.mintAmount !== a.mintAmount) return b.mintAmount - a.mintAmount;
      return b.summonCount - a.summonCount;
    });

    return NextResponse.json({ rows });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
