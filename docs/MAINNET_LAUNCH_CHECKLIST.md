# SUMMON Mainnet Launch Checklist

## 1. Before Contract Deployment

- Confirm treasury address.
- Confirm authorizedSigner address.
- Confirm deployer wallet.
- Confirm relayer wallet.
- Confirm standard price: `0.005 ETH/share`.
- Confirm fallback price: `0.007 ETH/share`.
- Confirm total cap: `21000 shares`.
- Confirm X_POST max allocation: `100 shares`.
- Confirm fallback max allocation: `20 shares`.
- Confirm free claim: `0.1 share`.
- Confirm `1 share = 10 shareUnits`.
- Confirm `totalShareUnitsCap = 210000`.
- Confirm `standardPricePerUnitWei = 500000000000000`.
- Confirm `fallbackPricePerUnitWei = 700000000000000`.

## 2. After Contract Deployment

- Record SUMMONToken address.
- Record MintManager address.
- Verify owner.
- Verify treasury.
- Verify authorizedSigner.
- Verify `paused=false`, or set planned pause state.
- Verify source code on Etherscan.
- Test one small X_POST mint.
- Test one fallback mint.
- Test free claim.
- Test pause blocks minting.
- Test duplicate nonce fails.
- Test duplicate tweetId fails.
- Test bad payment fails.
- Test wrong signer fails.
- Confirm treasury receives ETH.

## 3. Backend Production Environment

Required:

```env
DATABASE_URL=
X_BEARER_TOKEN=
XAI_API_KEY=
MAINNET_RPC_URL=
RPC_URL=
CHAIN_ID=1
PRIVATE_KEY_RELAYER=
AUTHORIZED_SIGNER_PRIVATE_KEY=
AUTHORIZED_SIGNER_ADDRESS=
TREASURY_ADDRESS=
SUMMON_TOKEN_ADDRESS=
MINT_MANAGER_ADDRESS=
NEXT_PUBLIC_MINT_MANAGER_ADDRESS=
NEXT_PUBLIC_CHAIN_ID=1
ENABLE_MOCK_MINT=false
ENABLE_MOCK_X=false
ENABLE_MOCK_GROK=false
ALLOW_PRODUCTION_MOCK=false
ADMIN_KEY=
```

Do not expose:

- `PRIVATE_KEY_RELAYER`
- `AUTHORIZED_SIGNER_PRIVATE_KEY`
- `XAI_API_KEY`
- `X_BEARER_TOKEN`
- `ADMIN_KEY`

## 4. Database

Run:

```bash
npm run db:generate
npm run db:deploy
```

Check tables:

- `MintRecord`
- `WalletXBinding`
- `TweetVerification`
- `WalletMintStats`
- `GlobalMintStats`
- `SummonNonce`
- `MintConfig`

## 5. Frontend Production

- Confirm `NEXT_PUBLIC_CHAIN_ID=1`.
- Confirm page displays Ethereum Mainnet.
- Confirm wrong wallet network shows Switch Network.
- Confirm Mock Mode is not displayed.
- Confirm Etherscan links use `https://etherscan.io`.

## 6. Production Mock Safety

- `ENABLE_MOCK_MINT=false`
- `ENABLE_MOCK_X=false`
- `ENABLE_MOCK_GROK=false`
- `ALLOW_PRODUCTION_MOCK=false`

Expected behavior:

- production with `ENABLE_MOCK_MINT=true` and `ALLOW_PRODUCTION_MOCK!=true` rejects.
- production with `ENABLE_MOCK_X=true` and `ALLOW_PRODUCTION_MOCK!=true` rejects.
- production with `ENABLE_MOCK_GROK=true` and `ALLOW_PRODUCTION_MOCK!=true` rejects.

## 7. Launch Verification

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run contracts:test`
- `npm run contracts:deploy:mainnet`
- `npm run contracts:verify:mainnet`

Manual verify equivalent:

```bash
npx hardhat verify --network mainnet <SUMMON_TOKEN_ADDRESS> 1000000000000000000000000000000
npx hardhat verify --network mainnet <MINT_MANAGER_ADDRESS> <SUMMON_TOKEN_ADDRESS> <TREASURY_ADDRESS> <AUTHORIZED_SIGNER_ADDRESS>
```

## 8. After Launch Monitoring

- relayer ETH balance.
- mint API error rate.
- failed tx count.
- duplicate tweet reject count.
- duplicate nonce reject count.
- X API rate limit.
- Grok API rate limit.
- totalSharesMinted.
- totalShareUnitsMinted.
- treasury ETH receipts.
- activity sync.
- leaderboard sync.
- admin relayer status endpoint.

## 9. Emergency Actions

- Pause MintManager with owner wallet.
- Rotate authorizedSigner if signing key is suspected compromised.
- Rotate relayer if relayer key is suspected compromised.
- Confirm stuck ETH withdrawal only for emergency recovery.
