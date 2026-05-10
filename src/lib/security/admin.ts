import type { NextRequest } from "next/server";
import { isProduction, requireServerEnv } from "@/lib/env";

export function assertAdmin(request: NextRequest) {
  const configured = isProduction() ? requireServerEnv("ADMIN_KEY") : process.env.ADMIN_KEY;
  if (!configured) {
    throw new Error("ADMIN_KEY is not configured");
  }

  const supplied = request.headers.get("x-admin-key");
  if (!supplied || supplied !== configured) {
    throw new Error("Invalid admin key");
  }
}

