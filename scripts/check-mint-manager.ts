import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, defineChain, http, isAddress, type Address } from "viem";
import { mintManagerAbi } from "../src/lib/chain/mintManager";

type Target = "sepolia" | "mainnet";

const expectedValues = {
  totalShareUnitsCap: "210000",
  standardPricePerUnitWei: "500000000000000",
  fallbackPricePerUnitWei: "700000000000000",
  maxStandardUnitsPerWallet: "1000",
  maxFallbackUnitsPerWallet: "200",
  freeShareUnits: "1"
} as const;

function loadEnvFiles() {
  const envPath = resolve(process.cwd(), ".env");
  const localEnvPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) dotenv.config({ path: envPath });
  if (existsSync(localEnvPath)) dotenv.config({ path: localEnvPath, override: true });
}

function targetConfig(target: Target) {
  if (target === "sepolia") {
    return {
      chainId: 11155111,
      name: "Sepolia Testnet",
      rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.RPC_URL
    };
  }
  return {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrl: process.env.MAINNET_RPC_URL || process.env.RPC_URL
  };
}

function fail(messages: string[]) {
  console.error("MintManager contract check failed.");
  for (const message of messages) console.error(`- ${message}`);
  process.exitCode = 1;
}

async function main() {
  loadEnvFiles();
  const target = process.argv[2] as Target | undefined;
  if (target !== "sepolia" && target !== "mainnet") {
    fail(["Usage: tsx scripts/check-mint-manager.ts <sepolia|mainnet>"]);
    return;
  }

  const errors: string[] = [];
  const { chainId, name, rpcUrl } = targetConfig(target);
  const address = process.env.MINT_MANAGER_ADDRESS;
  const expectedTreasury = process.env.TREASURY_ADDRESS;
  const expectedSigner = process.env.AUTHORIZED_SIGNER_ADDRESS;

  if (!rpcUrl) errors.push(target === "sepolia" ? "SEPOLIA_RPC_URL or RPC_URL is required" : "MAINNET_RPC_URL or RPC_URL is required");
  if (!address) errors.push("MINT_MANAGER_ADDRESS is required");
  else if (!isAddress(address)) errors.push("MINT_MANAGER_ADDRESS must be a valid EVM address");
  if (!expectedTreasury) errors.push("TREASURY_ADDRESS is required");
  else if (!isAddress(expectedTreasury)) errors.push("TREASURY_ADDRESS must be a valid EVM address");
  if (!expectedSigner) errors.push("AUTHORIZED_SIGNER_ADDRESS is required");
  else if (!isAddress(expectedSigner)) errors.push("AUTHORIZED_SIGNER_ADDRESS must be a valid EVM address");
  if (errors.length > 0) {
    fail(errors);
    return;
  }

  const chain = defineChain({
    id: chainId,
    name,
    nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
    rpcUrls: { default: { http: [rpcUrl as string] } }
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl as string) });
  const mintManagerAddress = address as Address;

  const [connectedChainId, code, treasury, authorizedSigner, paused, totalShareUnitsCap, standardPricePerUnitWei, fallbackPricePerUnitWei, maxStandardUnitsPerWallet, maxFallbackUnitsPerWallet, freeShareUnits] =
    await Promise.all([
      publicClient.getChainId(),
      publicClient.getCode({ address: mintManagerAddress }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "treasury" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "authorizedSigner" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "paused" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "totalShareUnitsCap" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "standardPricePerUnitWei" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "fallbackPricePerUnitWei" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "maxStandardUnitsPerWallet" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "maxFallbackUnitsPerWallet" }),
      publicClient.readContract({ address: mintManagerAddress, abi: mintManagerAbi, functionName: "freeShareUnits" })
    ]);

  if (connectedChainId !== chainId) errors.push(`RPC chainId is ${connectedChainId}, expected ${chainId}`);
  if (!code || code === "0x") errors.push("MINT_MANAGER_ADDRESS has no contract code");
  if ((treasury as string).toLowerCase() !== (expectedTreasury as string).toLowerCase()) {
    errors.push("treasury does not match TREASURY_ADDRESS");
  }
  if ((authorizedSigner as string).toLowerCase() !== (expectedSigner as string).toLowerCase()) {
    errors.push("authorizedSigner does not match AUTHORIZED_SIGNER_ADDRESS");
  }

  const observed = {
    totalShareUnitsCap: totalShareUnitsCap.toString(),
    standardPricePerUnitWei: standardPricePerUnitWei.toString(),
    fallbackPricePerUnitWei: fallbackPricePerUnitWei.toString(),
    maxStandardUnitsPerWallet: maxStandardUnitsPerWallet.toString(),
    maxFallbackUnitsPerWallet: maxFallbackUnitsPerWallet.toString(),
    freeShareUnits: freeShareUnits.toString()
  };

  for (const [key, expected] of Object.entries(expectedValues)) {
    const actual = observed[key as keyof typeof observed];
    if (actual !== expected) errors.push(`${key} is ${actual}, expected ${expected}`);
  }

  if (errors.length > 0) {
    fail(errors);
    return;
  }

  console.log(`MintManager ${target} contract check passed.`);
  console.log(`- address: ${mintManagerAddress}`);
  console.log(`- chainId: ${connectedChainId}`);
  console.log(`- treasury: ${treasury}`);
  console.log(`- authorizedSigner: ${authorizedSigner}`);
  console.log(`- paused: ${paused}`);
  for (const [key, value] of Object.entries(observed)) console.log(`- ${key}: ${value}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
