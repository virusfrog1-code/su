import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
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
import { getMockStore, shouldUseMockStore } from "@/lib/summon/mockStore";
import {
  filterRequirementResult,
  validateSummonTweetRequirements
} from "@/lib/summon/requirements";
import { parseTweetId, parseTweetUsername } from "@/lib/summon/twitter";
import { getTweetLookupAdapter } from "@/lib/summon/twitterAdapter";
import { shortAddress } from "@/lib/utils";

export const runtime = "nodejs";

function invalidBind(
  reason: string,
  extra?: {
    checks?: object;
    missing?: string[];
    followCheck?: Awaited<ReturnType<typeof checkOfficialFollow>>;
  }
) {
  return NextResponse.json({ valid: false, reason, ...extra }, { status: 400 });
}

function validateBindTweet(input: { tweetText: string; walletAddress: string; bindCode: string }) {
  const result = validateSummonTweetRequirements({
    tweetText: input.tweetText,
    shortWallet: shortAddress(input.walletAddress),
    code: input.bindCode,
    summonHandle: publicSummonXHandle(),
    grokHandle: publicGrokXHandle(),
    requiredHashtag: publicRequiredHashtag(),
    secondaryHashtag: publicRequiredSecondaryHashtag(),
    mode: "BIND"
  });

  return filterRequirementResult(result, {
    requireWalletShort: requireWalletShortInTweet(),
    requireOfficialMention: requireOfficialMention(),
    requireGrokMention: requireGrokMention(),
    requireHashtags: requireRequiredHashtags()
  });
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, "x-bind-verify", 10, 60_000);
  if (!limited.ok) return jsonError("Too many bind verification attempts", 429);

  try {
    const body = (await request.json()) as { walletAddress?: string; tweetUrl?: string };
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return jsonError("Invalid wallet address");
    }

    const walletAddress = getAddress(body.walletAddress);
    const tweetUrl = body.tweetUrl?.trim() || "";
    const tweetId = parseTweetId(tweetUrl);
    if (!tweetId) return jsonError("Invalid tweet URL");

    if (shouldUseMockStore()) {
      const store = getMockStore();
      const start = store.bindStarts.get(walletAddress);
      if (!start) return jsonError("Start X binding first");
      if (start.expiresAt.getTime() <= Date.now()) return jsonError("Bind code expired");
      const bindTweetAlreadyUsed = Array.from(store.bindingsByWallet.values()).some(
        (binding) => binding.bindTweetId === tweetId
      );
      if (bindTweetAlreadyUsed) return jsonError("This bind tweetId has already been used");

      if (store.bindingsByWallet.has(walletAddress)) {
        return jsonError("Wallet already has a verified X binding");
      }

      const tweet = await getTweetLookupAdapter().lookupTweet({
        tweetId,
        tweetUrl,
        nonce: start.bindCode,
        walletAddress
      });
      if (!tweet.authorId) return jsonError("X author id missing");

      const requirements = validateBindTweet({
        tweetText: tweet.text,
        walletAddress,
        bindCode: start.bindCode
      });
      if (!requirements.valid) {
        return invalidBind(requirements.reason || "Bind tweet missing required fields", {
          checks: requirements.checks,
          missing: requirements.missing
        });
      }

      const followCheck = await checkOfficialFollow({
        xUserId: tweet.authorId,
        officialUserId: optionalServerEnv("SUMMON_X_USER_ID")
      });
      if (!followCheck.follows) {
        return invalidBind(
          followCheck.reason || "X account does not follow official account",
          {
            checks: { ...requirements.checks, followsOfficial: false },
            missing: ["X account does not follow official account"],
            followCheck
          }
        );
      }

      const username = parseTweetUsername(tweetUrl) || "author";
      const xUserId = tweet.authorId;
      const existingX = store.bindingsByXUserId.get(xUserId);
      if (existingX && existingX.walletAddress !== walletAddress) {
        return jsonError("This X account is already bound to another wallet");
      }

      const binding = {
        walletAddress,
        xUserId,
        xUsername: username,
        bindTweetId: tweetId,
        bindCode: start.bindCode,
        verified: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      store.bindingsByWallet.set(walletAddress, binding);
      store.bindingsByXUserId.set(xUserId, binding);

      return NextResponse.json({
        valid: true,
        bound: true,
        xUserId,
        xUsername: username,
        bindTweetId: tweetId,
        checks: { ...requirements.checks, followsOfficial: followCheck.follows },
        followCheck
      });
    }

    const pending = await prisma.walletXBinding.findUnique({ where: { walletAddress } });
    if (!pending) return jsonError("Start X binding first");
    if (pending.verified) return jsonError("Wallet already has a verified X binding");

    const existingBindTweet = await prisma.walletXBinding.findUnique({ where: { bindTweetId: tweetId } });
    if (existingBindTweet && existingBindTweet.walletAddress !== walletAddress) {
      return jsonError("This bind tweetId has already been used");
    }

    const tweet = await getTweetLookupAdapter().lookupTweet({
      tweetId,
      tweetUrl,
      nonce: pending.bindCode,
      walletAddress
    });
    if (!tweet.authorId) return jsonError("X author id missing");

    const requirements = validateBindTweet({
      tweetText: tweet.text,
      walletAddress,
      bindCode: pending.bindCode
    });
    if (!requirements.valid) {
      return invalidBind(requirements.reason || "Bind tweet missing required fields", {
        checks: requirements.checks,
        missing: requirements.missing
      });
    }

    const followCheck = await checkOfficialFollow({
      xUserId: tweet.authorId,
      officialUserId: optionalServerEnv("SUMMON_X_USER_ID")
    });
    if (!followCheck.follows) {
      return invalidBind(followCheck.reason || "X account does not follow official account", {
        checks: { ...requirements.checks, followsOfficial: false },
        missing: ["X account does not follow official account"],
        followCheck
      });
    }

    const existingX = await prisma.walletXBinding.findUnique({ where: { xUserId: tweet.authorId } });
    if (existingX && existingX.walletAddress !== walletAddress) {
      return jsonError("This X account is already bound to another wallet");
    }

    const username = parseTweetUsername(tweetUrl);
    const binding = await prisma.walletXBinding.update({
      where: { walletAddress },
      data: {
        xUserId: tweet.authorId,
        xUsername: username,
        bindTweetId: tweetId,
        verified: true
      }
    });

    return NextResponse.json({
      valid: true,
      bound: true,
      xUserId: binding.xUserId,
      xUsername: binding.xUsername,
      bindTweetId: binding.bindTweetId,
      checks: { ...requirements.checks, followsOfficial: followCheck.follows },
      followCheck
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
