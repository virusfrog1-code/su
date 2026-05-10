# SUMMON

SUMMON is an X-native / Grok-native AI meme mint MVP.

Core loop:

1. Connect wallet.
2. Generate a wallet-bound summon code.
3. Post on X to summon Grok.
4. Paste the tweet URL.
5. Verify tweet content and Grok score on the backend.
6. Sign a mint confirmation.
7. Backend relayer mints on-chain and records the leaderboard.

## Local setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

## Contract commands

```bash
npm run contracts:compile
npm run contracts:test
npm run contracts:deploy
```

## Production requirements

Production must configure `DATABASE_URL`, `XAI_API_KEY`, `X_BEARER_TOKEN`, `RPC_URL`,
`PRIVATE_KEY_RELAYER`, `SUMMON_TOKEN_ADDRESS`, `MINT_MANAGER_ADDRESS`, `ADMIN_KEY`,
`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_SUMMON_TOKEN_ADDRESS`, and
`NEXT_PUBLIC_MINT_MANAGER_ADDRESS`.

Development-only fallbacks are controlled by `ENABLE_MOCK_X`, `ENABLE_LOCAL_GROK_SCORING`,
and `ENABLE_MOCK_MINT`. They must not be used as production capabilities.

