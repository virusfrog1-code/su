import { NextResponse, type NextRequest } from "next/server";
import { getAddress, isAddress, verifyMessage, type Address } from "viem";
import { prisma } from "@/lib/prisma";
import { jsonError, sanitizeError } from "@/lib/api";
import {
  DEFAULT_MINT_RULES,
  addBigIntStrings,
  shareUnitsToShares
} from "@/lib/mint/rules";
import {
  canUseMockMint,
  createDeadline,
  getExplorerUrl,
  getMintChainId,
  getMintManagerAddress,
  signFreeClaimAuthorization,
  submitFreeClaimTransaction
} from "@/lib/chain/serverMint";
import { getMockStore, getOrCreateMockWalletStats, shouldUseMockStore } from "@/lib/summon/mockStore";
import { buildFreeClaimMessage } from "@/lib/summon/tweetTemplate";
import { createSummonNonce } from "@/lib/summon/nonce";

export const runtime = "nodejs";

type ClaimFreeBody = {
  walletAddress?: string;
  signature?: `0x${string}`;
  userSignature?: `0x${string}`;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClaimFreeBody;
    if (!body.walletAddress || !isAddress(body.walletAddress)) {
      return jsonError("Invalid wallet address");
    }
    const userSignature = body.userSignature || body.signature;
    if (!userSignature) return jsonError("Missing wallet signature");
    const walletAddress = getAddress(body.walletAddress);

    if (shouldUseMockStore()) {
      const store = getMockStore();
      const binding = store.bindingsByWallet.get(walletAddress);
      if (!binding?.verified) return jsonError("X account is not bound");
      const stats = getOrCreateMockWalletStats(walletAddress);
      if (stats.freeShareUnitsClaimed > 0) return jsonError("Free 0.1 share already claimed");
      if (store.globalStats.totalShareUnitsMinted + store.rules.freeShareUnits > store.rules.totalShareUnitsCap) {
        return jsonError("Total 21000 shares cap exceeded");
      }

      const shares = shareUnitsToShares(store.rules.freeShareUnits);
      const message = buildFreeClaimMessage({ walletAddress, xUserId: binding.xUserId, shares });
      const ok = await verifyMessage({
        address: walletAddress as Address,
        message,
        signature: userSignature
      });
      if (!ok) return jsonError("Invalid wallet signature");

      let txHash: string;
      let isMock = true;
      if (canUseMockMint()) {
        txHash = `0x${`${Date.now()}`.padStart(64, "0").slice(0, 64)}`;
      } else {
        const nonce = createSummonNonce();
        const deadline = createDeadline();
        const authorization = await signFreeClaimAuthorization({
          walletAddress: walletAddress as Address,
          xUserId: binding.xUserId,
          nonce,
          shareUnits: store.rules.freeShareUnits,
          deadline
        });
        const result = await submitFreeClaimTransaction({
          walletAddress: walletAddress as Address,
          xUserId: binding.xUserId,
          nonce,
          deadline,
          authorizationSignature: authorization.signature
        });
        if (result.receipt.status !== "success") return jsonError("Free claim transaction reverted", 502);
        txHash = result.hash;
        isMock = false;
      }

      stats.freeShareUnitsClaimed += store.rules.freeShareUnits;
      stats.totalShareUnitsMinted += store.rules.freeShareUnits;
      store.globalStats.totalShareUnitsMinted += store.rules.freeShareUnits;
      store.mints.set(`free-${walletAddress}`, {
        walletAddress,
        xUserId: binding.xUserId,
        tweetId: `free-${walletAddress}`,
        mode: "FREE_X",
        nonce: "",
        shares,
        shareUnits: store.rules.freeShareUnits,
        priceWei: "0",
        totalPaidWei: "0",
        score: 0,
        mintMultiplier: 1,
        txHash,
        isMock,
        createdAt: new Date()
      });

      return NextResponse.json({
        success: true,
        mode: "FREE_X",
        shares,
        totalPaidWei: "0",
        txHash,
        explorerUrl: getExplorerUrl(txHash),
        isMock,
        isMockMint: isMock,
        mockWarning: isMock ? "Mock mint mode is active." : undefined,
        chainId: getMintChainId()
      });
    }

    const [config, binding, stats, globalStats] = await Promise.all([
      prisma.mintConfig.findFirst(),
      prisma.walletXBinding.findUnique({ where: { walletAddress } }),
      prisma.walletMintStats.findUnique({ where: { walletAddress } }),
      prisma.globalMintStats.findFirst()
    ]);
    const rules = config ?? DEFAULT_MINT_RULES;
    if (rules.paused) return jsonError("Mint is paused", 423);
    if (!binding?.verified || !binding.xUserId) return jsonError("X account is not bound");
    if ((stats?.freeShareUnitsClaimed ?? 0) > 0) return jsonError("Free 0.1 share already claimed");
    if ((globalStats?.totalShareUnitsMinted ?? 0) + rules.freeShareUnits > rules.totalShareUnitsCap) {
      return jsonError("Total 21000 shares cap exceeded");
    }

    const shares = shareUnitsToShares(rules.freeShareUnits);
    const message = buildFreeClaimMessage({ walletAddress, xUserId: binding.xUserId, shares });
    const ok = await verifyMessage({
      address: walletAddress as Address,
      message,
      signature: userSignature
    });
    if (!ok) return jsonError("Invalid wallet signature");

    let txHash: string;
    let isMock = true;
    let deadline: number | undefined;
    let nonce: string | undefined;
    if (canUseMockMint()) {
      txHash = `0x${`${Date.now()}`.padStart(64, "0").slice(0, 64)}`;
    } else {
      nonce = createSummonNonce();
      deadline = createDeadline();
      try {
        const authorization = await signFreeClaimAuthorization({
          walletAddress: walletAddress as Address,
          xUserId: binding.xUserId,
          nonce,
          shareUnits: rules.freeShareUnits,
          deadline
        });
        const result = await submitFreeClaimTransaction({
          walletAddress: walletAddress as Address,
          xUserId: binding.xUserId,
          nonce,
          deadline,
          authorizationSignature: authorization.signature
        });
        txHash = result.hash;
        isMock = false;
        if (result.receipt.status !== "success") {
          await prisma.mintRecord.create({
            data: {
              walletAddress,
              xUserId: binding.xUserId,
              nonce,
              mode: "FREE_X",
              shares,
              shareUnits: rules.freeShareUnits,
              priceWei: "0",
              totalPaidWei: "0",
              txHash,
              isMock,
              chainId: getMintChainId(),
              contractAddress: getMintManagerAddress(),
              authorizationDeadline: deadline,
              userSignature,
              status: "failed"
            }
          });
          return jsonError("Free claim transaction reverted", 502);
        }
      } catch (error) {
        await prisma.mintRecord.create({
          data: {
            walletAddress,
            xUserId: binding.xUserId,
            nonce,
            mode: "FREE_X",
            shares,
            shareUnits: rules.freeShareUnits,
            priceWei: "0",
            totalPaidWei: "0",
            isMock: false,
            chainId: getMintChainId(),
            contractAddress: getMintManagerAddress(),
            authorizationDeadline: deadline,
            userSignature,
            status: "failed"
          }
        });
        throw error;
      }
    }

    await prisma.$transaction([
      prisma.walletMintStats.upsert({
        where: { walletAddress },
        update: {
          freeSharesClaimed: shares,
          freeShareUnitsClaimed: rules.freeShareUnits,
          totalSharesMinted: shareUnitsToShares((stats?.totalShareUnitsMinted ?? 0) + rules.freeShareUnits),
          totalShareUnitsMinted: (stats?.totalShareUnitsMinted ?? 0) + rules.freeShareUnits
        },
        create: {
          walletAddress,
          freeSharesClaimed: shares,
          freeShareUnitsClaimed: rules.freeShareUnits,
          totalSharesMinted: shares,
          totalShareUnitsMinted: rules.freeShareUnits
        }
      }),
      prisma.globalMintStats.upsert({
        where: { id: globalStats?.id ?? "global" },
        update: {
          totalSharesMinted: shareUnitsToShares((globalStats?.totalShareUnitsMinted ?? 0) + rules.freeShareUnits),
          totalShareUnitsMinted: (globalStats?.totalShareUnitsMinted ?? 0) + rules.freeShareUnits,
          totalPaidWei: addBigIntStrings(globalStats?.totalPaidWei ?? "0", "0")
        },
        create: {
          id: "global",
          totalSharesMinted: shares,
          totalShareUnitsMinted: rules.freeShareUnits,
          totalPaidWei: "0"
        }
      }),
      prisma.mintRecord.create({
        data: {
          walletAddress,
          xUserId: binding.xUserId,
          mode: "FREE_X",
          nonce,
          shares,
          shareUnits: rules.freeShareUnits,
          priceWei: "0",
          totalPaidWei: "0",
          txHash,
          isMock,
          chainId: getMintChainId(),
          contractAddress: isMock ? undefined : getMintManagerAddress(),
          authorizationDeadline: deadline,
          userSignature,
          status: "success"
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      mode: "FREE_X",
      shares,
      totalPaidWei: "0",
      txHash,
      explorerUrl: getExplorerUrl(txHash),
      isMock,
      isMockMint: isMock,
      mockWarning: isMock ? "Mock mint mode is active." : undefined,
      chainId: getMintChainId()
    });
  } catch (error) {
    return jsonError(sanitizeError(error), 500);
  }
}
