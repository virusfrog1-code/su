# SUMMON X Post Rules

SUMMON uses X posts as public mint proofs. Users may edit the default post text, but verification only passes when the required authentication tokens remain present.

## Required Bind Tweet Fields

- `@Summon_eth` or the handle configured by `NEXT_PUBLIC_SUMMON_X_HANDLE`
- `@grok` or the handle configured by `NEXT_PUBLIC_GROK_X_HANDLE`
- `#SUMMON`
- `#GrokMint`
- The current wallet short address, for example `0x1234...abcd`
- The full bind code, for example `BIND-9277EEAF`
- `SUMMON` or `$SUMMON`

## Required Mint Tweet Fields

- `@Summon_eth` or the configured official handle
- `@grok` or the configured Grok handle
- `#SUMMON`
- `#GrokMint`
- The current wallet short address
- The full summon code, for example `SUMMON-8F3K2A`
- `SUMMON` or `$SUMMON`

## Why The Official Mention Is Required

The official account mention makes each bind and mint post discoverable by SUMMON. It also gives the project a public trail of posts that can be audited and indexed.

## Why `@grok` Is Required

SUMMON is an X-native and Grok-native mint. The Grok mention makes the summon intent explicit and keeps the mint proof aligned with the project narrative.

## Why Following The Official Account Is Required

Follow verification reduces stolen tweet usage and makes the wallet-to-X relationship stronger. A wallet can only bind one X account, and the X author must follow the official SUMMON account before the bind or mint tweet is accepted.

## Why Tweet URLs Cannot Be Stolen

Each tweet must include a wallet-bound code. The backend checks that:

- The code belongs to the connected wallet.
- The tweet author matches the wallet's bound X author id.
- The author follows the official account.
- The tweet id has not been used before.
- The nonce or bind code has not been used before and is not expired.

Copying another user's tweet URL fails because the author id and wallet-bound code do not match the copied wallet.

## User Edited Tweets

Users can add Chinese text, emoji, images, links, or extra meme copy. SUMMON does not require exact template matching. Verification fails only when required tokens are removed or when author/follow/nonce checks fail.

## Follow Check Modes

Development can use `ENABLE_MOCK_X=true` and `ENABLE_MOCK_X_FOLLOW=true` to simulate a valid follow check. API responses mark mock checks as `method: "mock"`, and the mint page shows a warning.

Production should set:

- `REQUIRE_OFFICIAL_FOLLOW=true`
- `ENABLE_MOCK_X=false`
- `ENABLE_MOCK_X_FOLLOW=false`
- `ALLOW_PRODUCTION_MOCK=false`
- `SUMMON_X_USER_ID=<official X user id>`
- X OAuth or an X API bearer token with permission to read following/follower relationships

If production cannot verify the follow relationship, SUMMON rejects the bind or mint verification instead of silently passing.
