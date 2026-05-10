import { NextResponse, type NextRequest } from "next/server";
import { jsonError, sanitizeError } from "@/lib/api";
import { getMintManagerStatus } from "@/lib/chain/serverMint";
import { assertAdmin } from "@/lib/security/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertAdmin(request);
    const status = await getMintManagerStatus();
    return NextResponse.json(status);
  } catch (error) {
    return jsonError(sanitizeError(error), 401);
  }
}
