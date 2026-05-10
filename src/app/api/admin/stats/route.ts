import { NextResponse, type NextRequest } from "next/server";
import { MintStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import { assertAdmin } from "@/lib/security/admin";
import { getMintConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request);

    const [mints, totalMintCount, users, verifications, config] = await Promise.all([
      prisma.mintRecord.findMany({
        where: { status: MintStatus.success },
        orderBy: { createdAt: "desc" },
        take: 1000
      }),
      prisma.mintRecord.count({
        where: { status: MintStatus.success }
      }),
      prisma.user.count(),
      prisma.tweetVerification.findMany({
        orderBy: { createdAt: "desc" },
        take: 25
      }),
      getMintConfig()
    ]);

    const totalMintAmount = mints.reduce((sum, record) => sum + Number(record.amount), 0);

    return NextResponse.json({
      totalMintCount,
      totalMintAmount,
      totalUsers: users,
      recentVerifications: verifications,
      config
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 401);
  }
}
