# SUMMON Sepolia E2E Test

This is the pre-mainnet rehearsal flow for deploying `MintManager` to Sepolia and completing one real testnet mint while keeping X and Grok in mock mode.

## 1. Configure `.env.local`

Copy `.env.example` to `.env.local`, then fill these values:

```env
SEPOLIA_RPC_URL=
PRIVATE_KEY_DEPLOYER=
PRIVATE_KEY_RELAYER=
AUTHORIZED_SIGNER_PRIVATE_KEY=
AUTHORIZED_SIGNER_ADDRESS=
TREASURY_ADDRESS=
ADMIN_KEY=
DATABASE_URL=
```

Confirm these Sepolia test settings:

```env
CHAIN_ID=11155111
NEXT_PUBLIC_CHAIN_ID=11155111
ENABLE_MOCK_MINT=false
ENABLE_MOCK_X=true
ENABLE_MOCK_GROK=true
ENABLE_MOCK_X_FOLLOW=true
ALLOW_PRODUCTION_MOCK=false
```

`PRIVATE_KEY_DEPLOYER`, `PRIVATE_KEY_RELAYER`, and `AUTHORIZED_SIGNER_PRIVATE_KEY` must never be exposed to the frontend.

## 2. Check Env

```bash
npm run check:env:sepolia
```

The command prints missing or invalid env names only. It does not print private keys.

## 3. Deploy MintManager

```bash
npm run contracts:deploy:sepolia
```

Or run the guarded one-command flow:

```bash
npm run deploy:sepolia:full
```

The deploy script prints:

- `SUMMONToken`
- `MintManager`
- `owner`
- `treasury`
- `authorizedSigner`
- `chainId`
- prices and caps

## 4. Fill Contract Addresses

Set the printed addresses in `.env.local`:

```env
SUMMON_TOKEN_ADDRESS=<printed SUMMONToken address>
MINT_MANAGER_ADDRESS=<printed MintManager address>
NEXT_PUBLIC_MINT_MANAGER_ADDRESS=<printed MintManager address>
```

Keep:

```env
CHAIN_ID=11155111
NEXT_PUBLIC_CHAIN_ID=11155111
ENABLE_MOCK_MINT=false
```

## 5. Check Deployed Contract

```bash
npm run check:contract:sepolia
```

This verifies:

- contract code exists at `MINT_MANAGER_ADDRESS`
- `treasury` matches `TREASURY_ADDRESS`
- `authorizedSigner` matches `AUTHORIZED_SIGNER_ADDRESS`
- `totalShareUnitsCap = 210000`
- `standardPricePerUnitWei = 500000000000000`
- `fallbackPricePerUnitWei = 700000000000000`
- `maxStandardUnitsPerWallet = 1000`
- `maxFallbackUnitsPerWallet = 200`
- `freeShareUnits = 1`

## 6. Optional Verify Source

```bash
npm run contracts:verify:sepolia
```

Manual equivalent:

```bash
npx hardhat verify --network sepolia <SUMMON_TOKEN_ADDRESS> 1000000000000000000000000000000
npx hardhat verify --network sepolia <MINT_MANAGER_ADDRESS> <SUMMON_TOKEN_ADDRESS> <TREASURY_ADDRESS> <AUTHORIZED_SIGNER_ADDRESS>
```

## 7. Start Project

```bash
npm run db:generate
npm run db:deploy
npm run dev
```

Open:

```text
http://localhost:3000/mint
```

## 8. Run Full `/mint` Flow

1. Connect wallet.
2. Switch wallet network to Sepolia when prompted.
3. Start X binding.
4. With `ENABLE_MOCK_X=true`, paste a mock X URL such as:

```text
https://x.com/alice/status/12345678901234567890
```

5. Verify X binding.
6. Generate summon code.
7. Post or mock the summon tweet URL with the same username, for example:

```text
https://x.com/alice/status/12345678901234567891
```

8. Verify Tweet.
9. Enter `0.1` or `1.0` share.
10. Prepare Mint.
11. Sign and Pay.
12. Confirm the backend relayer sends a Sepolia transaction.
13. Confirm the page shows a real Sepolia tx hash.
14. Open the explorer link and confirm it uses `https://sepolia.etherscan.io/tx/`.
15. Confirm `/activity` shows the tx hash.
16. Confirm `/leaderboard` updates the wallet row.
17. Confirm `/api/admin/relayer-status` is healthy.

## 9. Admin Relayer Status

```bash
curl -H "X-Admin-Key: <ADMIN_KEY>" http://localhost:3000/api/admin/relayer-status
```

Expected fields:

- relayer address
- relayer ETH balance
- relayer balance warning when below `0.02 ETH`
- chainId `11155111`
- rpc connected
- MintManager address
- MintManager code exists
- treasury
- authorizedSigner
- paused
- totalShareUnitsMinted
- totalShareUnitsCap

## 10. Pass Criteria

- `ENABLE_MOCK_MINT=false`
- page shows Sepolia Testnet, not Mock Mode
- tx hash exists on Sepolia Etherscan
- treasury receives Sepolia ETH
- duplicate tweet or nonce fails
- relayer has enough Sepolia ETH
- `/activity` and `/leaderboard` update from the successful mint record
