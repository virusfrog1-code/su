export type SummonTweetRequirementMode = "BIND" | "MINT";

export type SummonTweetRequirementChecks = {
  hasWalletShort: boolean;
  hasCode: boolean;
  hasOfficialMention: boolean;
  hasGrokMention: boolean;
  hasPrimaryHashtag: boolean;
  hasSecondaryHashtag: boolean;
  hasSummonKeyword: boolean;
};

export type SummonTweetRequirementResult = {
  valid: boolean;
  checks: SummonTweetRequirementChecks;
  missing: string[];
  reason?: string;
};

export type SummonTweetRequirementInput = {
  tweetText: string;
  shortWallet: string;
  code: string;
  summonHandle: string;
  grokHandle: string;
  requiredHashtag: string;
  secondaryHashtag: string;
  mode: SummonTweetRequirementMode;
};

function stripPrefix(value: string, prefix: "@" | "#") {
  return value.trim().startsWith(prefix) ? value.trim().slice(1) : value.trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesMention(tweetText: string, handle: string) {
  const normalized = stripPrefix(handle, "@");
  if (!normalized) return true;
  return new RegExp(`(^|[^A-Za-z0-9_])@${escapeRegex(normalized)}(?![A-Za-z0-9_])`, "i").test(
    tweetText
  );
}

function includesHashtag(tweetText: string, hashtag: string) {
  const normalized = stripPrefix(hashtag, "#");
  if (!normalized) return true;
  return new RegExp(`(^|[^A-Za-z0-9_])#${escapeRegex(normalized)}(?![A-Za-z0-9_])`, "i").test(
    tweetText
  );
}

export function validateSummonTweetRequirements(
  input: SummonTweetRequirementInput
): SummonTweetRequirementResult {
  const checks = {
    hasWalletShort: Boolean(input.shortWallet) && input.tweetText.includes(input.shortWallet),
    hasCode: Boolean(input.code) && input.tweetText.includes(input.code),
    hasOfficialMention: includesMention(input.tweetText, input.summonHandle),
    hasGrokMention: includesMention(input.tweetText, input.grokHandle),
    hasPrimaryHashtag: includesHashtag(input.tweetText, input.requiredHashtag),
    hasSecondaryHashtag: includesHashtag(input.tweetText, input.secondaryHashtag),
    hasSummonKeyword: /\$?SUMMON\b/i.test(input.tweetText)
  };

  const missing = [
    !checks.hasOfficialMention ? `Missing official mention @${stripPrefix(input.summonHandle, "@")}` : "",
    !checks.hasGrokMention ? `Missing Grok mention @${stripPrefix(input.grokHandle, "@")}` : "",
    !checks.hasPrimaryHashtag ? `Missing ${input.requiredHashtag}` : "",
    !checks.hasSecondaryHashtag ? `Missing ${input.secondaryHashtag}` : "",
    !checks.hasWalletShort ? "Missing wallet short address" : "",
    !checks.hasCode ? (input.mode === "BIND" ? "Missing bind code" : "Missing summon code") : "",
    !checks.hasSummonKeyword ? "Missing SUMMON or $SUMMON" : ""
  ].filter(Boolean);

  return {
    valid: missing.length === 0,
    checks,
    missing,
    reason: missing.length > 0 ? missing.join("; ") : undefined
  };
}

export function filterRequirementResult(
  result: SummonTweetRequirementResult,
  options: {
    requireWalletShort: boolean;
    requireOfficialMention: boolean;
    requireGrokMention: boolean;
    requireHashtags: boolean;
  }
) {
  const missing = result.missing.filter((item) => {
    if (!options.requireOfficialMention && item.startsWith("Missing official mention")) return false;
    if (!options.requireGrokMention && item.startsWith("Missing Grok mention")) return false;
    if (!options.requireHashtags && item.startsWith("Missing #")) return false;
    if (!options.requireWalletShort && item === "Missing wallet short address") return false;
    return true;
  });

  return {
    ...result,
    valid: missing.length === 0,
    missing,
    reason: missing.length > 0 ? missing.join("; ") : undefined
  };
}
