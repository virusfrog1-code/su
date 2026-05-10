import { NextResponse, type NextRequest } from "next/server";
import { jsonError, sanitizeError } from "@/lib/api";
import { assertAdmin } from "@/lib/security/admin";
import { allowedConfigKey, setConfigValue } from "@/lib/config";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    assertAdmin(request);
    const body = (await request.json()) as { key?: string; value?: string };

    if (!body.key || !allowedConfigKey(body.key)) {
      return jsonError("Invalid config key");
    }

    if (typeof body.value !== "string") return jsonError("Invalid config value");

    const updated = await setConfigValue(body.key, body.value);
    return NextResponse.json({ config: updated });
  } catch (error) {
    return jsonError(sanitizeError(error), 401);
  }
}

