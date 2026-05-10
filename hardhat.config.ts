import dotenv from "dotenv";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const deployerPrivateKey = process.env.PRIVATE_KEY_DEPLOYER || process.env.PRIVATE_KEY_RELAYER;
const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    summon: {
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
      chainId: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined,
      accounts
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || "",
      chainId: 11155111,
      accounts
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || process.env.RPC_URL || "",
      chainId: 1,
      accounts
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || ""
  }
};

export default config;
