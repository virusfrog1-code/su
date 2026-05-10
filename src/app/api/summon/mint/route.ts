import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, verifyMessage, type Address } from "viem";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import {
  DEFAULT_MINT_RULES,
  addBigIntStrings,
  type MintMode,
  priceWeiForMode,
} from "@/lib/mint/rules";
import {
  calculatePayableWei,
  formatUnitsToShares,
  parseSharesToUnits
} from "@/lib/mint/shareUnits";
import {
  canUseMockMint,
  getExplorerUrl,
  getMintChainId,
  getMintManagerAddress,
  submitPaidMintTransaction
} from "@/lib/chain/serverMint";
import {
  getMockStore,
  getOrCreateMockWalletStats,
  shouldUseMockStore
} from "@/lib/summon/mockStore";
import { buildMintMessage } from "@/lib/summon/tweetTemplate";

export const runtime = "nodejs";

type MintBody = {
  walletAddress?: string;
  mode?: MintMode;
  prepareId?: string;
  shares?: string;
  shareUnits?: string | number;
  tweetId?: string;
  nonce?: string;
  signature?: `0x${string}`;
  userSignature?: `0x${string}`;
  authorizationSignature?: `0x${string}`;
  deadline?: number;
  valueWei?: string;
};

function mockTxHash(seed: string) {
  return `0x${seed.replace(/\D/g, "").padStart(64, "0").slice(0, 64)}`;
}

function explorerUrlForTx(txHash: string) {
  return getExplorerUrl(txHash);
}

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

function validationError(
  error: string,
  message: string,
  extra: Record<string, string | number> = {}
) {
  return NextResponse.json({ error, message, ...extra }, { status: 400 });
}

function parseMintShareUnits(body: MintBody) {
  let shareUnits: number;
  try {
    shareUnits = body.shares ? parseSharesToUnits(body.shares) : Number(body.shareUnits);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid share amount";
    return { error: validationError("INVALID_SHARE_INPUT", message) };
  }

  if (!Number.isSafeInteger(shareUnits) || shareUnits <= 0) {
    return { error: validationError("INVALID_SHARE_INPUT", "Shares must be at least 0.1") };
  }
  if (body.shareUnits !== undefined && Number(body.shareUnits) !== shareUnits) {
    return {
      error: validationError("PREPARE_MISMATCH", "shareUnits does not match shares", {
        expectedShareUnits: shareUnits
      })
    };
  }
  return { shareUnits };
}

function validatePreparedMint(input: {
  prepareId?: string;
  walletAddress: string;
  mode: MintMode;
  shareUnits: number;
  tweetId?: string;
  nonce?: string;
  totalWei: string;
  deadline?: number;
}) {
  if (!input.prepareId) {
    return validationError("PREPARE_REQUIRED", "Prepare Mint must be completed before minting");
  }

  const prepared = getMockStore().preparedMints.get(input.prepareId);
  if (!prepared) {
    return validationError("PREPARE_NOT_FOUND", "Prepared mint request was not found");
  }
  if (prepared.used) {
    return validationError("PREPARE_NOT_FOUND", "Prepared mint request was not found or already used");
  }

  const mismatch =
    prepared.walletAddress !== input.walletAddress ||
    prepared.mode !== input.mode ||
    prepared.shareUnits !== input.shareUnits ||
    prepared.tweetId !== input.tweetId ||
    prepared.nonce !== input.nonce ||
    prepared.totalWei !== input.totalWei ||
    prepared.deadline !== input.deadline;

  if (mismatch) {
    return validationError(
      "PREPARE_MISMATCH",
      "Mint request does not match the prepared shares, mode, tweetId, nonce, deadline, or payment amount"
    );
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MintBody;
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return jsonError("Invalid wallet address");
    }
    const userSignature = body.userSignature || body.signature;
    if (!userSignature) return jsonError("Missing wallet signature");
    const walletAddress = getAddress(body.walletAddress);
    const mode = body.mode || "X_POST";
    if (mode !== "X_POST" && mode !== "NO_X_FALLBACK") return jsonError("Invalid mint mode");
    const parsedShares = parseMintShareUnits(body);
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
        if (!body.tweetId || !body.nonce) return jsonError("X_POST mint requires tweetId and nonce");
        if (store.mints.has(body.tweetId)) return jsonError("This tweet has already been minted");
        if (Array.from(store.mints.values()).some((mint) => mint.nonce === body.nonce)) {
          return jsonError("Nonce already used for mint");
        }
        const verification = store.verifications.get(body.tweetId);
        if (
          !verification ||
          !verification.valid ||
          verification.walletAddress !== walletAddress ||
          verification.nonce !== body.nonce
        ) {
          return jsonError("Tweet has not been verified for this wallet");
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
        if (!body.nonce) return jsonError("Fallback mint requires nonce");
        if (Array.from(store.mints.values()).some((mint) => mint.nonce === body.nonce)) {
          return jsonError("Nonce already used for mint");
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
      const totalWei = calculatePayableWei(mode, shareUnits, rules).toString();
      if (body.valueWei && body.valueWei !== totalWei) return jsonError("Payment amount is incorrect");
      const shares = formatUnitsToShares(shareUnits);
      const prepareError = validatePreparedMint({
        prepareId: body.prepareId,
        walletAddress,
        mode,
        shareUnits,
        tweetId: body.tweetId,
        nonce: body.nonce,
        totalWei,
        deadline: body.deadline
      });
      if (prepareError) return prepareError;
      const message = buildMintMessage({
        walletAddress,
        mode,
        shares,
        totalWei,
        tweetId: body.tweetId,
        nonce: body.nonce
      });
      const signatureOk = await verifyMessage({
        address: walletAddress as Address,
        message,
        signature: userSignature
      });
      if (!signatureOk) return jsonError("Invalid wallet signature");
      if (body.prepareId) {
        const prepared = store.preparedMints.get(body.prepareId);
        if (prepared) prepared.used = true;
      }

      let txHash: string;
      let isMock = true;
      if (canUseMockMint()) {
        txHash = mockTxHash(body.tweetId || `${Date.now()}${walletAddress}`);
      } else {
        if (!body.authorizationSignature) return jsonError("Missing contract authorization signature");
        if (!body.deadline) return jsonError("Missing authorization deadline");
        const result = await submitPaidMintTransaction({
          walletAddress: walletAddress as Address,
          mode,
          shareUnits,
          tweetId: body.tweetId,
          nonce: body.nonce || "",
          deadline: body.deadline,
          authorizationSignature: body.authorizationSignature,
          totalWei
        });
        if (result.receipt.status !== "success") return jsonError("Mint transaction reverted", 502);
        txHash = result.hash;
        isMock = false;
      }

      if (mode === "X_POST") stats.paidStandardUnits += shareUnits;
      else stats.paidFallbackUnits += shareUnits;
      stats.totalShareUnitsMinted += shareUnits;
      store.globalStats.totalShareUnitsMinted += shareUnits;
      store.globalStats.totalPaidWei = addBigIntStrings(store.globalStats.totalPaidWei, totalWei);
      const key = body.tweetId || `fallback-${walletAddress}-${Date.now()}`;
      store.mints.set(key, {
        walletAddress,
        xUserId: store.bindingsByWallet.get(walletAddress)?.xUserId,
        tweetId: key,
        mode,
        nonce: body.nonce || "",
        shares,
        shareUnits,
        priceWei,
        totalPaidWei: totalWei,
        amount: shares,
        score: 0,
        mintMultiplier: 1,
        txHash,
        isMock,
        createdAt: new Date()
      });

      return NextResponse.json({
        success: true,
        txHash,
        shares,
        totalPaidWei: totalWei,
        explorerUrl: explorerUrlForTx(txHash),
        isMock,
        isMockMint: isMock,
        mockWarning: isMock ? "Mock mint mode is active." : undefined,
        chainId: getMintChainId()
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
      if (!body.tweetId || !body.nonce) return jsonError("X_POST mint requires tweetId and nonce");
      const existingMint = await prisma.mintRecord.findFirst({
        where: { OR: [{ tweetId: body.tweetId }, { nonce: body.nonce }] }
      });
      if (existingMint) return jsonError("tweetId or nonce has already been minted");
      const verification = await prisma.tweetVerification.findUnique({ where: { tweetId: body.tweetId } });
      if (
        !verification ||
        !verification.valid ||
        verification.walletAddress !== walletAddress ||
        verification.nonce !== body.nonce
      ) {
        return jsonError("Tweet has not been verified for this wallet");
      }
      const remainingUnits = Math.max(0, rules.maxStandardShareUnits - (stats?.paidStandardUnits ?? 0));
      if (shareUnits > remainingUnits) {
        return validationError(
          "ALLOCATION_EXCEEDED",
          `Your remaining X mint allocation is ${formatUnitsToShares(remainingUnits)} shares.`,
          { remainingShares: formatUnitsToShares(remainingUnits) }
        );
      }
    } else {
      if (!body.nonce) return jsonError("Fallback mint requires nonce");
      const existingMint = await prisma.mintRecord.findFirst({ where: { nonce: body.nonce } });
      if (existingMint) return jsonError("nonce has already been minted");
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
    const totalWei = calculatePayableWei(mode, shareUnits, rules).toString();
    if (body.valueWei && body.valueWei !== totalWei) return jsonError("Payment amount is incorrect");
    const shares = formatUnitsToShares(shareUnits);
    const prepareError = validatePreparedMint({
      prepareId: body.prepareId,
      walletAddress,
      mode,
      shareUnits,
      tweetId: body.tweetId,
      nonce: body.nonce,
      totalWei,
      deadline: body.deadline
    });
    if (prepareError) return prepareError;
    const message = buildMintMessage({
      walletAddress,
      mode,
      shares,
      totalWei,
      tweetId: body.tweetId,
      nonce: body.nonce
    });
    const signatureOk = await verifyMessage({
      address: walletAddress as Address,
      message,
      signature: userSignature
    });
    if (!signatureOk) return jsonError("Invalid wallet signature");
    if (body.prepareId) {
      const prepared = getMockStore().preparedMints.get(body.prepareId);
      if (prepared) prepared.used = true;
    }

    let txHash: string;
    let isMock = true;
    if (canUseMockMint()) {
      txHash = mockTxHash(body.tweetId || `${Date.now()}${walletAddress}`);
    } else {
      if (!body.authorizationSignature) return jsonError("Missing contract authorization signature");
      if (!body.deadline) return jsonError("Missing authorization deadline");
      try {
        const result = await submitPaidMintTransaction({
          walletAddress: walletAddress as Address,
          mode,
          shareUnits,
          tweetId: body.tweetId,
          nonce: body.nonce || "",
          deadline: body.deadline,
          authorizationSignature: body.authorizationSignature,
          totalWei
        });
        txHash = result.hash;
        isMock = false;
        if (result.receipt.status !== "success") {
          await prisma.mintRecord.create({
            data: {
              walletAddress,
              tweetId: body.tweetId,
              nonce: body.nonce,
              mode,
              shares,
              shareUnits,
              priceWei,
              totalPaidWei: totalWei,
              amount: shares,
              txHash,
              isMock,
              chainId: getMintChainId(),
              contractAddress: getMintManagerAddress(),
              authorizationDeadline: body.deadline,
              userSignature,
              status: "failed"
            }
          });
          return jsonError("Mint transaction reverted", 502);
        }
      } catch (error) {
        await prisma.mintRecord.create({
          data: {
            walletAddress,
            tweetId: body.tweetId,
            nonce: body.nonce,
            mode,
            shares,
            shareUnits,
            priceWei,
            totalPaidWei: totalWei,
            amount: shares,
            isMock: false,
            chainId: getMintChainId(),
            contractAddress: getMintManagerAddress(),
            authorizationDeadline: body.deadline,
            userSignature,
            status: "failed"
          }
        });
        throw error;
      }
    }
    const nextPaidStandard = (stats?.paidStandardUnits ?? 0) + (mode === "X_POST" ? shareUnits : 0);
    const nextPaidFallback =
      (stats?.paidFallbackUnits ?? 0) + (mode === "NO_X_FALLBACK" ? shareUnits : 0);
    const nextWalletTotal = (stats?.totalShareUnitsMinted ?? 0) + shareUnits;
    const nextGlobalTotal = (globalStats?.totalShareUnitsMinted ?? 0) + shareUnits;

    await prisma.$transaction([
      prisma.walletMintStats.upsert({
        where: { walletAddress },
        update: {
          paidStandardUnits: nextPaidStandard,
          paidStandardShares: formatUnitsToShares(nextPaidStandard),
          paidFallbackUnits: nextPaidFallback,
          paidFallbackShares: formatUnitsToShares(nextPaidFallback),
          totalShareUnitsMinted: nextWalletTotal,
          totalSharesMinted: formatUnitsToShares(nextWalletTotal)
        },
        create: {
          walletAddress,
          paidStandardUnits: mode === "X_POST" ? shareUnits : 0,
          paidStandardShares: mode === "X_POST" ? shares : "0",
          paidFallbackUnits: mode === "NO_X_FALLBACK" ? shareUnits : 0,
          paidFallbackShares: mode === "NO_X_FALLBACK" ? shares : "0",
          totalShareUnitsMinted: shareUnits,
          totalSharesMinted: shares
        }
      }),
      prisma.globalMintStats.upsert({
        where: { id: globalStats?.id ?? "global" },
        update: {
          totalShareUnitsMinted: nextGlobalTotal,
          totalSharesMinted: formatUnitsToShares(nextGlobalTotal),
          totalPaidWei: addBigIntStrings(globalStats?.totalPaidWei ?? "0", totalWei)
        },
        create: {
          id: "global",
          totalShareUnitsMinted: shareUnits,
          totalSharesMinted: shares,
          totalPaidWei: totalWei
        }
      }),
      prisma.mintRecord.create({
        data: {
          walletAddress,
          xUserId: undefined,
          tweetId: body.tweetId,
          nonce: body.nonce,
          mode,
          shares,
          shareUnits,
          priceWei,
          totalPaidWei: totalWei,
          amount: shares,
          score: 0,
          mintMultiplier: 1,
          txHash,
          isMock,
          chainId: getMintChainId(),
          contractAddress: isMock ? undefined : getMintManagerAddress(),
          authorizationDeadline: body.deadline,
          userSignature,
          status: "success"
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      txHash,
      shares,
      totalPaidWei: totalWei,
      explorerUrl: explorerUrlForTx(txHash),
      isMock,
      isMockMint: isMock,
      mockWarning: isMock ? "Mock mint mode is active." : undefined,
      chainId: getMintChainId()
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
