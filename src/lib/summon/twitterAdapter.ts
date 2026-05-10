import {
  assertProductionMockAllowed,
  isEnabled,
  isProduction,
  publicGrokXHandle,
  publicRequiredHashtag,
  publicRequiredSecondaryHashtag,
  publicSummonXHandle,
  requireServerEnv
} from "@/lib/env";
import { parseTweetUsername } from "@/lib/summon/twitter";
import { shortAddress } from "@/lib/utils";

export type TweetLookupContext = {
  tweetId: string;
  tweetUrl: string;
  nonce: string;
  walletAddress: string;
};

export type TweetLookupResult = {
  id: string;
  text: string;
  authorId?: string;
};

export interface TweetLookupAdapter {
  lookupTweet(context: TweetLookupContext): Promise<TweetLookupResult>;
}

class XApiTweetLookupAdapter implements TweetLookupAdapter {
  async lookupTweet(context: TweetLookupContext) {
    const bearerToken = requireServerEnv("X_BEARER_TOKEN");
    const url = new URL(`https://api.x.com/2/tweets/${context.tweetId}`);
    url.searchParams.set("tweet.fields", "author_id,created_at");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bearerToken}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`X lookup failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: { id: string; text: string; author_id?: string };
      errors?: Array<{ detail?: string; title?: string }>;
    };

    if (!payload.data) {
      throw new Error(payload.errors?.[0]?.detail || "Tweet not found");
    }

    return {
      id: payload.data.id,
      text: payload.data.text,
      authorId: payload.data.author_id
    };
  }
}

class MockTweetLookupAdapter implements TweetLookupAdapter {
  async lookupTweet(context: TweetLookupContext) {
    let text = process.env.MOCK_TWEET_TEXT || "";

    try {
      const url = new URL(context.tweetUrl);
      const queryText = url.searchParams.get("mockText");
      if (queryText) text = queryText;
    } catch {
      // Keep the default mock text.
    }

    if (!text) {
      const summonHandle = `@${publicSummonXHandle().replace(/^@/, "")}`;
      const grokHandle = `@${publicGrokXHandle().replace(/^@/, "")}`;
      text = [
        `I just summoned ${grokHandle} to mint $SUMMON through ${summonHandle}.`,
        "The first X-native AI meme mint experiment:",
        "Post on X.",
        "Summon Grok.",
        "Mint on-chain.",
        `Wallet: ${shortAddress(context.walletAddress)}`,
        `Summon Code: ${context.nonce}`,
        `${publicRequiredHashtag()} ${publicRequiredSecondaryHashtag()} #AIMeme`
      ].join("\n");
    }

    return {
      id: context.tweetId,
      text,
      authorId: `mock-${(parseTweetUsername(context.tweetUrl) || "author").toLowerCase()}`
    };
  }
}

export function getTweetLookupAdapter(): TweetLookupAdapter {
  assertProductionMockAllowed("ENABLE_MOCK_X", process.env.ENABLE_MOCK_X);
  const productionMockAllowed =
    isProduction() && isEnabled(process.env.ENABLE_MOCK_X) && isEnabled(process.env.ALLOW_PRODUCTION_MOCK);
  if (!isProduction() || productionMockAllowed) {
    if (isEnabled(process.env.ENABLE_MOCK_X) || !process.env.X_BEARER_TOKEN) {
      return new MockTweetLookupAdapter();
    }
  }

  return new XApiTweetLookupAdapter();
}
