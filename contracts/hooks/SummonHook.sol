// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Phase two placeholder. Uniswap V4 Hook logic is intentionally not enabled in MVP.
/// Future mechanics may include trade-to-burn, meme jackpot, holder rewards,
/// anti-bot launch phases, and tweet holder rewards.
contract SummonHook {
    error SummonHookNotEnabled();

    function hookEntrypoint(bytes calldata) external pure {
        revert SummonHookNotEnabled();
    }
}

