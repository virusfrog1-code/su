import { defineChain } from "viem";
import { mainnet, sepolia } from "wagmi/chains";

export function getConfiguredChainId() {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || "1");
}

const configuredChainId = getConfiguredChainId();

export function getConfiguredRpcUrl() {
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return process.env.NEXT_PUBLIC_RPC_URL;
  }

  if (configuredChainId === mainnet.id) {
    return mainnet.rpcUrls.default.http[0];
  }

  if (configuredChainId === sepolia.id) {
    return sepolia.rpcUrls.default.http[0];
  }

  return "http://127.0.0.1:8545";
}

export const configuredChain =
  configuredChainId === mainnet.id
    ? mainnet
    : configuredChainId === sepolia.id
      ? sepolia
      : defineChain({
          id: configuredChainId,
          name: `SUMMON Chain ${configuredChainId}`,
          nativeCurrency: {
            decimals: 18,
            name: "Ether",
            symbol: "ETH"
          },
          rpcUrls: {
            default: {
              http: [getConfiguredRpcUrl()]
            }
          }
        });

export const configuredChainRpcUrl = getConfiguredRpcUrl();
