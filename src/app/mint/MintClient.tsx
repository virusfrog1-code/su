"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useChainId, useSignMessage, useSwitchChain } from "wagmi";
import { WalletButton } from "@/components/WalletButton";
import { formatWeiToEth, type MintMode } from "@/lib/mint/rules";
import {
  calculatePayableWei,
  formatUnitsToShares,
  getMaxInputShares,
  parseSharesToUnits
} from "@/lib/mint/shareUnits";
import { useI18n } from "@/lib/i18n";
import { buildFreeClaimMessage } from "@/lib/summon/tweetTemplate";
import { shortAddress } from "@/lib/utils";

type PaidMintMode = Exclude<MintMode, "FREE_X">;

type NonceResponse = {
  nonce: string;
  expiresAt: string;
  tweetText: string;
  tweetIntentUrl: string;
  mode: PaidMintMode;
};

type VerificationResponse = {
  valid: boolean;
  tweetId: string;
  tweetText: string;
  score: number;
  reason: string;
  mintMultiplier: number;
  style: string;
  estimatedMintAmount: string;
  xUserId?: string;
  xUsername?: string;
};

type MintConfigResponse = {
  totalSharesCap: string;
  totalShareUnitsCap: number;
  totalSharesMinted: string;
  standardPriceWei: string;
  standardPricePerUnitWei: string;
  fallbackPriceWei: string;
  fallbackPricePerUnitWei: string;
  maxStandardSharesPerWallet: string;
  maxStandardShareUnits: number;
  maxFallbackSharesPerWallet: string;
  maxFallbackShareUnits: number;
  freeSharesPerWalletX: string;
  paused: boolean;
  mockMode?: boolean;
  isMockMint?: boolean;
  xFollowCheckMock?: boolean;
  chainId?: number;
  contractAddress?: string;
};

type MintStatsResponse = {
  walletAddress: string;
  xBinding: {
    bound: boolean;
    xUserId?: string;
    xUsername?: string;
  };
  paidStandardShares: string;
  paidFallbackShares: string;
  freeSharesClaimed: string;
  remainingStandardShares: string;
  remainingFallbackShares: string;
  canClaimFree: boolean;
};

type BindStartResponse = {
  bindCode: string;
  message: string;
};

type BindVerifyResponse = {
  bound: boolean;
  xUserId: string;
  xUsername?: string;
  bindTweetId: string;
};

type PrepareMintResponse = {
  mode: PaidMintMode;
  prepareId: string;
  shares: string;
  shareUnits: number;
  priceWei: string;
  pricePerUnitWei: string;
  totalWei: string;
  nonce?: string;
  deadline: number;
  contractAddress: string;
  chainId: number;
  authorization: { signature: `0x${string}`; typedData: unknown } | null;
  mock?: boolean;
  mockWarning?: string;
  messageToSign: string;
};

type MintResponse = {
  success: boolean;
  mode?: MintMode;
  txHash: string;
  shares: string;
  totalPaidWei: string;
  explorerUrl?: string;
  isMock?: boolean;
  mockWarning?: string;
  chainId?: number;
};

type BusyState =
  | "bindStart"
  | "bindVerify"
  | "nonce"
  | "verify"
  | "prepare"
  | "signature"
  | "mint"
  | "freeSignature"
  | "freeMint"
  | null;

const steps = [
  { id: "wallet_connected", labelKey: "mint.stepWallet", disabledKey: "mint.disabledWallet" },
  { id: "code_generated", labelKey: "mint.stepCode", disabledKey: "mint.disabledCode" },
  { id: "tweet_posted", labelKey: "mint.stepPost", disabledKey: "mint.disabledPost" },
  { id: "tweet_verified", labelKey: "mint.stepVerify", disabledKey: "mint.disabledVerify" },
  { id: "minted", labelKey: "mint.stepMint", disabledKey: "mint.disabledMint" }
] as const;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || payload.error || payload.reason || "Request failed");
  return payload as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || payload.error || payload.reason || "Request failed");
  return payload as T;
}

function formatCountdown(milliseconds: number | null) {
  if (milliseconds === null) return "--:--";
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function validTweetUrl(value: string) {
  return /^(https?:\/\/)?(mobile\.)?(x|twitter)\.com\/[^/]+\/status(?:es)?\/\d{10,30}/i.test(
    value.trim()
  );
}

function safeShareUnits(value: string) {
  try {
    return parseSharesToUnits(value);
  } catch {
    return 0;
  }
}

function intentUrl(text: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function chainLabel(chainId?: number) {
  if (chainId === 1) return "Ethereum Mainnet";
  if (chainId === 11155111) return "Sepolia Testnet";
  return `Chain ${chainId || 1}`;
}

function formatShareInput(units: number) {
  const formatted = formatUnitsToShares(units);
  return formatted.includes(".") ? formatted : `${formatted}.0`;
}

export function MintClient() {
  const { t } = useI18n();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switchingChain } = useSwitchChain();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [mode, setMode] = useState<PaidMintMode>("X_POST");
  const [config, setConfig] = useState<MintConfigResponse | null>(null);
  const [stats, setStats] = useState<MintStatsResponse | null>(null);
  const [bindStart, setBindStart] = useState<BindStartResponse | null>(null);
  const [bindTweetUrl, setBindTweetUrl] = useState("");
  const [nonceData, setNonceData] = useState<NonceResponse | null>(null);
  const [tweetUrl, setTweetUrl] = useState("");
  const [postWindowOpened, setPostWindowOpened] = useState(false);
  const [verification, setVerification] = useState<VerificationResponse | null>(null);
  const [shares, setShares] = useState("1");
  const [prepared, setPrepared] = useState<PrepareMintResponse | null>(null);
  const [mintResult, setMintResult] = useState<MintResponse | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [timeRemainingMs, setTimeRemainingMs] = useState<number | null>(null);
  const [activeWallet, setActiveWallet] = useState<string | undefined>();
  const summonXHandle = process.env.NEXT_PUBLIC_SUMMON_X_HANDLE || "Summon_eth";
  const grokXHandle = process.env.NEXT_PUBLIC_GROK_X_HANDLE || "grok";
  const requiredHashtag = process.env.NEXT_PUBLIC_REQUIRED_HASHTAG || "#SUMMON";
  const secondaryHashtag = process.env.NEXT_PUBLIC_REQUIRED_SECONDARY_HASHTAG || "#GrokMint";
  const walletShortLabel = address ? shortAddress(address) : t("mint.walletShortPlaceholder");

  function resetFlow(keepBind = true) {
    setNonceData(null);
    setTweetUrl("");
    setPostWindowOpened(false);
    setVerification(null);
    setPrepared(null);
    setMintResult(null);
    setError("");
    setTimeRemainingMs(null);
    if (!keepBind) {
      setBindStart(null);
      setBindTweetUrl("");
    }
  }

  const refreshStats = useCallback(async (walletAddress = address) => {
    if (!walletAddress) {
      setStats(null);
      return;
    }
    const nextStats = await getJson<MintStatsResponse>(
      `/api/mint/stats?walletAddress=${encodeURIComponent(walletAddress)}`
    );
    setStats(nextStats);
  }, [address]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    getJson<MintConfigResponse>("/api/mint/config")
      .then(setConfig)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Failed to load mint config"));
  }, []);

  useEffect(() => {
    if (!address) {
      resetFlow(false);
      setStats(null);
      setActiveWallet(undefined);
      return;
    }

    if (activeWallet && activeWallet.toLowerCase() !== address.toLowerCase()) {
      resetFlow(false);
      setToast(t("mint.walletChanged"));
    }

    setActiveWallet(address);
    refreshStats(address).catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Failed to load wallet stats")
    );
  }, [address, activeWallet, refreshStats, t]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!nonceData) return;

    const tick = () => {
      setTimeRemainingMs(new Date(nonceData.expiresAt).getTime() - Date.now());
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [nonceData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const isExpired = nonceData ? (timeRemainingMs ?? 0) <= 0 : false;
  const trimmedTweetUrl = tweetUrl.trim();
  const trimmedBindTweetUrl = bindTweetUrl.trim();
  const tweetUrlLooksValid = !trimmedTweetUrl || validTweetUrl(trimmedTweetUrl);
  const bindTweetUrlLooksValid = !trimmedBindTweetUrl || validTweetUrl(trimmedBindTweetUrl);
  const tweetPosted =
    Boolean(trimmedTweetUrl) || postWindowOpened || Boolean(verification) || Boolean(mintResult);
  const xBound = Boolean(stats?.xBinding.bound);
  const configuredChainId = config?.chainId || Number(process.env.NEXT_PUBLIC_CHAIN_ID || "1");
  const realModeWrongChain = Boolean(config && !config.mockMode && chainId !== configuredChainId);
  const shareUnits = safeShareUnits(shares);
  const remainingShares = mode === "X_POST" ? stats?.remainingStandardShares : stats?.remainingFallbackShares;
  const remainingUnits = safeShareUnits(remainingShares || "0");
  const alreadyMintedShares = mode === "X_POST" ? stats?.paidStandardShares : stats?.paidFallbackShares;
  const totalMintedUnits = safeShareUnits(config?.totalSharesMinted || "0");
  const totalRemainingUnits = config
    ? Math.max(0, config.totalShareUnitsCap - totalMintedUnits)
    : 0;
  const totalRemainingShares = formatUnitsToShares(totalRemainingUnits);
  const hardMaxUnits = mode === "X_POST"
    ? config?.maxStandardShareUnits ?? 1000
    : config?.maxFallbackShareUnits ?? 200;
  const hardMaxShares = formatUnitsToShares(hardMaxUnits);
  const maxInputShares = config
    ? getMaxInputShares(
        mode,
        {
          remainingStandardShares: stats?.remainingStandardShares,
          remainingFallbackShares: stats?.remainingFallbackShares
        },
        config,
        totalMintedUnits
      )
    : hardMaxShares;
  const priceWei = mode === "X_POST" ? config?.standardPriceWei : config?.fallbackPriceWei;
  const totalWei = shareUnits && config ? calculatePayableWei(mode, shareUnits, config).toString() : "0";
  const totalEth = formatWeiToEth(totalWei);
  const requiredChainId = configuredChainId;
  const shareInputError = (() => {
    const normalized = shares.trim();
    if (!normalized) return t("mint.inputRequired");
    if (normalized.startsWith("-") || normalized === "0" || normalized === "0.0") {
      return t("mint.inputMin");
    }
    if (!/^\d+(\.\d)?$/.test(normalized)) return t("mint.inputIncrement");
    if (shareUnits <= 0) return t("mint.inputMin");
    if (shareUnits > hardMaxUnits) {
      return mode === "X_POST"
        ? t("mint.inputModeMax", { max: hardMaxShares })
        : t("mint.inputFallbackMax");
    }
    if (shareUnits > remainingUnits) {
      return mode === "X_POST"
        ? t("mint.inputXRemaining", { remaining: remainingShares || "0", input: normalized })
        : t("mint.inputRemaining", { remaining: remainingShares || "0" });
    }
    if (config && shareUnits > totalRemainingUnits) {
      return t("mint.inputTotalRemaining", { remaining: totalRemainingShares });
    }
    return "";
  })();
  const prepareBlockedReason =
    shareInputError ||
    (!address ? t("mint.connectFirst") : "") ||
    (mode === "X_POST" && (!xBound || !verification?.valid) ? t("mint.completeXFirst") : "") ||
    (config?.paused ? t("mint.paused") : "") ||
    (realModeWrongChain ? t("mint.switchNetworkFirst", { chain: chainLabel(configuredChainId) }) : "");

  const activeStep = useMemo(() => {
    if (!isConnected) return 0;
    if (mode === "NO_X_FALLBACK") return mintResult?.success ? 5 : 4;
    if (!nonceData || isExpired) return 1;
    if (!tweetPosted) return 2;
    if (!verification?.valid) return 3;
    if (!mintResult?.success) return 4;
    return 5;
  }, [isConnected, isExpired, mintResult, mode, nonceData, tweetPosted, verification]);

  const completedSteps =
    mode === "NO_X_FALLBACK"
      ? [isConnected, isConnected, isConnected, isConnected, Boolean(mintResult?.success)]
      : [
          isConnected,
          Boolean(nonceData && !isExpired),
          tweetPosted,
          Boolean(verification?.valid),
          Boolean(mintResult?.success)
        ];

  const canGenerateCode = Boolean(address && mode === "X_POST" && xBound && !busy);
  const canVerifyTweet = Boolean(
    address &&
      mode === "X_POST" &&
      nonceData &&
      !isExpired &&
      trimmedTweetUrl &&
      tweetUrlLooksValid &&
      !busy &&
      !mintResult?.success
  );
  const canPrepare = Boolean(
    address &&
      !busy &&
      !config?.paused &&
      !prepareBlockedReason &&
      (mode === "NO_X_FALLBACK" || (nonceData && verification?.valid))
  );
  const wrongChain = Boolean(prepared && !prepared.mock && chainId !== prepared.chainId);
  const canMint = Boolean(address && prepared && !wrongChain && !mintResult?.success && !busy);
  const freeWrongChain = Boolean(!config?.mockMode && chainId !== requiredChainId);
  const canClaimFree = Boolean(address && xBound && stats?.canClaimFree && !freeWrongChain && !busy);

  function switchMode(nextMode: PaidMintMode) {
    setMode(nextMode);
    resetFlow(true);
    setPrepared(null);
    setMintResult(null);
    setError("");
  }

  async function startBinding() {
    if (!address) return;
    setError("");
    setBusy("bindStart");
    try {
      const data = await postJson<BindStartResponse>("/api/x/bind/start", {
        walletAddress: address
      });
      setBindStart(data);
      setToast(t("mint.bindStarted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to start X binding");
    } finally {
      setBusy(null);
    }
  }

  async function copyBindMessage() {
    if (!bindStart) return;
    try {
      await navigator.clipboard.writeText(bindStart.message);
      setToast(t("mint.tweetCopied"));
    } catch {
      setError(t("mint.copyFailed"));
    }
  }

  function postBindMessage() {
    if (!bindStart) return;
    window.open(intentUrl(bindStart.message), "_blank", "noopener,noreferrer");
    setToast(t("mint.xOpened"));
  }

  async function verifyBinding() {
    if (!address) return;
    if (!validTweetUrl(trimmedBindTweetUrl)) {
      setError(t("mint.urlHint"));
      return;
    }

    setError("");
    setBusy("bindVerify");
    try {
      await postJson<BindVerifyResponse>("/api/x/bind/verify", {
        walletAddress: address,
        tweetUrl: trimmedBindTweetUrl
      });
      setBindStart(null);
      setBindTweetUrl("");
      await refreshStats(address);
      setToast(t("mint.bindVerified"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to verify X binding");
    } finally {
      setBusy(null);
    }
  }

  async function generateNonce() {
    if (!address) return;
    setError("");
    setBusy("nonce");
    setVerification(null);
    setPrepared(null);
    setMintResult(null);
    setTweetUrl("");
    setPostWindowOpened(false);

    try {
      const data = await postJson<NonceResponse>("/api/summon/create-nonce", {
        walletAddress: address,
        mode
      });
      setNonceData(data);
      setToast(t("mint.codeGenerated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("mint.generateFirst"));
    } finally {
      setBusy(null);
    }
  }

  async function copyTweetText() {
    if (!nonceData) return;
    try {
      await navigator.clipboard.writeText(nonceData.tweetText);
      setToast(t("mint.tweetCopied"));
    } catch {
      setError(t("mint.copyFailed"));
    }
  }

  function openTweetWindow() {
    if (!nonceData || isExpired) return;
    window.open(nonceData.tweetIntentUrl, "_blank", "noopener,noreferrer");
    setPostWindowOpened(true);
    setToast(t("mint.xOpened"));
  }

  async function verifyTweet() {
    if (!address || !nonceData) return;
    setError("");
    setBusy("verify");
    setVerification(null);
    setPrepared(null);
    setMintResult(null);

    try {
      const data = await postJson<VerificationResponse>("/api/summon/verify-tweet", {
        walletAddress: address,
        tweetUrl: trimmedTweetUrl,
        nonce: nonceData.nonce
      });

      if (!data.valid) {
        setError(data.reason || t("mint.verifyToMint"));
        return;
      }

      setVerification(data);
      setToast(t("mint.verifiedToast"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("mint.verifyToMint"));
    } finally {
      setBusy(null);
    }
  }

  async function prepareMint() {
    if (!address) return;
    setError("");
    setBusy("prepare");
    setPrepared(null);
    setMintResult(null);

    try {
      const data = await postJson<PrepareMintResponse>("/api/summon/prepare-mint", {
        walletAddress: address,
        mode,
        shares,
        tweetId: mode === "X_POST" ? verification?.tweetId : undefined,
        nonce: mode === "X_POST" ? nonceData?.nonce : undefined
      });
      setPrepared(data);
      setToast(t("mint.prepared"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to prepare mint");
    } finally {
      setBusy(null);
    }
  }

  async function mintSummon() {
    if (!address || !prepared) return;
    setError("");

    try {
      setBusy("signature");
      const signature = await signMessageAsync({ message: prepared.messageToSign });

      setBusy("mint");
      const data = await postJson<MintResponse>("/api/summon/mint", {
        walletAddress: address,
        mode,
        prepareId: prepared.prepareId,
        shares: prepared.shares,
        shareUnits: String(prepared.shareUnits),
        tweetId: mode === "X_POST" ? verification?.tweetId : undefined,
        nonce: prepared.nonce || (mode === "X_POST" ? nonceData?.nonce : undefined),
        deadline: prepared.deadline,
        authorizationSignature: prepared.authorization?.signature,
        userSignature: signature,
        valueWei: prepared.totalWei
      });
      setMintResult(data);
      await Promise.all([refreshStats(address), getJson<MintConfigResponse>("/api/mint/config").then(setConfig)]);
      setToast(t("mint.mintSucceeded"));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Mint failed";
      setError(message.toLowerCase().includes("reject") ? t("mint.signatureRejected") : message);
    } finally {
      setBusy(null);
    }
  }

  async function claimFree() {
    if (!address || !stats?.xBinding.xUserId || !config) return;
    setError("");
    try {
      setBusy("freeSignature");
      const message = buildFreeClaimMessage({
        walletAddress: address,
        xUserId: stats.xBinding.xUserId,
        shares: config.freeSharesPerWalletX
      });
      const signature = await signMessageAsync({ message });

      setBusy("freeMint");
      const data = await postJson<MintResponse>("/api/summon/claim-free", {
        walletAddress: address,
        userSignature: signature
      });
      setMintResult(data);
      await Promise.all([refreshStats(address), getJson<MintConfigResponse>("/api/mint/config").then(setConfig)]);
      setToast(t("mint.freeClaimed"));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Free claim failed";
      setError(message.toLowerCase().includes("reject") ? t("mint.signatureRejected") : message);
    } finally {
      setBusy(null);
    }
  }

  const mintButtonLabel = (() => {
    if (mintResult?.success) return t("mint.minted");
    if (busy === "signature" || signing) return t("mint.waitSignature");
    if (busy === "mint") return t("mint.minting");
    return t("mint.signMint");
  })();

  const shareText = mintResult
    ? `I just summoned Grok and minted ${mintResult.shares} SUMMON shares.\n\nPost to Summon.\nSummon Grok.\nMint on-chain.\n\n#SUMMON #GrokMint #AIMeme`
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
      <aside className="terminal-panel rounded-lg p-5">
        <h2 className="text-lg font-semibold text-white">{t("mint.stepsTitle")}</h2>
        <div className="mt-5 space-y-3">
          {steps.map((step, index) => {
            const complete = completedSteps[index];
            const current = activeStep === index;
            const disabled = !complete && !current;
            return (
              <div
                key={step.id}
                className={`rounded-md border p-4 transition ${
                  complete
                    ? "border-signal/40 bg-signal/15 text-white"
                    : current
                      ? "border-signal bg-signal/10 text-white shadow-glow"
                      : "border-white/10 bg-white/[0.03] text-silver/54"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em]">
                    {t("mint.step")} {index + 1}
                  </p>
                  {complete ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-signal text-xs font-black text-black">
                      OK
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 font-semibold">{t(step.labelKey)}</p>
                {disabled ? <p className="mt-2 text-xs text-silver/42">{t(step.disabledKey)}</p> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-lg border border-plasma/25 bg-plasma/10 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-plasma">
            {t("mint.antiTheftTitle")}
          </p>
          <p className="mt-3 text-sm leading-6 text-silver/68">{t("mint.antiTheftDesc")}</p>
        </div>
      </aside>

      <section className="terminal-panel rounded-lg p-5 sm:p-6">
        {toast ? (
          <div className="mb-4 rounded-md border border-signal/35 bg-signal/10 p-3 text-sm text-signal">
            {toast}
          </div>
        ) : null}

        {config?.mockMode || prepared?.mock || mintResult?.isMock ? (
          <div className="mb-4 rounded-md border border-plasma/35 bg-plasma/10 p-3 text-sm text-plasma">
            {prepared?.mockWarning || mintResult?.mockWarning || t("mint.mockMode")}
          </div>
        ) : null}

        {config?.xFollowCheckMock ? (
          <div className="mb-4 rounded-md border border-yellow-300/35 bg-yellow-300/10 p-3 text-sm text-yellow-100">
            {t("mint.followMockWarning")}
          </div>
        ) : null}

        <div className="mb-4 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-silver/70">
          {t("mint.currentEnv")}:{" "}
          <span className="font-bold text-white">
            {config?.mockMode ? t("mint.mockModeLabel") : chainLabel(config?.chainId || requiredChainId)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm text-silver/56">{t("mint.wallet")}</p>
            <p className="mt-1 font-mono text-sm text-white" title={address || t("mint.notConnected")}>
              {address ? shortAddress(address) : t("mint.notConnected")}
            </p>
            {address ? (
              <p className="mt-1 break-all font-mono text-xs text-silver/46">{address}</p>
            ) : (
              <p className="mt-1 text-xs text-silver/46">{t("mint.connectHint")}</p>
            )}
          </div>
          <WalletButton />
        </div>

        <div className="mt-6 grid gap-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-xl font-bold text-white">{t("mint.modeTitle")}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => switchMode("X_POST")}
                className={`rounded-lg border p-4 text-left transition ${
                  mode === "X_POST"
                    ? "border-signal bg-signal/10 shadow-glow"
                    : "border-white/10 bg-black/25 hover:border-signal/40"
                }`}
              >
                <p className="font-bold text-white">{t("mint.xPostTitle")}</p>
                <p className="mt-2 text-sm leading-6 text-silver/62">{t("mint.xPostDesc")}</p>
              </button>
              <button
                type="button"
                onClick={() => switchMode("NO_X_FALLBACK")}
                className={`rounded-lg border p-4 text-left transition ${
                  mode === "NO_X_FALLBACK"
                    ? "border-signal bg-signal/10 shadow-glow"
                    : "border-white/10 bg-black/25 hover:border-signal/40"
                }`}
              >
                <p className="font-bold text-white">{t("mint.fallbackTitle")}</p>
                <p className="mt-2 text-sm leading-6 text-silver/62">{t("mint.fallbackDesc")}</p>
              </button>
            </div>
            <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-signal">
                {t("mint.allocation")}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-silver/48">{t("mint.price")}</p>
                  <p className="mt-1 font-mono text-sm text-white">
                    {formatWeiToEth(priceWei || "0")} ETH/{t("unit.share")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-silver/48">{t("mint.walletMax")}</p>
                  <p className="mt-1 font-mono text-sm text-white">{hardMaxShares} {t("unit.shares")}</p>
                </div>
                <div>
                  <p className="text-xs text-silver/48">{t("mint.alreadyMinted")}</p>
                  <p className="mt-1 font-mono text-sm text-white">{alreadyMintedShares || "0"} {t("unit.shares")}</p>
                </div>
                <div>
                  <p className="text-xs text-silver/48">{t("mint.remaining")}</p>
                  <p className="mt-1 font-mono text-sm text-white">{remainingShares || "0"} {t("unit.shares")}</p>
                </div>
                <div>
                  <p className="text-xs text-silver/48">{t("mint.totalPayable")}</p>
                  <p className="mt-1 font-mono text-sm text-white">{totalEth} ETH</p>
                </div>
                <div>
                  <p className="text-xs text-silver/48">{t("mint.totalCap")}</p>
                  <p className="mt-1 font-mono text-sm text-white">{config?.totalSharesCap || "21000"} {t("unit.shares")}</p>
                </div>
                <div>
                  <p className="text-xs text-silver/48">{t("mint.totalMinted")}</p>
                  <p className="mt-1 font-mono text-sm text-white">{config?.totalSharesMinted || "0"} {t("unit.shares")}</p>
                </div>
                <div>
                  <p className="text-xs text-silver/48">{t("mint.totalRemaining")}</p>
                  <p className="mt-1 font-mono text-sm text-white">{totalRemainingShares} {t("unit.shares")}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-white/10 bg-black/25 p-3">
                <p className="text-xs text-silver/48">{t("mint.price")}</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {mode === "X_POST" ? "0.005" : "0.007"} ETH / {t("unit.share")}
                </p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/25 p-3">
                <p className="text-xs text-silver/48">{t("mint.remaining")}</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {remainingShares || hardMaxShares} / {hardMaxShares} {t("unit.shares")}
                </p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/25 p-3">
                <p className="text-xs text-silver/48">{t("mint.totalMinted")}</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {config?.totalSharesMinted || "0"} / {config?.totalSharesCap || "21000"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{t("mint.bindTitle")}</h2>
                <p className="mt-2 text-sm text-silver/62">{t("mint.bindDesc")}</p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  xBound
                    ? "border-signal/40 bg-signal/15 text-signal"
                    : "border-white/10 bg-white/[0.03] text-silver/62"
                }`}
              >
                {xBound ? t("mint.bound") : t("mint.notBound")}
              </span>
            </div>

            <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-4 text-xs leading-6 text-silver/66">
              <p className="font-bold text-white">{t("mint.bindRulesIntro")}</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                <li>@{summonXHandle}</li>
                <li>@{grokXHandle}</li>
                <li>{requiredHashtag}</li>
                <li>{secondaryHashtag}</li>
                <li>{walletShortLabel}</li>
                <li>{t("mint.ruleBindCode")}</li>
                <li className="sm:col-span-2">{t("mint.ruleFollowOfficial")} @{summonXHandle}</li>
              </ul>
            </div>

            {xBound ? (
              <p className="mt-4 text-sm text-silver/72">
                @{stats?.xBinding.xUsername || "x-user"} · {stats?.xBinding.xUserId}
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  disabled={!address || busy === "bindStart"}
                  onClick={startBinding}
                  className="w-fit rounded-md bg-signal px-4 py-3 text-sm font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "bindStart" ? t("mint.generating") : t("mint.startBind")}
                </button>

                {bindStart ? (
                  <div className="grid gap-3">
                    <textarea
                      readOnly
                      value={bindStart.message}
                      className="min-h-24 w-full resize-none rounded-md border border-white/10 bg-black/35 p-4 font-mono text-sm leading-6 text-silver outline-none"
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={copyBindMessage}
                        className="rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-signal hover:text-signal"
                      >
                        {t("mint.copyBind")}
                      </button>
                      <button
                        type="button"
                        onClick={postBindMessage}
                        className="rounded-md border border-plasma/45 px-4 py-3 text-sm font-bold text-plasma transition hover:bg-plasma hover:text-black"
                      >
                        {t("mint.post")}
                      </button>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <input
                        value={bindTweetUrl}
                        onChange={(event) => {
                          setBindTweetUrl(event.target.value.trim());
                          setError("");
                        }}
                        placeholder={t("mint.bindTweetUrl")}
                        className={`min-h-12 flex-1 rounded-md border bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-silver/36 focus:border-signal ${
                          bindTweetUrlLooksValid ? "border-white/10" : "border-red-400/50"
                        }`}
                      />
                      <button
                        type="button"
                        disabled={!trimmedBindTweetUrl || !bindTweetUrlLooksValid || busy === "bindVerify"}
                        onClick={verifyBinding}
                        className="rounded-md bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-signal disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy === "bindVerify" ? t("mint.verifying") : t("mint.verifyBind")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-signal/20 bg-signal/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{t("mint.freeTitle")}</h2>
                <p className="mt-2 text-sm text-silver/70">{t("mint.freeDesc")}</p>
              </div>
              <button
                type="button"
                disabled={!canClaimFree || signing}
                onClick={claimFree}
                className="rounded-md bg-signal px-4 py-3 text-sm font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "freeSignature"
                  ? t("mint.waitSignature")
                  : busy === "freeMint"
                    ? t("mint.minting")
                    : t("mint.claimFree")}
              </button>
            </div>
            <p className="mt-3 text-xs text-silver/52">
              {t("mint.claimed")}: {stats?.freeSharesClaimed || "0"} / {config?.freeSharesPerWalletX || "0.1"} {t("unit.share")}
            </p>
            {freeWrongChain ? (
              <p className="mt-3 text-xs text-red-200">
                {t("mint.freeSwitch", { chain: chainLabel(requiredChainId) })}
              </p>
            ) : null}
          </div>

          {mode === "X_POST" ? (
            <>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white">{t("mint.generateTitle")}</h2>
                    <p className="mt-2 text-sm text-silver/62">{t("mint.generateDesc")}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!canGenerateCode}
                    onClick={generateNonce}
                    className="rounded-md bg-signal px-4 py-3 text-sm font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "nonce"
                      ? t("mint.generating")
                      : nonceData
                        ? t("mint.generateNew")
                        : t("mint.generate")}
                  </button>
                </div>

                <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-4 text-xs leading-6 text-silver/66">
                  <p className="font-bold text-white">{t("mint.mintTweetRulesTitle")}</p>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    <li>@{summonXHandle}</li>
                    <li>@{grokXHandle}</li>
                    <li>{requiredHashtag}</li>
                    <li>{secondaryHashtag}</li>
                    <li>{walletShortLabel}</li>
                    <li>{t("mint.ruleMintCode")}</li>
                    <li>{t("mint.ruleAuthorMatch")}</li>
                    <li>{t("mint.ruleAuthorFollow")} @{summonXHandle}</li>
                  </ul>
                </div>

                {!xBound ? <p className="mt-3 text-xs text-silver/46">{t("mint.bindFirst")}</p> : null}

                {nonceData ? (
                  <div className="mt-5 grid gap-4">
                    <div
                      className={`rounded-md border p-4 ${
                        isExpired ? "border-red-400/40 bg-red-950/25" : "border-signal/30 bg-black/30"
                      }`}
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-signal">{t("mint.code")}</p>
                      <p className="mt-2 font-mono text-lg text-white">{nonceData.nonce}</p>
                      <p className={`mt-2 text-xs ${isExpired ? "text-red-200" : "text-silver/56"}`}>
                        {isExpired
                          ? t("mint.expired")
                          : `${t("mint.expiresIn")} ${formatCountdown(timeRemainingMs)}`}
                      </p>
                    </div>
                    <textarea
                      readOnly
                      value={nonceData.tweetText}
                      className="min-h-44 w-full resize-none rounded-md border border-white/10 bg-black/35 p-4 font-mono text-sm leading-6 text-silver outline-none"
                    />
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={copyTweetText}
                        disabled={isExpired}
                        className="rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("mint.copy")}
                      </button>
                      <button
                        type="button"
                        onClick={openTweetWindow}
                        disabled={isExpired}
                        className="rounded-md border border-plasma/45 px-4 py-3 text-sm font-bold text-plasma transition hover:bg-plasma hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("mint.post")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
                <h2 className="text-xl font-bold text-white">{t("mint.verifyTitle")}</h2>
                <p className="mt-2 text-sm text-silver/62">{t("mint.verifyDesc")}</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={tweetUrl}
                    onChange={(event) => {
                      setTweetUrl(event.target.value.trim());
                      setVerification(null);
                      setPrepared(null);
                      setMintResult(null);
                      setError("");
                    }}
                    placeholder={t("mint.verifyPlaceholder")}
                    className={`min-h-12 flex-1 rounded-md border bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-silver/36 focus:border-signal ${
                      tweetUrlLooksValid ? "border-white/10" : "border-red-400/50"
                    }`}
                  />
                  <button
                    type="button"
                    disabled={!canVerifyTweet}
                    onClick={verifyTweet}
                    className="rounded-md bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-signal disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "verify" ? t("mint.verifying") : t("mint.verify")}
                  </button>
                </div>
                {!address ? <p className="mt-3 text-xs text-silver/46">{t("mint.connectFirst")}</p> : null}
                {address && !nonceData ? (
                  <p className="mt-3 text-xs text-silver/46">{t("mint.generateFirst")}</p>
                ) : null}
                {isExpired ? <p className="mt-3 text-xs text-red-200">{t("mint.expiredHint")}</p> : null}
                {!tweetUrlLooksValid ? (
                  <p className="mt-3 text-xs text-red-200">{t("mint.urlHint")}</p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-plasma/30 bg-plasma/10 p-5 text-sm leading-6 text-silver/76">
              {t("mint.fallbackNotice")}
            </div>
          )}

          {verification?.valid ? (
            <div className="rounded-lg border border-signal/35 bg-black/45 p-5 shadow-glow">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.25em] text-signal">
                    {t("mint.grokVerified")}
                  </p>
                  <p className="mt-3 text-5xl font-black text-white">{verification.score}</p>
                  <p className="mt-1 text-sm text-silver/52">{t("mint.score")}</p>
                </div>
                <span className="rounded-full border border-signal/40 bg-signal/15 px-4 py-2 text-sm font-black text-signal">
                  {verification.mintMultiplier}x
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-silver/52">
                    {t("mint.validTweet")}
                  </p>
                  <p className="mt-2 text-lg font-bold text-white">{t("mint.yes")}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-silver/52">{t("mint.style")}</p>
                  <p className="mt-2 text-lg font-bold text-plasma">{verification.style}</p>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.22em] text-silver/52">
                    {t("mint.estimated")}
                  </p>
                  <p className="mt-2 text-2xl font-black text-signal">
                    {Number(verification.estimatedMintAmount).toLocaleString("en-US")} $SUMMON
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-silver/72">
                {t("mint.reason")}: {verification.reason}
              </p>
              <p className="mt-3 break-all font-mono text-xs text-silver/46">
                {t("mint.tweetId")}: {verification.tweetId}
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{t("mint.mintTitle")}</h2>
                <p className="mt-2 text-sm text-silver/62">{t("mint.mintDesc")}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!canPrepare}
                  onClick={prepareMint}
                  className="rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-signal hover:text-signal disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "prepare" ? t("mint.preparing") : t("mint.prepare")}
                </button>
                <button
                  type="button"
                  disabled={!canMint || signing}
                  onClick={mintSummon}
                  className="rounded-md bg-signal px-4 py-3 text-sm font-bold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mintButtonLabel}
                </button>
              </div>
            </div>
            {prepareBlockedReason ? (
              <p className="mt-3 text-xs text-red-200">{prepareBlockedReason}</p>
            ) : null}

            {wrongChain ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-400/35 bg-red-950/25 p-4 text-sm text-red-100">
                <span>
                  {t("mint.switchBeforeMint", { chain: chainLabel(prepared?.chainId), current: chainId })}
                </span>
                <button
                  type="button"
                  disabled={switchingChain}
                  onClick={() => switchChainAsync({ chainId: prepared?.chainId || 1 })}
                  className="rounded-md bg-white px-3 py-2 text-xs font-bold text-black transition hover:bg-signal disabled:opacity-50"
                >
                  {switchingChain ? t("mint.switching") : t("mint.switchTo", { chain: chainLabel(prepared?.chainId) })}
                </button>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr]">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-silver/52">
                  {t("mint.shareInputLabel")}
                </span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  max={maxInputShares}
                  inputMode="decimal"
                  value={shares}
                  placeholder={t("mint.shareInputPlaceholder", { max: maxInputShares })}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim();
                    if (nextValue === "" || /^-?\d*\.?\d*$/.test(nextValue)) {
                      setShares(nextValue);
                    }
                    setPrepared(null);
                    setMintResult(null);
                    setError("");
                  }}
                  onBlur={() => {
                    if (!shareInputError && shareUnits > 0) setShares(formatShareInput(shareUnits));
                  }}
                  className={`mt-2 min-h-12 w-full rounded-md border bg-black/35 px-4 font-mono text-sm text-white outline-none transition focus:border-signal ${
                    shareInputError ? "border-red-400/50" : "border-white/10"
                  }`}
                />
                {shareInputError ? <p className="mt-2 text-xs text-red-200">{shareInputError}</p> : null}
              </label>
              <div className="rounded-md border border-white/10 bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-silver/52">{t("mint.total")}</p>
                <p className="mt-2 font-mono text-2xl font-black text-white">{totalEth} ETH</p>
                <p className="mt-1 text-xs text-silver/50">{totalWei} wei</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-white/10 bg-black/25 p-3">
                <p className="text-xs text-silver/48">{t("mint.price")}</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {formatWeiToEth(priceWei || "0")} ETH/{t("unit.share")}
                </p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/25 p-3">
                <p className="text-xs text-silver/48">{t("mint.remaining")}</p>
                <p className="mt-1 font-mono text-sm text-white">{remainingShares || "0"} {t("unit.shares")}</p>
              </div>
              <div className="rounded-md border border-white/10 bg-black/25 p-3">
                <p className="text-xs text-silver/48">{t("mint.preparedStatus")}</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {prepared ? `${prepared.shares} ${t("unit.shares")}` : t("mint.notReady")}
                </p>
              </div>
            </div>
            {prepared ? (
              <p className="mt-3 break-all text-xs text-silver/48">
                {t("mint.chain")} {prepared.chainId} / {t("mint.contract")} {prepared.contractAddress || "mock"} /{" "}
                {prepared.mock ? t("mint.mockMint") : t("mint.realMint")}
              </p>
            ) : null}

            {mode === "X_POST" && !verification?.valid ? (
              <p className="mt-4 text-xs text-silver/46">{t("mint.verifyToMint")}</p>
            ) : null}
            {config?.paused ? <p className="mt-4 text-xs text-red-200">{t("mint.paused")}</p> : null}

            {mintResult?.success ? (
              <div className="mt-5 grid gap-4 rounded-md border border-signal/30 bg-signal/10 p-4 text-sm text-silver/80">
                <p className="text-lg font-bold text-white">{t("mint.success")}</p>
                <p>
                  <span className="text-white">{t("mint.mintedAmount")}:</span> {mintResult.shares} {t("unit.shares")}
                </p>
                <p>
                  <span className="text-white">{t("mint.total")}:</span>{" "}
                  {formatWeiToEth(mintResult.totalPaidWei)} ETH
                </p>
                <p className="break-all">
                  <span className="text-white">{t("mint.txHash")}:</span> {mintResult.txHash}
                </p>
                <p>
                  <span className="text-white">{t("mint.mode")}:</span>{" "}
                  {mintResult.isMock ? t("mint.mockMint") : t("mint.realMint")} / {t("mint.chain")} {mintResult.chainId || prepared?.chainId || 1}
                </p>
                <div className="flex flex-wrap gap-3">
                  {mintResult.explorerUrl ? (
                    <a
                      href={mintResult.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-plasma/45 px-4 py-3 text-sm font-bold text-plasma transition hover:bg-plasma hover:text-black"
                    >
                      {t("mint.viewExplorer")}
                    </a>
                  ) : null}
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-signal hover:text-signal"
                  >
                    {t("mint.share")}
                  </a>
                  <Link
                    href="/leaderboard"
                    className="rounded-md bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-signal"
                  >
                    {t("mint.goLeaderboard")}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-md border border-red-400/40 bg-red-950/40 p-4 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
