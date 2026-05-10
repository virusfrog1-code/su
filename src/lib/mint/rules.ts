export const SHARE_UNITS_PER_SHARE = 10;
export const TOTAL_SHARE_UNITS_CAP = 210_000;
export const STANDARD_PRICE_WEI = 5_000_000_000_000_000n;
export const FALLBACK_PRICE_WEI = 7_000_000_000_000_000n;
export const STANDARD_PRICE_PER_UNIT_WEI = 500_000_000_000_000n;
export const FALLBACK_PRICE_PER_UNIT_WEI = 700_000_000_000_000n;
export const MAX_STANDARD_SHARE_UNITS = 1_000;
export const MAX_FALLBACK_SHARE_UNITS = 200;
export const FREE_SHARE_UNITS = 1;

export type MintMode = "X_POST" | "NO_X_FALLBACK" | "FREE_X";

export type MintRules = {
  totalSharesCap: string;
  totalShareUnitsCap: number;
  standardPriceWei: string;
  standardPricePerUnitWei: string;
  fallbackPriceWei: string;
  fallbackPricePerUnitWei: string;
  maxStandardSharesPerWallet: string;
  maxStandardShareUnits: number;
  maxFallbackSharesPerWallet: string;
  maxFallbackShareUnits: number;
  freeSharesPerWalletX: string;
  freeShareUnits: number;
  paused: boolean;
};

export const DEFAULT_MINT_RULES: MintRules = {
  totalSharesCap: "21000",
  totalShareUnitsCap: TOTAL_SHARE_UNITS_CAP,
  standardPriceWei: STANDARD_PRICE_WEI.toString(),
  standardPricePerUnitWei: STANDARD_PRICE_PER_UNIT_WEI.toString(),
  fallbackPriceWei: FALLBACK_PRICE_WEI.toString(),
  fallbackPricePerUnitWei: FALLBACK_PRICE_PER_UNIT_WEI.toString(),
  maxStandardSharesPerWallet: "100",
  maxStandardShareUnits: MAX_STANDARD_SHARE_UNITS,
  maxFallbackSharesPerWallet: "20",
  maxFallbackShareUnits: MAX_FALLBACK_SHARE_UNITS,
  freeSharesPerWalletX: "0.1",
  freeShareUnits: FREE_SHARE_UNITS,
  paused: false
};

export function parseShareUnits(shares: string) {
  const normalized = shares.trim();
  if (!/^\d+(\.\d)?$/.test(normalized)) {
    throw new Error("Shares must use 0.1 increments");
  }

  const [whole, decimal = "0"] = normalized.split(".");
  const units = Number(whole) * SHARE_UNITS_PER_SHARE + Number(decimal.padEnd(1, "0")[0] || "0");
  if (!Number.isSafeInteger(units) || units <= 0) throw new Error("Shares must be greater than 0");
  return units;
}

export function shareUnitsToShares(units: number) {
  const whole = Math.floor(units / SHARE_UNITS_PER_SHARE);
  const decimal = units % SHARE_UNITS_PER_SHARE;
  return decimal === 0 ? String(whole) : `${whole}.${decimal}`;
}

export function weiForShareUnits(units: number, priceWei: string | bigint) {
  return ((BigInt(units) * BigInt(priceWei)) / BigInt(SHARE_UNITS_PER_SHARE)).toString();
}

export function weiForShareUnitsFromUnitPrice(units: number, pricePerUnitWei: string | bigint) {
  return (BigInt(units) * BigInt(pricePerUnitWei)).toString();
}

export function priceWeiForMode(mode: MintMode, rules: MintRules = DEFAULT_MINT_RULES) {
  if (mode === "NO_X_FALLBACK") return rules.fallbackPriceWei;
  return rules.standardPriceWei;
}

export function pricePerUnitWeiForMode(mode: MintMode, rules: MintRules = DEFAULT_MINT_RULES) {
  if (mode === "NO_X_FALLBACK") return rules.fallbackPricePerUnitWei;
  return rules.standardPricePerUnitWei;
}

export function formatWeiToEth(wei: string | bigint) {
  const value = BigInt(wei);
  const ether = 1_000_000_000_000_000_000n;
  const whole = value / ether;
  const fraction = value % ether;
  if (fraction === 0n) return `${whole}.0`;
  const padded = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${padded}`;
}

export function addBigIntStrings(a: string, b: string) {
  return (BigInt(a || "0") + BigInt(b || "0")).toString();
}
