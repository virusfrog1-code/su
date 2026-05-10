export function parseTweetId(tweetUrl: string) {
  const trimmed = tweetUrl.trim();
  if (/^\d{10,30}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/status(?:es)?\/(\d{10,30})/);
    return match?.[1] ?? null;
  } catch {
    const match = trimmed.match(/(?:x|twitter)\.com\/[^/]+\/status(?:es)?\/(\d{10,30})/i);
    return match?.[1] ?? null;
  }
}

export function parseTweetUsername(tweetUrl: string) {
  try {
    const url = new URL(tweetUrl.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    return parts[0] || null;
  } catch {
    const match = tweetUrl.trim().match(/(?:x|twitter)\.com\/([^/]+)\/status(?:es)?\/\d{10,30}/i);
    return match?.[1] ?? null;
  }
}

export function includesTokenNarrative(tweetText: string) {
  return /\$?SUMMON\b/i.test(tweetText);
}

export function includesRequiredHashtag(tweetText: string, hashtag: string) {
  if (!hashtag) return true;
  return tweetText.toLowerCase().includes(hashtag.toLowerCase());
}

export function includesRequiredPhrase(tweetText: string, phrase: string) {
  if (!phrase) return true;
  return tweetText.toLowerCase().includes(phrase.toLowerCase());
}
