import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
      .replace(/0x[a-fA-F0-9]{64}/g, "[redacted-private-key]")
      .replace(/([?&](?:api[_-]?key|apikey|key|token)=)[^&\s]+/gi, "$1[redacted]")
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]");
  }
  return "Unexpected error";
}
