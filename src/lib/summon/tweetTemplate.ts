import { shortAddress } from "@/lib/utils";
import {
  publicGrokXHandle,
  publicRequiredHashtag,
  publicRequiredSecondaryHashtag,
  publicSummonXHandle
} from "@/lib/env";

function atHandle(handle: string) {
  return `@${handle.replace(/^@/, "")}`;
}

export function buildTweetText(walletAddress: string, nonce: string) {
  const summonHandle = atHandle(publicSummonXHandle());
  const grokHandle = atHandle(publicGrokXHandle());
  return [
    `I just summoned ${grokHandle} to mint $SUMMON through ${summonHandle}.`,
    "",
    "The first X-native AI meme mint experiment:",
    "Post on X.",
    "Summon Grok.",
    "Mint on-chain.",
    "",
    `Wallet: ${shortAddress(walletAddress)}`,
    `Summon Code: ${nonce}`,
    "",
    `${publicRequiredHashtag()} ${publicRequiredSecondaryHashtag()} #AIMeme`
  ].join("\n");
}

export function buildBindTweetText(walletAddress: string, bindCode: string) {
  const summonHandle = atHandle(publicSummonXHandle());
  const grokHandle = atHandle(publicGrokXHandle());
  return [
    `I am binding my wallet to ${summonHandle} for the $SUMMON AI-native mint.`,
    "",
    "Post to Summon.",
    "Summon Grok.",
    "Mint on-chain.",
    "",
    `Wallet: ${shortAddress(walletAddress)}`,
    `Bind Code: ${bindCode}`,
    "",
    `${grokHandle} ${publicRequiredHashtag()} ${publicRequiredSecondaryHashtag()} #AIMeme`
  ].join("\n");
}

export function buildTweetIntentUrl(tweetText: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
}

export function buildMintMessage(input: {
  walletAddress: string;
  mode: string;
  shares: string;
  totalWei: string;
  tweetId?: string;
  nonce?: string;
}) {
  return [
    "SUMMON Mint Request",
    `Wallet: ${input.walletAddress}`,
    `Mode: ${input.mode}`,
    `Shares: ${input.shares}`,
    `Total Wei: ${input.totalWei}`,
    `Tweet ID: ${input.tweetId || "none"}`,
    `Nonce: ${input.nonce || "none"}`
  ].join("\n");
}

export function buildFreeClaimMessage(input: {
  walletAddress: string;
  xUserId: string;
  shares: string;
}) {
  return [
    "SUMMON Free Claim",
    `Wallet: ${input.walletAddress}`,
    `X User ID: ${input.xUserId}`,
    `Shares: ${input.shares}`
  ].join("\n");
}
