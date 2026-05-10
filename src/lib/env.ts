export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function requireServerEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server env: ${name}`);
  }
  return value;
}

export function optionalServerEnv(name: string) {
  return process.env[name] || "";
}

export function publicProjectName() {
  return process.env.NEXT_PUBLIC_PROJECT_NAME || "SUMMON";
}

export function publicRequiredHashtag() {
  return process.env.NEXT_PUBLIC_REQUIRED_HASHTAG || "#SUMMON";
}

export function publicRequiredSecondaryHashtag() {
  return process.env.NEXT_PUBLIC_REQUIRED_SECONDARY_HASHTAG || "#GrokMint";
}

export function publicRequiredPhrase() {
  return process.env.NEXT_PUBLIC_REQUIRED_PHRASE || "Post to Summon";
}

export function publicSummonXHandle() {
  return process.env.NEXT_PUBLIC_SUMMON_X_HANDLE || "Summon_eth";
}

export function publicGrokXHandle() {
  return process.env.NEXT_PUBLIC_GROK_X_HANDLE || "grok";
}

export function isEnabled(value: string | undefined) {
  return value === "true" || value === "1";
}

export function isRequired(value: string | undefined, defaultValue = true) {
  if (value === undefined || value === "") return defaultValue;
  return isEnabled(value);
}

export function requireOfficialMention() {
  return isRequired(process.env.REQUIRE_OFFICIAL_MENTION, true);
}

export function requireGrokMention() {
  return isRequired(process.env.REQUIRE_GROK_MENTION, true);
}

export function requireRequiredHashtags() {
  return isRequired(process.env.REQUIRE_REQUIRED_HASHTAGS, true);
}

export function requireWalletShortInTweet() {
  return isRequired(process.env.REQUIRE_WALLET_SHORT_IN_TWEET, true);
}

export function requireOfficialFollow() {
  return isRequired(process.env.REQUIRE_OFFICIAL_FOLLOW, true);
}

export function assertProductionMockAllowed(mockName: string, enabledValue: string | undefined) {
  if (isProduction() && isEnabled(enabledValue) && !isEnabled(process.env.ALLOW_PRODUCTION_MOCK)) {
    throw new Error(`${mockName} is enabled in production but ALLOW_PRODUCTION_MOCK is not true`);
  }
}

export function assertProductionDatabaseAvailable() {
  if (isProduction() && !process.env.DATABASE_URL && !isEnabled(process.env.ALLOW_PRODUCTION_MOCK)) {
    throw new Error("DATABASE_URL is required in production unless ALLOW_PRODUCTION_MOCK is true");
  }
}
