import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Target = "sepolia" | "mainnet";

type Check = {
  name: string;
  required?: boolean;
  expected?: string;
  validate?: (value: string) => string | null;
};

function loadEnvFiles() {
  const envPath = resolve(process.cwd(), ".env");
  const localEnvPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) dotenv.config({ path: envPath });
  if (existsSync(localEnvPath)) dotenv.config({ path: localEnvPath, override: true });
}

function privateKeyError(value: string) {
  return /^0x[0-9a-fA-F]{64}$/.test(value) ? null : "must be a 0x-prefixed 32-byte private key";
}

function addressError(value: string) {
  return isAddress(value) ? null : "must be a valid EVM address";
}

function expectedValue(expected: string) {
  return (value: string) => (value === expected ? null : `expected ${expected}`);
}

function checksForTarget(target: Target): Check[] {
  const shared: Check[] = [
    { name: "PRIVATE_KEY_DEPLOYER", required: true, validate: privateKeyError },
    { name: "PRIVATE_KEY_RELAYER", required: true, validate: privateKeyError },
    { name: "AUTHORIZED_SIGNER_PRIVATE_KEY", required: true, validate: privateKeyError },
    { name: "AUTHORIZED_SIGNER_ADDRESS", required: true, validate: addressError },
    { name: "TREASURY_ADDRESS", required: true, validate: addressError },
    { name: "ENABLE_MOCK_MINT", required: true, expected: "false", validate: expectedValue("false") }
  ];

  if (target === "sepolia") {
    return [
      { name: "SEPOLIA_RPC_URL", required: true },
      ...shared,
      { name: "CHAIN_ID", expected: "11155111", validate: expectedValue("11155111") },
      { name: "NEXT_PUBLIC_CHAIN_ID", required: true, expected: "11155111", validate: expectedValue("11155111") }
    ];
  }

  return [
    { name: "MAINNET_RPC_URL", required: true },
    ...shared,
    { name: "CHAIN_ID", expected: "1", validate: expectedValue("1") },
    { name: "NEXT_PUBLIC_CHAIN_ID", required: true, expected: "1", validate: expectedValue("1") },
    { name: "ENABLE_MOCK_X", required: true, expected: "false", validate: expectedValue("false") },
    { name: "ENABLE_MOCK_GROK", required: true, expected: "false", validate: expectedValue("false") },
    { name: "ALLOW_PRODUCTION_MOCK", required: true, expected: "false", validate: expectedValue("false") },
    { name: "X_BEARER_TOKEN", required: true },
    { name: "XAI_API_KEY", required: true },
    { name: "DATABASE_URL", required: true }
  ];
}

function validateAuthorizedSignerMatch(errors: string[]) {
  const privateKey = process.env.AUTHORIZED_SIGNER_PRIVATE_KEY;
  const expectedAddress = process.env.AUTHORIZED_SIGNER_ADDRESS;
  if (!privateKey || !expectedAddress || privateKeyError(privateKey) || addressError(expectedAddress)) return;
  const derived = privateKeyToAccount(privateKey as `0x${string}`).address;
  if (derived.toLowerCase() !== expectedAddress.toLowerCase()) {
    errors.push("AUTHORIZED_SIGNER_ADDRESS does not match AUTHORIZED_SIGNER_PRIVATE_KEY");
  }
}

function main() {
  loadEnvFiles();
  const target = process.argv[2] as Target | undefined;
  if (target !== "sepolia" && target !== "mainnet") {
    console.error("Usage: tsx scripts/check-env.ts <sepolia|mainnet>");
    process.exitCode = 1;
    return;
  }

  const errors: string[] = [];
  const passed: string[] = [];

  for (const check of checksForTarget(target)) {
    const value = process.env[check.name];
    if (check.required && !value) {
      errors.push(`${check.name} is required`);
      continue;
    }
    if (!value) continue;
    const validationError = check.validate?.(value);
    if (validationError) {
      errors.push(`${check.name}: ${validationError}`);
      continue;
    }
    passed.push(check.expected ? `${check.name}=${check.expected}` : `${check.name}=set`);
  }

  validateAuthorizedSignerMatch(errors);

  if (errors.length > 0) {
    console.error(`SUMMON ${target} env check failed.`);
    for (const error of errors) console.error(`- ${error}`);
    console.error("Secrets were not printed.");
    process.exitCode = 1;
    return;
  }

  console.log(`SUMMON ${target} env check passed.`);
  for (const item of passed) console.log(`- ${item}`);
  console.log("Secrets were checked but not printed.");
}

main();
