import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import { amountForScore, getMintConfig, multiplierForScore } from "@/lib/config";
import {
  optionalServerEnv,
  publicGrokXHandle,
  publicRequiredHashtag,
  publicRequiredSecondaryHashtag,
  publicSummonXHandle,
  requireGrokMention,
  requireOfficialMention,
  requireRequiredHashtags,
  requireWalletShortInTweet
} from "@/lib/env";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { checkOfficialFollow } from "@/lib/summon/follow";
import { scoreTweetWithGrok } from "@/lib/summon/grok";
import { getMockScore, getMockStore, shouldUseMockStore } from "@/lib/summon/mockStore";
import {
  filterRequirementResult,
  validateSummonTweetRequirements
} from "@/lib/summon/requirements";
import { getTweetLookupAdapter } from "@/lib/summon/twitterAdapter";
import { parseTweetId } from "@/lib/summon/twitter";
import { shortAddress } from "@/lib/utils";

export const runtime = "nodejs";

type VerifyBody = {
  walletAddress?: string;
  tweetUrl?: string;
  nonce?: string;
};

function invalidVerification(
  reason: string,
  status = 200,
  extra?: {
    checks?: object;
    missing?: string[];
    followCheck?: Awaited<ReturnType<typeof checkOfficialFollow>>;
  }
) {
  return NextResponse.json({ valid: false, reason, ...extra }, { status });
}

function validateMintTweet(input: { tweetText: string; walletAddress: string; nonce: string }) {
  const result = validateSummonTweetRequirements({
    tweetText: input.tweetText,
    shortWallet: shortAddress(input.walletAddress),
    code: input.nonce,
    summonHandle: publicSummonXHandle(),
    grokHandle: publicGrokXHandle(),
    requiredHashtag: publicRequiredHashtag(),
    secondaryHashtag: publicRequiredSecondaryHashtag(),
    mode: "MINT"
  });

  return filterRequirementResult(result, {
    requireWalletShort: requireWalletShortInTweet(),
    requireOfficialMention: requireOfficialMention(),
    requireGrokMention: requireGrokMention(),
    requireHashtags: requireRequiredHashtags()
  });
}

async function recordVerificationFailure(input: {
  walletAddress: string;
  tweetId: string;
  tweetUrl: string;
  tweetText?: string;
  nonce: string;
  reason: string;
}) {
  try {
    await prisma.tweetVerification.create({
      data: {
        walletAddress: input.walletAddress,
        tweetId: input.tweetId,
        tweetUrl: input.tweetUrl,
        tweetText: input.tweetText || "",
        valid: false,
        reason: input.reason,
        nonce: input.nonce
      }
    });
  } catch {
    // tweetId is unique. Existing records are intentionally not overwritten.
  }
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "verify-tweet", 12, 60_000);
  if (!limited.ok) return jsonError("Too many tweet verification attempts", 429);

  let tweetId: string | null = null;
  let walletAddress = "";
  let tweetUrl = "";
  let nonce = "";

  try {
    const body = (await request.json()) as VerifyBody;
    tweetUrl = body.tweetUrl?.trim() || "";
    nonce = body.nonce?.trim() || "";

    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return jsonError("Invalid wallet address");
    }

    walletAddress = getAddress(body.walletAddress);
    tweetId = parseTweetId(tweetUrl);
    if (!tweetId) return invalidVerification("Invalid tweet URL");
    if (!nonce) return invalidVerification("Missing summon code");

    if (shouldUseMockStore()) {
      const store = getMockStore();
      const existingTweet = store.verifications.get(tweetId);
      if (existingTweet) return invalidVerification("This tweetId has already been verified");

      const binding = store.bindingsByWallet.get(walletAddress);
      if (!binding?.verified) return invalidVerification("X account is not bound");
      const nonceRecord = store.nonces.get(nonce);
      if (!nonceRecord || nonceRecord.walletAddress !== walletAddress) {
        return invalidVerification("Nonce does not belong to wallet");
      }
      if (nonceRecord.mode !== "X_POST") return invalidVerification("Nonce was not created for X post mint");
      if (nonceRecord.xUserId !== binding.xUserId) {
        return invalidVerification("Nonce X account does not match wallet binding");
      }
      if (nonceRecord.used) return invalidVerification("Nonce already used");
      if (nonceRecord.expiresAt.getTime() <= Date.now()) {
        return invalidVerification("Nonce expired");
      }

      const tweet = await getTweetLookupAdapter().lookupTweet({
        tweetId,
        tweetUrl,
        nonce,
        walletAddress
      });
      if (!tweet.authorId || tweet.authorId !== binding.xUserId) {
        return invalidVerification("Tweet author is not the bound X account for this wallet");
      }
      const config = await getMintConfig();
      const requirements = validateMintTweet({ tweetText: tweet.text, walletAddress, nonce });
      if (!requirements.valid) {
        nonceRecord.used = true;
        const reason = requirements.reason || "Tweet missing required SUMMON fields";
        store.verifications.set(tweetId, {
          walletAddress,
          xUserId: binding.xUserId,
          xUsername: binding.xUsername,
          tweetId,
          tweetUrl,
          tweetText: tweet.text,
          valid: false,
          reason,
          score: 0,
          mintMultiplier: 1,
          nonce,
          estimatedMintAmount: "0",
          createdAt: new Date()
        });
        return invalidVerification(reason, 200, {
          checks: requirements.checks,
          missing: requirements.missing
        });
      }

      const followCheck = await checkOfficialFollow({
        xUserId: binding.xUserId,
        officialUserId: optionalServerEnv("SUMMON_X_USER_ID")
      });
      if (!followCheck.follows) {
        nonceRecord.used = true;
        const reason = followCheck.reason || "X account does not follow official account";
        store.verifications.set(tweetId, {
          walletAddress,
          xUserId: binding.xUserId,
          xUsername: binding.xUsername,
          tweetId,
          tweetUrl,
          tweetText: tweet.text,
          valid: false,
          reason,
          score: 0,
          mintMultiplier: 1,
          nonce,
          estimatedMintAmount: "0",
          createdAt: new Date()
        });
        return invalidVerification(reason, 200, {
          checks: { ...requirements.checks, xAccountMatched: true, followsOfficial: false },
          missing: ["X account does not follow official account"],
          followCheck
        });
      }

      const mockScore = getMockScore();
      const estimatedMintAmount = String(amountForScore(config.baseMintAmount, mockScore.score));
      nonceRecord.used = true;
      store.verifications.set(tweetId, {
        walletAddress,
        xUserId: binding.xUserId,
        xUsername: binding.xUsername,
        tweetId,
        tweetUrl,
        tweetText: tweet.text,
        valid: true,
        reason: mockScore.reason,
        score: mockScore.score,
        mintMultiplier: mockScore.mintMultiplier,
        nonce,
        estimatedMintAmount,
        createdAt: new Date()
      });

      return NextResponse.json({
        valid: true,
        xUserId: binding.xUserId,
        xUsername: binding.xUsername,
        tweetId,
        tweetText: tweet.text,
        score: mockScore.score,
        mintMultiplier: mockScore.mintMultiplier,
        style: mockScore.style,
        reason: mockScore.reason,
        estimatedMintAmount,
        checks: {
          ...requirements.checks,
          xAccountMatched: true,
          followsOfficial: followCheck.follows,
          antiTheftPassed: true
        },
        followCheck
      });
    }

    const existingTweet = await prisma.tweetVerification.findUnique({ where: { tweetId } });
    if (existingTweet) {
      return invalidVerification("This tweetId has already been verified or attempted");
    }

    const nonceRecord = await prisma.summonNonce.findUnique({ where: { nonce } });
    const binding = await prisma.walletXBinding.findUnique({ where: { walletAddress } });
    if (!binding?.verified || !binding.xUserId) return invalidVerification("X account is not bound");
    if (!nonceRecord || nonceRecord.walletAddress !== walletAddress) {
      await recordVerificationFailure({
        walletAddress,
        tweetId,
        tweetUrl,
        nonce,
        reason: "Nonce does not belong to wallet"
      });
      return invalidVerification("Nonce does not belong to wallet");
    }
    if (nonceRecord.mode !== "X_POST") return invalidVerification("Nonce was not created for X post mint");
    if (nonceRecord.xUserId !== binding.xUserId) {
      return invalidVerification("Nonce X account does not match wallet binding");
    }

    if (nonceRecord.used) {
      await recordVerificationFailure({
        walletAddress,
        tweetId,
        tweetUrl,
        nonce,
        reason: "Nonce already used"
      });
      return invalidVerification("Nonce already used");
    }

    if (nonceRecord.expiresAt.getTime() <= Date.now()) {
      await recordVerificationFailure({
        walletAddress,
        tweetId,
        tweetUrl,
        nonce,
        reason: "Nonce expired"
      });
      return invalidVerification("Nonce expired");
    }

    const tweet = await getTweetLookupAdapter().lookupTweet({
      tweetId,
      tweetUrl,
      nonce,
      walletAddress
    });
    if (!tweet.authorId || tweet.authorId !== binding.xUserId) {
      return invalidVerification("Tweet author is not the bound X account for this wallet");
    }

    const config = await getMintConfig();
    const requirements = validateMintTweet({ tweetText: tweet.text, walletAddress, nonce });
    if (!requirements.valid) {
      const reason = requirements.reason || "Tweet missing required SUMMON fields";
      await prisma.$transaction([
        prisma.tweetVerification.create({
          data: {
            walletAddress,
            xUserId: binding.xUserId,
            xUsername: binding.xUsername,
            tweetId,
            tweetUrl,
            tweetText: tweet.text,
            authorId: tweet.authorId,
            valid: false,
            reason,
            nonce
          }
        }),
        prisma.summonNonce.update({
          where: { nonce },
          data: { used: true }
        })
      ]);
      return invalidVerification(reason, 200, {
        checks: requirements.checks,
        missing: requirements.missing
      });
    }

    const followCheck = await checkOfficialFollow({
      xUserId: binding.xUserId,
      officialUserId: optionalServerEnv("SUMMON_X_USER_ID")
    });
    if (!followCheck.follows) {
      const reason = followCheck.reason || "X account does not follow official account";
      await prisma.$transaction([
        prisma.tweetVerification.create({
          data: {
            walletAddress,
            xUserId: binding.xUserId,
            xUsername: binding.xUsername,
            tweetId,
            tweetUrl,
            tweetText: tweet.text,
            authorId: tweet.authorId,
            valid: false,
            reason,
            nonce
          }
        }),
        prisma.summonNonce.update({
          where: { nonce },
          data: { used: true }
        })
      ]);
      return invalidVerification(reason, 200, {
        checks: { ...requirements.checks, xAccountMatched: true, followsOfficial: false },
        missing: ["X account does not follow official account"],
        followCheck
      });
    }

    const grokScore = await scoreTweetWithGrok(tweet.text);
    const score = Math.max(0, Math.min(100, grokScore.score));
    const mintMultiplier = multiplierForScore(score);
    const estimatedMintAmount = String(amountForScore(config.baseMintAmount, score));

    await prisma.$transaction([
      prisma.tweetVerification.create({
        data: {
          walletAddress,
          xUserId: binding.xUserId,
          xUsername: binding.xUsername,
          tweetId,
          tweetUrl,
          tweetText: tweet.text,
          authorId: tweet.authorId,
          valid: grokScore.valid,
          reason: grokScore.reason,
          score,
          mintMultiplier,
          nonce
        }
      }),
      prisma.summonNonce.update({
        where: { nonce },
        data: { used: true }
      })
    ]);

    if (!grokScore.valid) {
      return invalidVerification(grokScore.reason || "Grok rejected this summon");
    }

    return NextResponse.json({
      valid: true,
      xUserId: binding.xUserId,
      xUsername: binding.xUsername,
      tweetId,
      tweetText: tweet.text,
      score,
      reason: grokScore.reason,
      mintMultiplier,
      style: grokScore.style,
      estimatedMintAmount,
      checks: {
        ...requirements.checks,
        xAccountMatched: true,
        followsOfficial: followCheck.follows,
        antiTheftPassed: true
      },
      followCheck
    });
  } catch (error) {
    if (tweetId && walletAddress && !shouldUseMockStore()) {
      await recordVerificationFailure({
        walletAddress,
        tweetId,
        tweetUrl,
        nonce,
        reason: sanitizeError(error)
      });
    }
    return jsonError(sanitizeError(error), 500);
  }
}
