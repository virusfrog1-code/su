import { prisma } from "@/lib/prisma";
import { publicRequiredHashtag, publicRequiredPhrase } from "@/lib/env";

export const CONFIG_KEYS = {
  baseMintAmount: "baseMintAmount",
  dailyWalletMintLimit: "dailyWalletMintLimit",
  mintPaused: "mintPaused",
  requiredHashtag: "requiredHashtag",
  requiredPhrase: "requiredPhrase"
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

const DEFAULTS: Record<ConfigKey, string> = {
  baseMintAmount: "1000000",
  dailyWalletMintLimit: "3",
  mintPaused: "false",
  requiredHashtag: publicRequiredHashtag(),
  requiredPhrase: publicRequiredPhrase()
};

export function allowedConfigKey(key: string): key is ConfigKey {
  return Object.values(CONFIG_KEYS).includes(key as ConfigKey);
}

export async function getConfigValue(key: ConfigKey) {
  try {
    const record = await prisma.systemConfig.findUnique({ where: { key } });
    return record?.value ?? DEFAULTS[key];
  } catch {
    return DEFAULTS[key];
  }
}

export async function setConfigValue(key: ConfigKey, value: string) {
  return prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

export async function getMintConfig() {
  const [baseMintAmount, dailyWalletMintLimit, mintPaused, requiredHashtag, requiredPhrase] =
    await Promise.all([
      getConfigValue(CONFIG_KEYS.baseMintAmount),
      getConfigValue(CONFIG_KEYS.dailyWalletMintLimit),
      getConfigValue(CONFIG_KEYS.mintPaused),
      getConfigValue(CONFIG_KEYS.requiredHashtag),
      getConfigValue(CONFIG_KEYS.requiredPhrase)
    ]);

  return {
    baseMintAmount: Number(baseMintAmount || "1000000"),
    dailyWalletMintLimit: Number(dailyWalletMintLimit || "3"),
    mintPaused: mintPaused === "true",
    requiredHashtag,
    requiredPhrase
  };
}

export function multiplierForScore(score: number) {
  if (score >= 91) return 3;
  if (score >= 71) return 2;
  if (score >= 41) return 1.5;
  return 1;
}

export function amountForScore(baseMintAmount: number, score: number) {
  return Math.round(baseMintAmount * multiplierForScore(score));
}

