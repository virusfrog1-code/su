// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Phase two placeholder. Do not deploy as production delegate logic.
/// Future goals:
/// - User signs one limited authorization.
/// - SUMMON Agent executes verified mint actions only.
/// - Gas sponsorship, batched actions, and revocation support.
contract Summon7702Delegate {
    error Summon7702NotEnabled();

    function executeSummonMint(bytes calldata) external pure {
        revert Summon7702NotEnabled();
    }
}

