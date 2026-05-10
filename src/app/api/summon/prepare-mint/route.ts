import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import {
  DEFAULT_MINT_RULES,
  type MintMode,
  pricePerUnitWeiForMode,
  priceWeiForMode,
} from "@/lib/mint/rules";
import {
  calculatePayableWei,
  formatUnitsToShares,
  parseSharesToUnits
} from "@/lib/mint/shareUnits";
import {
  canUseMockMint,
  createDeadline,
  getMintChainId,
  signPaidMintAuthorization
} from "@/lib/chain/serverMint";
import { getMockStore, getOrCreateMockWalletStats, shouldUseMockStore } from "@/lib/summon/mockStore";
import { buildMintMessage } from "@/lib/summon/tweetTemplate";

export const runtime = "nodejs";

type PrepareMintBody = {
  walletAddress?: string;
  mode?: MintMode;
  shares?: string;
  tweetId?: string;
  nonce?: string;
};

function rulesFromConfig(config: Awaited<ReturnType<typeof prisma.mintConfig.findFirst>>) {
  return config
    ? {
        totalSharesCap: config.totalSharesCap,
        totalShareUnitsCap: config.totalShareUnitsCap,
        standardPriceWei: config.standardPriceWei,
        standardPricePerUnitWei: config.standardPricePerUnitWei,
        fallbackPriceWei: config.fallbackPriceWei,
        fallbackPricePerUnitWei: config.fallbackPricePerUnitWei,
        maxStandardSharesPerWallet: config.maxStandardSharesPerWallet,
        maxStandardShareUnits: config.maxStandardShareUnits,
        maxFallbackSharesPerWallet: config.maxFallbackSharesPerWallet,
        maxFallbackShareUnits: config.maxFallbackShareUnits,
        freeSharesPerWalletX: config.freeSharesPerWalletX,
        freeShareUnits: config.freeShareUnits,
        paused: config.paused
      }
    : DEFAULT_MINT_RULES;
}

function serializeTypedData(input: unknown) {
  return JSON.parse(
    JSON.stringify(input, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
  );
}

function validationError(
  error: string,
  message: string,
  extra: Record<string, string | number> = {}
) {
  return NextResponse.json({ error, message, ...extra }, { status: 400 });
}

function parseRequestedShares(input: string | undefined) {
  try {
    return { shareUnits: parseSharesToUnits(input || "") };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid share amount";
    return { error: validationError("INVALID_SHARE_INPUT", message) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PrepareMintBody;
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return jsonError("Invalid wallet address");
    }
    const walletAddress = getAddress(body.walletAddress);
    const mode = body.mode || "X_POST";
    if (mode !== "X_POST" && mode !== "NO_X_FALLBACK") return jsonError("Invalid mint mode");
    const parsedShares = parseRequestedShares(body.shares);
    if (parsedShares.error) return parsedShares.error;
    const shareUnits = parsedShares.shareUnits;

    if (shouldUseMockStore()) {
      const store = getMockStore();
      const rules = store.rules;
      if (rules.paused) return jsonError("Mint is paused", 423);
      const stats = getOrCreateMockWalletStats(walletAddress);
      const totalRemainingUnits = Math.max(
        0,
        rules.totalShareUnitsCap - store.globalStats.totalShareUnitsMinted
      );
      if (shareUnits > totalRemainingUnits) {
        return validationError(
          "TOTAL_CAP_EXCEEDED",
          `Current total remaining supply is ${formatUnitsToShares(totalRemainingUnits)} shares.`,
          { remainingShares: formatUnitsToShares(totalRemainingUnits) }
        );
      }

      if (mode === "X_POST") {
        if (shareUnits > rules.maxStandardShareUnits) {
          return validationError(
            "MODE_MAX_EXCEEDED",
            `Standard X mint max is ${formatUnitsToShares(rules.maxStandardShareUnits)} shares.`,
            { maxShares: formatUnitsToShares(rules.maxStandardShareUnits) }
          );
        }
        const verification = body.tweetId ? store.verifications.get(body.tweetId) : undefined;
        if (
          !verification ||
          !verification.valid ||
          verification.walletAddress !== walletAddress ||
          verification.nonce !== body.nonce
        ) {
          return jsonError("X_POST mint requires a valid verified tweet");
        }
        if (store.mints.has(body.tweetId || "")) return jsonError("This tweet has already been minted");
        if (Array.from(store.mints.values()).some((mint) => mint.nonce === body.nonce)) {
          return jsonError("Nonce already used for mint");
        }
        const remainingUnits = Math.max(0, rules.maxStandardShareUnits - stats.paidStandardUnits);
        if (shareUnits > remainingUnits) {
          return validationError(
            "ALLOCATION_EXCEEDED",
            `Your remaining X mint allocation is ${formatUnitsToShares(remainingUnits)} shares.`,
            { remainingShares: formatUnitsToShares(remainingUnits) }
          );
        }
      } else {
        if (shareUnits > rules.maxFallbackShareUnits) {
          return validationError(
            "MODE_MAX_EXCEEDED",
            `Fallback mint max is ${formatUnitsToShares(rules.maxFallbackShareUnits)} shares.`,
            { maxShares: formatUnitsToShares(rules.maxFallbackShareUnits) }
          );
        }
        const remainingUnits = Math.max(0, rules.maxFallbackShareUnits - stats.paidFallbackUnits);
        if (shareUnits > remainingUnits) {
          return validationError(
            "ALLOCATION_EXCEEDED",
            `Your remaining fallback mint allocation is ${formatUnitsToShares(remainingUnits)} shares.`,
            { remainingShares: formatUnitsToShares(remainingUnits) }
          );
        }
      }

      const priceWei = priceWeiForMode(mode, rules);
      const pricePerUnitWei = pricePerUnitWeiForMode(mode, rules);
      const totalWei = calculatePayableWei(mode, shareUnits, rules).toString();
      const shares = formatUnitsToShares(shareUnits);
      const deadline = createDeadline();
      const nonceForMint = body.nonce || `FALLBACK-${walletAddress}-${Date.now()}`;
      const prepareId = crypto.randomUUID();
      store.preparedMints.set(prepareId, {
        prepareId,
        walletAddress,
        mode,
        shareUnits,
        tweetId: body.tweetId,
        nonce: nonceForMint,
        totalWei,
        deadline,
        used: false,
        createdAt: new Date()
      });
      const authorization = canUseMockMint()
        ? null
        : await signPaidMintAuthorization({
            walletAddress,
            mode,
            shareUnits,
            tweetId: body.tweetId,
            nonce: nonceForMint,
            pricePerUnitWei,
            deadline
          });
      return NextResponse.json({
        mode,
        prepareId,
        shares,
        shareUnits,
        priceWei,
        pricePerUnitWei,
        totalWei,
        nonce: nonceForMint,
        deadline,
        contractAddress: process.env.MINT_MANAGER_ADDRESS || "",
        chainId: getMintChainId(),
        authorization: authorization
          ? {
              typedData: serializeTypedData(authorization.typedData),
              signature: authorization.signature
            }
          : null,
        mock: canUseMockMint(),
        isMockMint: canUseMockMint(),
        mockWarning: canUseMockMint() ? "Mock mint mode is active." : undefined,
        messageToSign: buildMintMessage({
          walletAddress,
          mode,
          shares,
          totalWei,
          tweetId: body.tweetId,
          nonce: nonceForMint
        })
      });
    }

    const [config, globalStats, stats] = await Promise.all([
      prisma.mintConfig.findFirst(),
      prisma.globalMintStats.findFirst(),
      prisma.walletMintStats.findUnique({ where: { walletAddress } })
    ]);
    const rules = rulesFromConfig(config);
    if (rules.paused) return jsonError("Mint is paused", 423);
    const totalRemainingUnits = Math.max(
      0,
      rules.totalShareUnitsCap - (globalStats?.totalShareUnitsMinted ?? 0)
    );
    if (shareUnits > totalRemainingUnits) {
      return validationError(
        "TOTAL_CAP_EXCEEDED",
        `Current total remaining supply is ${formatUnitsToShares(totalRemainingUnits)} shares.`,
        { remainingShares: formatUnitsToShares(totalRemainingUnits) }
      );
    }

    if (mode === "X_POST") {
      if (shareUnits > rules.maxStandardShareUnits) {
        return validationError(
          "MODE_MAX_EXCEEDED",
          `Standard X mint max is ${formatUnitsToShares(rules.maxStandardShareUnits)} shares.`,
          { maxShares: formatUnitsToShares(rules.maxStandardShareUnits) }
        );
      }
      const verification = body.tweetId
        ? await prisma.tweetVerification.findUnique({ where: { tweetId: body.tweetId } })
        : null;
      if (
        !verification ||
        !verification.valid ||
        verification.walletAddress !== walletAddress ||
        verification.nonce !== body.nonce
      ) {
        return jsonError("X_POST mint requires a valid verified tweet");
      }
      const existingMint = await prisma.mintRecord.findFirst({
        where: { OR: [{ tweetId: body.tweetId }, { nonce: body.nonce }] }
      });
      if (existingMint) return jsonError("tweetId or nonce has already been minted");
      const remainingUnits = Math.max(0, rules.maxStandardShareUnits - (stats?.paidStandardUnits ?? 0));
      if (shareUnits > remainingUnits) {
        return validationError(
          "ALLOCATION_EXCEEDED",
          `Your remaining X mint allocation is ${formatUnitsToShares(remainingUnits)} shares.`,
          { remainingShares: formatUnitsToShares(remainingUnits) }
        );
      }
    } else {
      if (shareUnits > rules.maxFallbackShareUnits) {
        return validationError(
          "MODE_MAX_EXCEEDED",
          `Fallback mint max is ${formatUnitsToShares(rules.maxFallbackShareUnits)} shares.`,
          { maxShares: formatUnitsToShares(rules.maxFallbackShareUnits) }
        );
      }
      const remainingUnits = Math.max(0, rules.maxFallbackShareUnits - (stats?.paidFallbackUnits ?? 0));
      if (shareUnits > remainingUnits) {
        return validationError(
          "ALLOCATION_EXCEEDED",
          `Your remaining fallback mint allocation is ${formatUnitsToShares(remainingUnits)} shares.`,
          { remainingShares: formatUnitsToShares(remainingUnits) }
        );
      }
    }

    const priceWei = priceWeiForMode(mode, rules);
    const pricePerUnitWei = pricePerUnitWeiForMode(mode, rules);
    const totalWei = calculatePayableWei(mode, shareUnits, rules).toString();
    const shares = formatUnitsToShares(shareUnits);
    const deadline = createDeadline();
    const nonceForMint = body.nonce || `FALLBACK-${walletAddress}-${Date.now()}`;
    const prepareId = crypto.randomUUID();
    getMockStore().preparedMints.set(prepareId, {
      prepareId,
      walletAddress,
      mode,
      shareUnits,
      tweetId: body.tweetId,
      nonce: nonceForMint,
      totalWei,
      deadline,
      used: false,
      createdAt: new Date()
    });
    const authorization = canUseMockMint()
      ? null
      : await signPaidMintAuthorization({
          walletAddress,
          mode,
          shareUnits,
          tweetId: body.tweetId,
          nonce: nonceForMint,
          pricePerUnitWei,
          deadline
        });
    return NextResponse.json({
      mode,
      prepareId,
      shares,
      shareUnits,
      priceWei,
      pricePerUnitWei,
      totalWei,
      nonce: nonceForMint,
      deadline,
      contractAddress: process.env.MINT_MANAGER_ADDRESS || "",
      chainId: getMintChainId(),
      authorization: authorization
        ? {
            typedData: serializeTypedData(authorization.typedData),
            signature: authorization.signature
          }
        : null,
      mock: canUseMockMint(),
      isMockMint: canUseMockMint(),
      mockWarning: canUseMockMint() ? "Mock mint mode is active." : undefined,
      messageToSign: buildMintMessage({
        walletAddress,
        mode,
        shares,
        totalWei,
        tweetId: body.tweetId,
        nonce: nonceForMint
      })
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
