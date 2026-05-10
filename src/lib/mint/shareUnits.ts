export const SHARE_UNIT_DECIMALS = 10;

export type PaidMintMode = "X_POST" | "NO_X_FALLBACK";

export type ShareUnitConfig = {
  standardPricePerUnitWei: string;
  fallbackPricePerUnitWei: string;
  maxStandardShareUnits: number;
  maxFallbackShareUnits: number;
  totalShareUnitsCap: number;
};

export type WalletShareStats = {
  paidStandardUnits?: number;
  paidFallbackUnits?: number;
  remainingStandardShares?: string;
  remainingFallbackShares?: string;
};

export function parseSharesToUnits(input: string): number {
  const normalized = input.trim();
  if (!normalized) throw new Error("Shares are required");
  if (!/^\d+(\.\d)?$/.test(normalized)) {
    throw new Error("Shares must use 0.1 increments");
  }

  const [whole, decimal = "0"] = normalized.split(".");
  const units = Number(whole) * SHARE_UNIT_DECIMALS + Number(decimal[0] || "0");
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new Error("Shares must be at least 0.1");
  }
  return units;
}

export function formatUnitsToShares(units: number): string {
  const safeUnits = Math.max(0, Math.trunc(units));
  const whole = Math.floor(safeUnits / SHARE_UNIT_DECIMALS);
  const decimal = safeUnits % SHARE_UNIT_DECIMALS;
  return decimal === 0 ? String(whole) : `${whole}.${decimal}`;
}

export function isValidShareInput(input: string): boolean {
  try {
    parseSharesToUnits(input);
    return true;
  } catch {
    return false;
  }
}

export function getMaxInputShares(
  mode: PaidMintMode,
  walletStats: WalletShareStats,
  config: ShareUnitConfig,
  totalShareUnitsMinted = 0
): string {
  const walletRemainingUnits =
    mode === "X_POST"
      ? parseOptionalUnits(walletStats.remainingStandardShares, config.maxStandardShareUnits)
      : parseOptionalUnits(walletStats.remainingFallbackShares, config.maxFallbackShareUnits);
  const modeMaxUnits = mode === "X_POST" ? config.maxStandardShareUnits : config.maxFallbackShareUnits;
  const totalRemainingUnits = Math.max(0, config.totalShareUnitsCap - totalShareUnitsMinted);
  return formatUnitsToShares(Math.min(walletRemainingUnits, modeMaxUnits, totalRemainingUnits));
}

export function calculatePayableWei(
  mode: PaidMintMode,
  shareUnits: number,
  config: Pick<ShareUnitConfig, "standardPricePerUnitWei" | "fallbackPricePerUnitWei">
): bigint {
  const pricePerUnitWei =
    mode === "X_POST" ? config.standardPricePerUnitWei : config.fallbackPricePerUnitWei;
  return BigInt(shareUnits) * BigInt(pricePerUnitWei);
}

function parseOptionalUnits(value: string | undefined, fallbackUnits: number) {
  if (!value) return fallbackUnits;
  try {
    return parseSharesToUnits(value);
  } catch {
    return fallbackUnits;
  }
}
