"use client";

import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  walletConnectWallet
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { WagmiProvider, http, useAccount, useConnect } from "wagmi";
import { configuredChain, configuredChainRpcUrl } from "@/lib/chain/config";
import { I18nProvider } from "@/lib/i18n";

const appName = process.env.NEXT_PUBLIC_PROJECT_NAME || "SUMMON";
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "summon-local";

const config = getDefaultConfig({
  appName,
  projectId,
  wallets: [
    {
      groupName: "Recommended",
      wallets: [okxWallet, injectedWallet, metaMaskWallet, walletConnectWallet, coinbaseWallet]
    }
  ],
  chains: [configuredChain],
  transports: {
    [configuredChain.id]: http(configuredChainRpcUrl)
  },
  multiInjectedProviderDiscovery: true,
  ssr: true
});

type EthereumProvider = {
  request?: (args: { method: string }) => Promise<unknown>;
};

function WalletAutoConnect() {
  const attempted = useRef(false);
  const { isConnected } = useAccount();
  const { connect, connectors, status } = useConnect();

  useEffect(() => {
    if (attempted.current || isConnected || status === "pending") {
      return;
    }

    attempted.current = true;

    async function connectAuthorizedInjectedWallet() {
      for (const connector of connectors) {
        const connectorName = connector.name.toLowerCase();
        const isInjectedLike =
          connector.id.toLowerCase().includes("injected") ||
          connectorName.includes("okx") ||
          connectorName.includes("injected") ||
          connectorName.includes("metamask");

        if (!isInjectedLike) {
          continue;
        }

        try {
          const provider = (await connector.getProvider()) as EthereumProvider | undefined;
          const accounts = provider?.request
            ? await provider.request({ method: "eth_accounts" })
            : [];

          if (Array.isArray(accounts) && accounts.length > 0) {
            connect({ connector });
            return;
          }
        } catch {
          // Ignore unavailable injected providers and keep the normal connect button path.
        }
      }
    }

    void connectAuthorizedInjectedWallet();
  }, [connect, connectors, isConnected, status]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <WalletAutoConnect />
        <RainbowKitProvider>
          <I18nProvider>{children}</I18nProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
