import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  keccak256,
  parseEther,
  stringToBytes,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mintManagerAbi } from "@/lib/chain/mintManager";
import { assertProductionMockAllowed, isEnabled, isProduction, requireServerEnv } from "@/lib/env";
import { type MintMode } from "@/lib/mint/rules";

export type PaidMintMode = Exclude<MintMode, "FREE_X">;

export type PaidAuthorizationInput = {
  walletAddress: Address;
  mode: PaidMintMode;
  shareUnits: number;
  tweetId?: string;
  nonce: string;
  pricePerUnitWei: string;
};

export type FreeAuthorizationInput = {
  walletAddress: Address;
  xUserId: string;
  nonce: string;
  shareUnits: number;
};

export function canUseMockMint() {
  assertProductionMockAllowed("ENABLE_MOCK_MINT", process.env.ENABLE_MOCK_MINT);
  if (isEnabled(process.env.ENABLE_MOCK_MINT)) {
    if (!isProduction()) return true;
    return isEnabled(process.env.ALLOW_PRODUCTION_MOCK);
  }
  return false;
}

export function getMintChainId() {
  const serverChainId = process.env.CHAIN_ID;
  const publicChainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (serverChainId && publicChainId && serverChainId !== publicChainId) {
    throw new Error("CHAIN_ID and NEXT_PUBLIC_CHAIN_ID must match");
  }
  const chainId = Number(serverChainId || publicChainId || "1");
  if (isProduction() && chainId !== 1 && chainId !== 11155111) {
    throw new Error("Production mint chain must be Ethereum Mainnet or Sepolia");
  }
  return chainId;
}

export function getMintManagerAddress() {
  return requireServerEnv("MINT_MANAGER_ADDRESS") as Address;
}

export function getExplorerUrl(txHash: string) {
  const chainId = getMintChainId();
  const base = chainId === 1 ? "https://etherscan.io" : "https://sepolia.etherscan.io";
  return `${base}/tx/${txHash}`;
}

export function createDeadline(minutes = 10) {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

export function hashText(value: string) {
  return keccak256(stringToBytes(value));
}

export function getRpcUrlForChain(chainId = getMintChainId()) {
  const chainRpc =
    chainId === 11155111
      ? process.env.SEPOLIA_RPC_URL
      : chainId === 1
        ? process.env.MAINNET_RPC_URL
        : undefined;
  const rpcUrl = chainRpc || process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error(
      chainId === 11155111
        ? "Missing required server env: SEPOLIA_RPC_URL or RPC_URL"
        : chainId === 1
          ? "Missing required server env: MAINNET_RPC_URL or RPC_URL"
          : "Missing required server env: RPC_URL"
    );
  }
  return rpcUrl;
}

function getChain() {
  const chainId = getMintChainId();
  return defineChain({
    id: chainId,
    name:
      chainId === 1
        ? "Ethereum Mainnet"
        : chainId === 11155111
          ? "Sepolia Testnet"
          : `SUMMON Chain ${chainId}`,
    nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
    rpcUrls: {
      default: { http: [getRpcUrlForChain(chainId)] }
    }
  });
}

export function getPublicClient() {
  const chain = getChain();
  return createPublicClient({
    chain,
    transport: http(getRpcUrlForChain(chain.id))
  });
}

export function getRelayerWalletClient() {
  const chain = getChain();
  const account = privateKeyToAccount(requireServerEnv("PRIVATE_KEY_RELAYER") as Hex);
  return createWalletClient({
    account,
    chain,
    transport: http(getRpcUrlForChain(chain.id))
  });
}

export function getRelayerAccount() {
  return privateKeyToAccount(requireServerEnv("PRIVATE_KEY_RELAYER") as Hex);
}

function getAuthorizedSignerAccount() {
  return privateKeyToAccount(requireServerEnv("AUTHORIZED_SIGNER_PRIVATE_KEY") as Hex);
}

export function buildPaidMintTypedData(input: PaidAuthorizationInput & { deadline: number }) {
  const contractAddress = getMintManagerAddress();
  const chainId = getMintChainId();
  const baseDomain = {
    name: "SUMMON MintManager",
    version: "1",
    chainId,
    verifyingContract: contractAddress
  } as const;

  if (input.mode === "X_POST") {
    return {
      domain: baseDomain,
      types: {
        MintWithTweet: [
          { name: "user", type: "address" },
          { name: "tweetIdHash", type: "bytes32" },
          { name: "nonceHash", type: "bytes32" },
          { name: "shareUnits", type: "uint256" },
          { name: "pricePerUnitWei", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      },
      primaryType: "MintWithTweet" as const,
      message: {
        user: input.walletAddress,
        tweetIdHash: hashText(input.tweetId || ""),
        nonceHash: hashText(input.nonce),
        shareUnits: BigInt(input.shareUnits),
        pricePerUnitWei: BigInt(input.pricePerUnitWei),
        deadline: BigInt(input.deadline)
      }
    };
  }

  return {
    domain: baseDomain,
    types: {
      FallbackMint: [
        { name: "user", type: "address" },
        { name: "nonceHash", type: "bytes32" },
        { name: "shareUnits", type: "uint256" },
        { name: "pricePerUnitWei", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    primaryType: "FallbackMint" as const,
    message: {
      user: input.walletAddress,
      nonceHash: hashText(input.nonce),
      shareUnits: BigInt(input.shareUnits),
      pricePerUnitWei: BigInt(input.pricePerUnitWei),
      deadline: BigInt(input.deadline)
    }
  };
}

export function buildFreeClaimTypedData(input: FreeAuthorizationInput & { deadline: number }) {
  return {
    domain: {
      name: "SUMMON MintManager",
      version: "1",
      chainId: getMintChainId(),
      verifyingContract: getMintManagerAddress()
    },
    types: {
      FreeClaim: [
        { name: "user", type: "address" },
        { name: "xUserIdHash", type: "bytes32" },
        { name: "nonceHash", type: "bytes32" },
        { name: "shareUnits", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    },
    primaryType: "FreeClaim" as const,
    message: {
      user: input.walletAddress,
      xUserIdHash: hashText(input.xUserId),
      nonceHash: hashText(input.nonce),
      shareUnits: BigInt(input.shareUnits),
      deadline: BigInt(input.deadline)
    }
  };
}

export async function signPaidMintAuthorization(input: PaidAuthorizationInput & { deadline: number }) {
  const typedData = buildPaidMintTypedData(input);
  const signature = await getAuthorizedSignerAccount().signTypedData(typedData as never);
  return { typedData, signature };
}

export async function signFreeClaimAuthorization(input: FreeAuthorizationInput & { deadline: number }) {
  const typedData = buildFreeClaimTypedData(input);
  const signature = await getAuthorizedSignerAccount().signTypedData(typedData as never);
  return { typedData, signature };
}

export async function submitPaidMintTransaction(input: {
  walletAddress: Address;
  mode: PaidMintMode;
  shareUnits: number;
  tweetId?: string;
  nonce: string;
  deadline: number;
  authorizationSignature: Hex;
  totalWei: string;
}) {
  const walletClient = getRelayerWalletClient();
  const publicClient = getPublicClient();
  const address = getMintManagerAddress();

  const hash =
    input.mode === "X_POST"
      ? await walletClient.writeContract({
          address,
          abi: mintManagerAbi,
          functionName: "mintWithTweet",
          args: [
            input.walletAddress,
            input.tweetId || "",
            input.nonce,
            BigInt(input.shareUnits),
            BigInt(input.deadline),
            input.authorizationSignature
          ],
          value: BigInt(input.totalWei)
        })
      : await walletClient.writeContract({
          address,
          abi: mintManagerAbi,
          functionName: "mintFallback",
          args: [
            input.walletAddress,
            input.nonce,
            BigInt(input.shareUnits),
            BigInt(input.deadline),
            input.authorizationSignature
          ],
          value: BigInt(input.totalWei)
        });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export async function submitFreeClaimTransaction(input: {
  walletAddress: Address;
  xUserId: string;
  nonce: string;
  deadline: number;
  authorizationSignature: Hex;
}) {
  const walletClient = getRelayerWalletClient();
  const publicClient = getPublicClient();
  const hash = await walletClient.writeContract({
    address: getMintManagerAddress(),
    abi: mintManagerAbi,
    functionName: "claimFreeWithX",
    args: [
      input.walletAddress,
      input.xUserId,
      input.nonce,
      BigInt(input.deadline),
      input.authorizationSignature
    ]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export async function getTreasury() {
  return getPublicClient().readContract({
    address: getMintManagerAddress(),
    abi: mintManagerAbi,
    functionName: "treasury"
  });
}

export async function getAuthorizedSigner() {
  return getPublicClient().readContract({
    address: getMintManagerAddress(),
    abi: mintManagerAbi,
    functionName: "authorizedSigner"
  });
}

export async function getPaused() {
  return getPublicClient().readContract({
    address: getMintManagerAddress(),
    abi: mintManagerAbi,
    functionName: "paused"
  });
}

export async function getTotalMinted() {
  return getPublicClient().readContract({
    address: getMintManagerAddress(),
    abi: mintManagerAbi,
    functionName: "totalShareUnitsMinted"
  });
}

export async function getWalletStats(wallet: Address) {
  const result = await getPublicClient().readContract({
    address: getMintManagerAddress(),
    abi: mintManagerAbi,
    functionName: "walletStats",
    args: [wallet]
  });
  const [paidStandardUnits, paidFallbackUnits, freeUnitsClaimed, totalUnitsMinted] = result;
  return {
    paidStandardUnits: paidStandardUnits.toString(),
    paidFallbackUnits: paidFallbackUnits.toString(),
    freeUnitsClaimed: freeUnitsClaimed.toString(),
    totalUnitsMinted: totalUnitsMinted.toString()
  };
}

export async function getMintManagerStatus() {
  const publicClient = getPublicClient();
  const relayer = getRelayerAccount().address;
  const mintManagerAddress = getMintManagerAddress();
  const [balanceWei, chainId, code, treasury, authorizedSigner, paused, totalShareUnitsMinted, totalShareUnitsCap] =
    await Promise.all([
      publicClient.getBalance({ address: relayer }),
      publicClient.getChainId(),
      publicClient.getCode({ address: mintManagerAddress }),
      getTreasury(),
      getAuthorizedSigner(),
      getPaused(),
      getTotalMinted(),
      publicClient.readContract({
        address: mintManagerAddress,
        abi: mintManagerAbi,
        functionName: "totalShareUnitsCap"
      })
    ]);

  const lowBalanceThresholdWei = parseEther("0.02");
  const balanceWarning =
    balanceWei < lowBalanceThresholdWei
      ? chainId === 1
        ? "Relayer balance is too low for production mint"
        : "Relayer balance is low"
      : undefined;

  return {
    relayerAddress: relayer,
    relayerEthBalance: formatEther(balanceWei),
    relayerBalanceWei: balanceWei.toString(),
    relayerBalanceWarning: balanceWarning,
    chainId,
    rpcConnected: true,
    mintManagerAddress,
    mintManagerCodeExists: Boolean(code && code !== "0x"),
    treasury,
    authorizedSigner,
    paused,
    totalShareUnitsMinted: totalShareUnitsMinted.toString(),
    totalShareUnitsCap: totalShareUnitsCap.toString()
  };
}
