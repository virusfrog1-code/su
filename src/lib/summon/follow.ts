import {
  assertProductionMockAllowed,
  isEnabled,
  isProduction,
  optionalServerEnv,
  requireOfficialFollow
} from "@/lib/env";

export type OfficialFollowCheck = {
  checked: boolean;
  follows: boolean;
  method: "oauth" | "followers_lookup" | "mock" | "disabled";
  reason?: string;
};

export async function checkOfficialFollow(input: {
  xUserId: string;
  officialUserId: string;
}): Promise<OfficialFollowCheck> {
  if (!requireOfficialFollow()) {
    return { checked: false, follows: false, method: "disabled" };
  }

  const xMockEnabled = isEnabled(process.env.ENABLE_MOCK_X) || (!isProduction() && !process.env.X_BEARER_TOKEN);
  const mockFollowEnabled = xMockEnabled && isEnabled(process.env.ENABLE_MOCK_X_FOLLOW ?? "true");
  if (mockFollowEnabled) {
    assertProductionMockAllowed("ENABLE_MOCK_X", process.env.ENABLE_MOCK_X);
    assertProductionMockAllowed("ENABLE_MOCK_X_FOLLOW", process.env.ENABLE_MOCK_X_FOLLOW ?? "true");
    return { checked: true, follows: true, method: "mock" };
  }

  const bearerToken = optionalServerEnv("X_BEARER_TOKEN");
  const officialUserId = input.officialUserId || optionalServerEnv("SUMMON_X_USER_ID");
  if (!officialUserId) {
    return {
      checked: false,
      follows: false,
      method: "followers_lookup",
      reason: "SUMMON_X_USER_ID is required for official follow check"
    };
  }

  if (!bearerToken) {
    return {
      checked: false,
      follows: false,
      method: "followers_lookup",
      reason: "X follow check requires OAuth or elevated X API access"
    };
  }

  try {
    let paginationToken = "";
    for (let page = 0; page < 10; page += 1) {
      const url = new URL(`https://api.x.com/2/users/${input.xUserId}/following`);
      url.searchParams.set("max_results", "1000");
      url.searchParams.set("user.fields", "id");
      if (paginationToken) url.searchParams.set("pagination_token", paginationToken);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${bearerToken}` },
        cache: "no-store"
      });

      if (!response.ok) {
        const reason = response.status === 401 || response.status === 403
          ? "X follow check requires OAuth or elevated X API access"
          : `X follow check failed with status ${response.status}`;
        return { checked: false, follows: false, method: "followers_lookup", reason };
      }

      const payload = (await response.json()) as {
        data?: Array<{ id: string }>;
        meta?: { next_token?: string };
      };
      if (payload.data?.some((user) => user.id === officialUserId)) {
        return { checked: true, follows: true, method: "followers_lookup" };
      }

      paginationToken = payload.meta?.next_token || "";
      if (!paginationToken) break;
    }

    return {
      checked: true,
      follows: false,
      method: "followers_lookup",
      reason: "X account does not follow official account"
    };
  } catch {
    return {
      checked: false,
      follows: false,
      method: "followers_lookup",
      reason: isProduction()
        ? "X follow check requires OAuth or elevated X API access"
        : "X follow check failed"
    };
  }
}
