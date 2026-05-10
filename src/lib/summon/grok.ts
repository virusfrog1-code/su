import { z } from "zod";
import {
  assertProductionMockAllowed,
  isEnabled,
  isProduction,
  optionalServerEnv,
  requireServerEnv
} from "@/lib/env";
import { multiplierForScore } from "@/lib/config";

const GrokScoreSchema = z.object({
  valid: z.boolean(),
  score: z.number().int().min(0).max(100),
  mintMultiplier: z.number().min(1).max(3),
  style: z.enum(["meme-native", "ai-native", "low-effort", "spam"]),
  reason: z.string().max(240)
});

export type GrokScore = z.infer<typeof GrokScoreSchema>;

function localScoreTweet(tweetText: string): GrokScore {
  const normalized = tweetText.toLowerCase();
  let score = 20;

  if (normalized.includes("summon")) score += 15;
  if (normalized.includes("grok")) score += 15;
  if (normalized.includes("mint")) score += 10;
  if (normalized.includes("on-chain") || normalized.includes("onchain")) score += 10;
  if (normalized.includes("$summon") || normalized.includes("summon")) score += 10;
  if (tweetText.length > 120) score += 10;
  if (/(airdrop|seed phrase|private key|guaranteed profit)/i.test(tweetText)) {
    return {
      valid: false,
      score: 0,
      mintMultiplier: 1,
      style: "spam",
      reason: "Local scorer rejected unsafe or spam-like language."
    };
  }

  const capped = Math.max(0, Math.min(100, score));
  return {
    valid: true,
    score: capped,
    mintMultiplier: multiplierForScore(capped),
    style: capped >= 70 ? "ai-native" : "low-effort",
    reason: "Local development scorer used because XAI_API_KEY is not configured."
  };
}

export async function scoreTweetWithGrok(tweetText: string): Promise<GrokScore> {
  assertProductionMockAllowed("ENABLE_MOCK_GROK", process.env.ENABLE_MOCK_GROK);
  const apiKey = optionalServerEnv("XAI_API_KEY");

  if (!apiKey) {
    const productionMockAllowed =
      isProduction() && isEnabled(process.env.ENABLE_MOCK_GROK) && isEnabled(process.env.ALLOW_PRODUCTION_MOCK);
    if (!isProduction() || productionMockAllowed) {
      return localScoreTweet(tweetText);
    }
    throw new Error("XAI_API_KEY is required for production Grok scoring");
  }

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireServerEnv("XAI_API_KEY")}`
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || "grok-4.20-reasoning",
      stream: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "summon_tweet_score",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["valid", "score", "mintMultiplier", "style", "reason"],
            properties: {
              valid: { type: "boolean" },
              score: { type: "integer", minimum: 0, maximum: 100 },
              mintMultiplier: { type: "number", minimum: 1, maximum: 3 },
              style: {
                type: "string",
                enum: ["meme-native", "ai-native", "low-effort", "spam"]
              },
              reason: { type: "string", maxLength: 240 }
            }
          }
        }
      },
      messages: [
        {
          role: "system",
          content:
            "You score SUMMON mint tweets. Reward original AI/Grok/on-chain meme energy. Reject phishing, scams, hate, illegal content, or obvious spam. Return strict JSON only."
        },
        {
          role: "user",
          content: `Score this tweet for SUMMON Post-to-Mint:\n\n${tweetText}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Grok scoring failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Grok returned an empty score");

  const parsed = GrokScoreSchema.parse(JSON.parse(content));
  const normalizedScore = Math.max(0, Math.min(100, parsed.score));

  return {
    ...parsed,
    score: normalizedScore,
    mintMultiplier: multiplierForScore(normalizedScore)
  };
}
